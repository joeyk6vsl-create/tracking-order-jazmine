import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { TrackingLinkService } from '../../apps/server/src/tracking/link-service';
import { PublicTrackingService } from '../../apps/server/src/tracking/public-service';
import { CustomerRequestService } from '../../apps/server/src/tracking/request-service';
import { ReportService } from '../../apps/server/src/reports/report-service';
import { SearchService } from '../../apps/server/src/search/search-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import {
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { reportQuerySchema } from '../../packages/contracts/src/reports';
import { sheetSchema } from '../../packages/contracts/src/production';
import { receiptSchema, refundSchema } from '../../packages/contracts/src/settlement';
import {
  reviewRequestSchema,
  customerRequestSchema,
  issueLinkSchema,
} from '../../packages/contracts/src/tracking';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
import { createApplication } from '../../apps/server/src/app';
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
const command = () => ({ requestId: randomUUID(), reason: 'ทดสอบตามแผน W9' });
test('public HTTP verifies CSRF, scoped secure cookie and token binding; production policy permits protected mockup images only', async () => {
  const f = await productionFixture();
  const origin = 'https://shop.example';
  const app = await createApplication(
    { production: true, origin, port: 3102, dataDir: ':memory:' },
    f.db,
    false,
  );
  try {
    const links = new TrackingLinkService(f.db),
      created = await links.issue(f.owner, f.order.id, { ...command(), days: 1 }),
      token = String(created.token);
    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session' }),
      csrf = session.json().csrfToken;
    assert.match(String(session.headers['content-security-policy']), /img-src[^;]*blob:/);
    const csrfCookie = '__Host-jazmine_csrf=' + csrf;
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/v1/public-tracking/verify',
      payload: { token, phone: f.input.phone },
    });
    assert.equal(noCsrf.statusCode, 403);
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/public-tracking/verify',
      headers: { origin, cookie: csrfCookie, 'x-csrf-token': csrf },
      payload: { token, phone: f.input.phone },
    });
    assert.equal(verified.statusCode, 201);
    const access = verified.cookies.find((c) => c.name === '__Secure-jazmine_tracking');
    assert(access);
    assert.equal(access.secure, true);
    assert.equal(access.httpOnly, true);
    assert.equal(access.path, '/api/v1/public-tracking');
    const cookie = access.name + '=' + access.value;
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/public-tracking/view',
          headers: { cookie },
        })
      ).statusCode,
      403,
    );
    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/public-tracking/view',
      headers: { cookie, 'x-tracking-token': token },
    });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().orderNumber, f.order.orderNumber);
    assert.equal(read.headers['cache-control'], 'no-store');
    assert.equal(read.headers['referrer-policy'], 'no-referrer');
    assert.equal(read.body.includes(f.order.invoiceNumber), false);
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/reports/summary?from=2026-11-01&to=2026-11-01',
          headers: { cookie },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/public-tracking/mockup',
          headers: { cookie, 'x-tracking-token': token },
        })
      ).headers['content-type'],
      'image/png',
    );
  } finally {
    await app.close();
    await f.db.close();
  }
});
test('tracking requires random link plus confirmed phone, stores only hashes, limits guesses and revokes all sessions', async () => {
  const f = await productionFixture();
  try {
    const links = new TrackingLinkService(f.db),
      tracking = new PublicTrackingService(f.db);
    const input = { ...command(), days: 30 };
    await assert.rejects(
      links.issue(f.actors.GRAPHIC, f.order.id, input),
      code('PERMISSION_DENIED'),
    );
    const created = await links.issue(f.actors.ADMIN, f.order.id, input),
      token = String(created.token);
    assert.equal(token.length, 43);
    const replay = await links.issue(f.actors.ADMIN, f.order.id, input);
    assert.equal(replay.token, undefined);
    await assert.rejects(tracking.view(undefined, token), code('TRACKING_UNAVAILABLE'));
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        links.verify({ token, phone: 'wrong' }, 'bad-ip'),
        code('TRACKING_UNAVAILABLE'),
      );
    await assert.rejects(
      links.verify({ token, phone: f.input.phone }, 'bad-ip'),
      code('TRACKING_RATE_LIMIT'),
    );
    const session = await links.verify({ token, phone: '໐໒໐ ໕໕໕໕ ໑໒໓໔' }, 'good-ip');
    const publicView = await tracking.view(session, token);
    assert.equal(publicView.orderNumber, f.order.orderNumber);
    assert.equal(publicView.quantity, 11);
    assert.equal(publicView.readyQuantity, 0);
    for (const forbidden of [
      'orderId',
      'phone',
      'invoiceNumber',
      'snapshot',
      'pricing',
      'operators',
      'exceptions',
      'sheetNumber',
    ])
      assert.equal(forbidden in publicView, false);
    assert.equal((await tracking.mockup(session, token)).mime, 'image/png');
    await assert.rejects(
      tracking.view(session, randomBytes(32).toString('base64url')),
      code('TRACKING_UNAVAILABLE'),
    );
    const raw =
      JSON.stringify(await f.db.query('SELECT * FROM tracking_links')) +
      JSON.stringify(await f.db.query('SELECT * FROM tracking_sessions')) +
      JSON.stringify(await f.db.query('SELECT * FROM tracking_commands')) +
      JSON.stringify(
        await f.db.query("SELECT detail FROM audit_events WHERE action LIKE 'TRACKING_%'"),
      );
    assert.equal(raw.includes(token), false);
    assert.equal(raw.includes(session), false);
    await f.finish(f.id);
    assert.equal((await tracking.view(session, token)).readyQuantity, 11);
    assert((await tracking.view(session, token)).production.every((s) => s.state === 'COMPLETED'));
    // ส่งไปแล้วบางส่วน แต่ยกเลิกใบผลิตต้นทางเพื่อเตรียมงานใหม่ ต้องไม่แสดงว่าทุกอย่างยังไม่เริ่ม
    const ships = new ShipmentService(f.db),
      settlements = new SettlementService(f.db);
    const base = async () => {
      const v = await settlements.detail(f.owner, f.order.id);
      return { ...command(), expectedVersion: v.version, orderRevision: v.revision };
    };
    const prepared = (await ships.prepare(
      f.owner,
      f.order.id,
      shipmentPrepareSchema.parse({
        ...(await base()),
        method: 'CUSTOMER_PICKUP',
        recipient: 'ผู้รับทดสอบ',
        phone: '',
        address: '',
        carrier: '',
        tracking: '',
        notes: '',
        items: [{ lineIndex: 0, quantity: 3 }],
      }),
    )) as { shipmentId: string };
    await ships.confirm(
      f.owner,
      f.order.id,
      prepared.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    const sheet = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      f.id,
      sheet.rowVersion,
      'ตรวจงานที่ยังไม่ส่งใหม่',
      'cancel',
    );
    const partial = await tracking.view(session, token);
    assert.equal(partial.confirmedQuantity, 3);
    assert(partial.production.every((stage) => stage.state === 'IN_PROGRESS'));
    // อีกบางส่วนผ่าน QC แล้ว แต่ส่วนที่เหลือยังเป็นร่าง ต้องไม่อ้างว่าทุกขั้นจบทั้งออเดอร์
    const nextSheet = randomUUID();
    await f.production.save(
      f.actors.GRAPHIC,
      nextSheet,
      sheetSchema.parse({ ...f.sheetInput, allocations: [{ lineIndex: 0, quantity: 5 }] }),
    );
    await f.publish(nextSheet);
    await f.finish(nextSheet);
    await f.production.save(
      f.actors.GRAPHIC,
      randomUUID(),
      sheetSchema.parse({ ...f.sheetInput, allocations: [{ lineIndex: 0, quantity: 3 }] }),
    );
    const split = await tracking.view(session, token);
    assert.equal(split.readyQuantity, 5);
    assert(split.production.every((stage) => stage.state === 'IN_PROGRESS'));
    await links.revoke(f.owner, f.order.id, command());
    await assert.rejects(tracking.view(session, token), code('TRACKING_UNAVAILABLE'));
    const next = await links.issue(f.owner, f.order.id, { ...command(), days: 1 });
    await f.db.query("UPDATE tracking_links SET expires_at=now()-interval '1 minute' WHERE id=$1", [
      next.id,
    ]);
    await assert.rejects(
      links.verify({ token: String(next.token), phone: f.input.phone }, 'fresh-ip'),
      code('TRACKING_UNAVAILABLE'),
    );
  } finally {
    await f.db.close();
  }
});
test('public requests retry once, bound each order and require separate authorized review without mutating production/shipping', async () => {
  const f = await productionFixture();
  try {
    const links = new TrackingLinkService(f.db),
      requests = new CustomerRequestService(f.db),
      tracking = new PublicTrackingService(f.db);
    const link = await links.issue(f.owner, f.order.id, { ...command(), days: 30 }),
      token = String(link.token),
      session = await links.verify({ token, phone: f.input.phone }, 'test');
    assert.equal(
      customerRequestSchema.safeParse({ ...command(), kind: 'CHANGE_SIZE', message: 'XXL' })
        .success,
      false,
    );
    assert.equal(issueLinkSchema.safeParse({ ...command(), days: 91 }).success, false);
    const input = customerRequestSchema.parse({
      requestId: randomUUID(),
      kind: 'EXPEDITE',
      message: '<script>ไม่ใช่ HTML</script> ขอเร่งงาน',
    });
    await requests.submit(session, token, input);
    await requests.submit(session, token, input);
    assert.equal((await f.db.query('SELECT id FROM customer_requests')).length, 1);
    await assert.rejects(
      requests.submit(session, token, { ...input, message: 'เปลี่ยนข้อความ' }),
      code('REQUEST_CONFLICT'),
    );
    const listed = await requests.list(f.actors.ADMIN, { state: 'SUBMITTED', page: 1 }),
      request = listed.requests[0];
    await assert.rejects(
      requests.list(f.actors.PRINTING, { state: 'ALL', page: 1 }),
      code('PERMISSION_DENIED'),
    );
    const start = reviewRequestSchema.parse({
      ...command(),
      rowVersion: 1,
      action: 'START_REVIEW',
      response: 'กำลังตรวจงาน',
    });
    await requests.review(f.actors.ADMIN, request.id, start);
    await requests.review(f.actors.ADMIN, request.id, start);
    await assert.rejects(
      requests.review(f.owner, request.id, { ...start, ...command() }),
      code('STALE_STATE'),
    );
    await requests.review(
      f.actors.ADMIN,
      request.id,
      reviewRequestSchema.parse({
        ...command(),
        rowVersion: 2,
        action: 'RESOLVE',
        outcome: 'APPROVED',
        response: 'รับทราบ จะติดต่อกลับเรื่องกำหนดส่ง',
      }),
    );
    const view = await tracking.view(session, token);
    assert.equal(view.requests[0].state, 'RESOLVED');
    assert.equal(view.requests[0].outcome, 'APPROVED');
    assert.equal((await f.db.query('SELECT id FROM shipments')).length, 0);
    assert.equal((await f.db.query('SELECT id FROM production_stage_events')).length, 0);
    for (let i = 1; i < 10; i++)
      await requests.submit(session, token, { ...input, requestId: randomUUID() });
    await assert.rejects(
      requests.submit(session, token, { ...input, requestId: randomUUID() }),
      code('REQUEST_LIMIT'),
    );
    // เปลี่ยนฉบับยืนยันแล้วต้องตรวจโทรศัพท์อีกครั้ง ไม่รับ session เก่าไปใช้กับข้อมูลใหม่
    await f.db.query('UPDATE tracking_sessions SET order_revision=999');
    await assert.rejects(tracking.view(session, token), code('TRACKING_UNAVAILABLE'));
  } finally {
    await f.db.close();
  }
});
test('owner reports separate latest order value from dated active cash/refunds and never invent profit', async () => {
  const f = await productionFixture();
  try {
    const reports = new ReportService(f.db),
      payments = new PaymentService(f.db),
      settlements = new SettlementService(f.db),
      today = businessDate(),
      query = { from: today, to: today, page: 1 };
    assert.equal(
      reportQuerySchema.safeParse({ ...query, from: '2025-01-01', to: '2026-11-01' }).success,
      false,
    );
    await assert.rejects(reports.read(f.actors.ADMIN, query), code('PERMISSION_DENIED'));
    let v = await settlements.detail(f.owner, f.order.id);
    const receipt = (await payments.receipt(
      f.owner,
      f.order.id,
      receiptSchema.parse({
        ...command(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        purpose: 'DEPOSIT',
        currency: 'LAK',
        amount: '100000',
        method: 'TRANSFER',
        reference: '',
        occurredAt: today + 'T23:59:59+07:00',
        rateRevision: v.rates.revision,
      }),
    )) as { entryId: string };
    v = await settlements.detail(f.owner, f.order.id);
    await payments.refund(
      f.owner,
      f.order.id,
      refundSchema.parse({
        ...command(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        receiptId: receipt.entryId,
        amount: '10000',
        method: 'CASH',
        reference: '',
        occurredAt: today + 'T00:00:00+07:00',
      }),
    );
    v = await settlements.detail(f.owner, f.order.id);
    const report = await reports.read(f.owner, query);
    assert.equal(report.orders, 1);
    assert.equal(report.quantity, 11);
    assert.equal(report.sales, v.money.total);
    assert.equal(report.received, '100000');
    assert.equal(report.refunded, '10000');
    assert.equal(report.netCash, '90000');
    assert.equal(report.outstanding, v.money.due);
    assert.equal(report.rows[0].due, v.money.due);
    assert.equal(report.profit, null);
    assert.equal(report.costStatus, 'INCOMPLETE');
    assert.equal(report.trend[0].date, today);
  } finally {
    await f.db.close();
  }
});
test('historical balances retain then-valid receipts even if voided later and exclude late backdated records', async () => {
  const f = await productionFixture();
  try {
    const reports = new ReportService(f.db),
      payments = new PaymentService(f.db),
      settlements = new SettlementService(f.db);
    await f.db.query(
      "UPDATE order_revisions SET confirmed_at='2025-12-20T12:00:00+07:00' WHERE order_id=$1",
      [f.order.id],
    );
    const initial = await settlements.detail(f.owner, f.order.id),
      query = { from: '2025-12-01', to: '2025-12-31', page: 1 };
    const receipt = (await payments.receipt(
      f.owner,
      f.order.id,
      receiptSchema.parse({
        ...command(),
        expectedVersion: 0,
        orderRevision: 1,
        purpose: 'PAYMENT',
        currency: 'LAK',
        amount: initial.money.total,
        method: 'CASH',
        reference: '',
        occurredAt: '2026-01-05T12:00:00+07:00',
        rateRevision: initial.rates.revision,
      }),
    )) as { entryId: string };
    await f.db.query(
      "UPDATE payment_entries SET recorded_at='2026-01-05T12:00:00+07:00' WHERE id=$1",
      [receipt.entryId],
    );
    let report = await reports.read(f.owner, query);
    assert.equal(report.historicalOutstanding, initial.money.total);
    assert.equal(report.outstanding, '0');
    let current = await settlements.detail(f.owner, f.order.id);
    await payments.void(f.owner, f.order.id, receipt.entryId, {
      ...command(),
      expectedVersion: current.version,
      orderRevision: 1,
    });
    report = await reports.read(f.owner, { from: '2026-01-01', to: '2026-01-31', page: 1 });
    assert.equal(report.historicalOutstanding, '0');
    assert.equal(report.outstanding, initial.money.total);
    // วันที่รับย้อนหลังไม่ได้ทำให้รายงานที่ระบบยังไม่รู้รายการนี้ในวันนั้นเปลี่ยนไป
    current = await settlements.detail(f.owner, f.order.id);
    await payments.receipt(
      f.owner,
      f.order.id,
      receiptSchema.parse({
        ...command(),
        expectedVersion: current.version,
        orderRevision: 1,
        purpose: 'PAYMENT',
        currency: 'LAK',
        amount: initial.money.total,
        method: 'CASH',
        reference: '',
        occurredAt: '2025-12-25T12:00:00+07:00',
        rateRevision: current.rates.revision,
      }),
    );
    report = await reports.read(f.owner, query);
    assert.equal(report.historicalOutstanding, initial.money.total);
    assert.equal(report.outstanding, '0');
    assert.equal(report.sales, initial.money.total);
  } finally {
    await f.db.close();
  }
});
test('global search resolves permitted types with stable pages and literal input, never leaking commerce to production', async () => {
  const f = await productionFixture();
  try {
    const search = new SearchService(f.db);
    const order = await search.read(f.owner, { q: f.order.orderNumber });
    assert(order.results.some((r) => r.kind === 'ORDER'));
    assert(order.results.some((r) => r.kind === 'PRODUCTION'));
    const own = await search.read(f.actors.PRINTING, { q: f.order.orderNumber });
    assert(own.results.length > 0);
    assert(own.results.every((r) => r.kind === 'PRODUCTION'));
    assert(
      (await search.read(f.actors.GRAPHIC, { q: f.order.orderNumber })).results.every(
        (r) => r.kind === 'PRODUCTION',
      ),
    );
    assert.equal((await search.read(f.actors.PRINTING, { q: f.input.phone })).results.length, 0);
    assert(
      (await search.read(f.actors.ADMIN, { q: f.input.phone })).results.some(
        (r) => r.kind === 'ORDER',
      ),
    );
    assert.equal((await search.read(f.owner, { q: '%_' })).results.length, 0);
    await assert.rejects(search.read(f.owner, { q: 'AB', cursor: 'bad' }), code('INVALID_CURSOR'));
    for (let i = 0; i < 30; i++)
      await f.db.query(
        "INSERT INTO customers(id,name,phone,normalized_phone,customer_group,branding_type,customer_since,created_by,updated_by) VALUES($1,$2,'02055551234','02055551234','RETAIL','JAZMINE_STANDARD',$3,$4,$4)",
        [randomUUID(), 'Search customer ' + i, businessDate(), f.owner.id],
      );
    const page1 = await search.read(f.owner, { q: 'Search customer' });
    assert.equal(page1.results.length, 25);
    assert(page1.nextCursor);
    const page2 = await search.read(f.owner, { q: 'Search customer', cursor: page1.nextCursor });
    assert.equal(page2.results.length, 5);
    assert.equal(new Set([...page1.results, ...page2.results].map((r) => r.id)).size, 30);
  } finally {
    await f.db.close();
  }
});
