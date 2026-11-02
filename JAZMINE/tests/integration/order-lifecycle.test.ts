import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { OrderLifecycleService } from '../../apps/server/src/orders/order-lifecycle-service';
import {
  lifecycleCommandSchema,
  cancellationAgreementSchema,
} from '../../packages/contracts/src/order-lifecycle';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import {
  receiptSchema,
  refundSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { ReportService } from '../../apps/server/src/reports/report-service';
import { reportQuerySchema } from '../../packages/contracts/src/reports';
import { SearchService } from '../../apps/server/src/search/search-service';
import { searchQuerySchema } from '../../packages/contracts/src/search';
import { AppError } from '../../apps/server/src/errors';
import { businessDate } from '../../packages/contracts/src/customers';
import { Database } from '../../apps/server/src/database';
import { unpackDump } from '../../apps/server/src/backups/archive';
import { TrackingLinkService } from '../../apps/server/src/tracking/link-service';
import { PublicTrackingService } from '../../apps/server/src/tracking/public-service';
import { CustomerRequestService } from '../../apps/server/src/tracking/request-service';
type F = Awaited<ReturnType<typeof productionFixture>>;
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
async function base(f: F) {
  const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
  return {
    requestId: randomUUID(),
    expectedVersion: v.version,
    orderRevision: v.revision,
    reason: 'ตรวจจำนวนเงินจริงและชิ้นงาน',
  };
}
async function command(f: F) {
  const v = await new OrderLifecycleService(f.db).preview(f.owner, f.order.id);
  return lifecycleCommandSchema.parse({
    requestId: randomUUID(),
    checkToken: v.checkToken,
    reason: 'ตรวจและแจ้งทุกฝ่ายแล้ว',
    reviewed: true,
  });
}
async function pay(f: F, amount: string) {
  return new PaymentService(f.db).receipt(
    f.actors.ADMIN,
    f.order.id,
    receiptSchema.parse({
      ...(await base(f)),
      purpose: 'DEPOSIT',
      currency: 'LAK',
      amount,
      method: 'CASH',
      reference: '',
      occurredAt: new Date().toISOString(),
      rateRevision: 2,
    }),
  ) as Promise<{ entryId: string }>;
}
async function prepare(f: F, quantity: number) {
  return new ShipmentService(f.db).prepare(
    f.actors.ADMIN,
    f.order.id,
    shipmentPrepareSchema.parse({
      ...(await base(f)),
      method: 'CUSTOMER_PICKUP',
      recipient: 'ผู้รับ',
      phone: '',
      address: '',
      carrier: '',
      tracking: '',
      notes: '',
      items: [{ lineIndex: 0, quantity }],
    }),
  ) as Promise<{ shipmentId: string }>;
}
async function ship(f: F, quantity: number) {
  const p = await prepare(f, quantity);
  await new ShipmentService(f.db).confirm(
    f.actors.ADMIN,
    f.order.id,
    p.shipmentId,
    shipmentConfirmSchema.parse({ ...(await base(f)), confirmedEarly: false }),
  );
  return p;
}
async function agree(f: F, amount: string) {
  const s = new OrderLifecycleService(f.db);
  return s.command(
    f.owner,
    f.order.id,
    'agreement',
    cancellationAgreementSchema.parse({ ...(await command(f)), agreedTotal: amount }),
  );
}
async function report(f: F) {
  return new ReportService(f.db).read(
    f.owner,
    reportQuerySchema.parse({ from: businessDate(), to: businessDate() }),
  );
}

test('cancel retries once, preserves actual shipments/money/production and atomically closes prepared deliveries; uncertain finances are explicit in reports', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    await pay(f, '800000');
    await ship(f, 3);
    const pending = await prepare(f, 2);
    const history = await f.production.history(f.owner, f.id),
      events = await f.db.query('SELECT * FROM production_stage_events ORDER BY id');
    const service = new OrderLifecycleService(f.db),
      input = await command(f);
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.command(f.actors.ADMIN, f.order.id, 'cancel', input),
      ),
    );
    for (const result of results) assert.deepEqual(result, results[0]);
    const v = await service.preview(f.owner, f.order.id),
      settlement = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(v.finance, 'DECISION_REQUIRED');
    assert.equal(v.state.agreedTotal, null);
    assert.equal(v.refundDue, null);
    assert.equal(v.history.length, 1);
    assert.equal(settlement.money.netPaid, '800000');
    assert.equal(settlement.money.resolutionRequired, true);
    assert.equal(settlement.delivery.shippedQuantity, 3);
    assert.equal(settlement.delivery.readyQuantity, 0);
    assert.equal(settlement.shipments.find((s) => s.id === pending.shipmentId)!.state, 'CANCELLED');
    assert.equal(settlement.delivery.orderStatus, 'CANCELLED');
    assert.deepEqual((await f.production.history(f.owner, f.id)).versions, history.versions);
    assert.deepEqual(await f.db.query('SELECT * FROM production_stage_events ORDER BY id'), events);
    await assert.rejects(
      new ShipmentService(f.db).confirm(
        f.owner,
        f.order.id,
        pending.shipmentId,
        shipmentConfirmSchema.parse({ ...(await base(f)), confirmedEarly: false }),
      ),
      code('ORDER_CANCELLED'),
    );
    await assert.rejects(prepare(f, 1), code('ORDER_CANCELLED'));
    const r = await report(f);
    assert.equal(r.sales, '0');
    assert.equal(r.orders, 0);
    assert.equal(r.quantity, 0);
    assert.equal(r.received, '800000');
    assert.equal(r.pendingCancellations, 1);
    assert.equal(r.historicalPendingCancellations, 1);
    assert.equal(r.rows[0].decisionRequired, true);
    await assert.rejects(
      service.command(f.owner, f.order.id, 'cancel', { ...input, requestId: randomUUID() }),
      code('LIFECYCLE_CHANGED'),
    );
  } finally {
    await f.db.close();
  }
});

test('only owner records the cancellation agreement; refund occurs separately, archive keeps searchable history and new money restores visibility', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    const receipt = await pay(f, '800000'),
      s = new OrderLifecycleService(f.db);
    await s.command(f.actors.ADMIN, f.order.id, 'cancel', await command(f));
    const proposal = cancellationAgreementSchema.parse({
      ...(await command(f)),
      agreedTotal: '300000',
    });
    await assert.rejects(
      s.command(f.actors.ADMIN, f.order.id, 'agreement', proposal),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      s.command(f.actors.ADMIN, f.order.id, 'archive', await command(f)),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      s.command(f.owner, f.order.id, 'archive', await command(f)),
      code('ARCHIVE_NOT_READY'),
    );
    await s.command(f.owner, f.order.id, 'agreement', proposal);
    assert.equal((await s.preview(f.owner, f.order.id)).refundDue, '500000');
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).payments.length,
      1,
    );
    await new PaymentService(f.db).refund(
      f.owner,
      f.order.id,
      refundSchema.parse({
        ...(await base(f)),
        receiptId: receipt.entryId,
        amount: '500000',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
      }),
    );
    assert.equal((await s.preview(f.owner, f.order.id)).finance, 'CLEAR');
    await s.command(f.owner, f.order.id, 'archive', await command(f));
    const views = new SettlementService(f.db);
    assert.equal((await views.list(f.owner, '')).orders.length, 0);
    assert.equal((await views.list(f.owner, '', true)).orders.length, 1);
    const search = await new SearchService(f.db).read(
      f.owner,
      searchQuerySchema.parse({ q: f.order.orderNumber }),
    );
    assert(search.results.some((r) => r.kind === 'ORDER'));
    const snap = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await snap.arrayBuffer())),
      );
    try {
      assert.equal(
        (await new OrderLifecycleService(copy).preview(f.owner, f.order.id)).state.storage,
        'ARCHIVED',
      );
      assert.equal(
        (await new OrderLifecycleService(copy).preview(f.owner, f.order.id)).history.length,
        3,
      );
    } finally {
      await copy.close();
    }
    await pay(f, '100');
    const restored = await s.preview(f.owner, f.order.id);
    assert.equal(restored.state.storage, 'ACTIVE');
    assert.equal(restored.state.business, 'CANCELLED');
    assert.equal(restored.refundDue, '100');
    assert.equal(restored.history.at(-1)!.kind, 'AUTO_RESTORE');
    const r = await report(f);
    assert.equal(r.sales, '0');
    assert.equal(r.received, '800100');
    assert.equal(r.refunded, '500000');
    assert.equal(r.overpaid, '100');
    assert.equal(r.pendingCancellations, 0);
  } finally {
    await f.db.close();
  }
});

test('cancel freezes new work and order revisions, but graphic staff can close unfinished sheets; additional money follows an explicit owner agreement', async () => {
  const f = await productionFixture();
  try {
    await f.action(f.id, 'PRINTING', 'start');
    const s = new OrderLifecycleService(f.db);
    await s.command(f.actors.ADMIN, f.order.id, 'cancel', await command(f));
    await assert.rejects(f.action(f.id, 'PRINTING', 'complete'), code('ORDER_CANCELLED'));
    await assert.rejects(
      f.production.save(f.actors.GRAPHIC, randomUUID(), {
        ...f.sheetInput,
        allocations: [{ lineIndex: 0, quantity: 1 }],
      }),
      code('ORDER_CANCELLED'),
    );
    await assert.rejects(
      f.drafts.save(f.owner, f.draftId, {
        ...f.input,
        rowVersion: 1,
        reason: 'พยายามแก้ออเดอร์ที่ยกเลิก',
      }),
      code('ORDER_CANCELLED'),
    );
    await assert.rejects(
      f.orders.confirm(
        f.owner,
        { draftId: f.draftId, rowVersion: 1, dueDate: businessDate() },
        '0'.repeat(64),
        'พยายามเปิดงานเดิม',
      ),
      code('ORDER_CANCELLED'),
    );
    await assert.rejects(pay(f, '1000'), code('CANCELLATION_FINANCE_REQUIRED'));
    await agree(f, '1000');
    await pay(f, '500');
    assert.equal((await s.preview(f.owner, f.order.id)).additionalDue, '500');
    await pay(f, '500');
    const v = await s.preview(f.owner, f.order.id);
    assert.equal(v.finance, 'CLEAR');
    assert.equal(v.archive.eligible, false);
    assert.equal(v.effects.inProgress, 1);
    const sheet = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      f.id,
      sheet.rowVersion,
      'ตรวจชิ้นงานค้างแล้วปิดใบ',
      'cancel',
    );
    await s.command(f.owner, f.order.id, 'archive', await command(f));
    assert.equal((await s.preview(f.owner, f.order.id)).state.storage, 'ARCHIVED');
  } finally {
    await f.db.close();
  }
});

test('completed valid orders wait 15 days before archive, remain in historical sales and reactivate on a refund; restoring visibility never undoes cancellation', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    await ship(f, 11);
    const v = await new SettlementService(f.db).detail(f.owner, f.order.id),
      receipt = await pay(f, v.money.total),
      s = new OrderLifecycleService(f.db);
    assert.equal((await s.preview(f.owner, f.order.id)).archive.eligible, false);
    await assert.rejects(
      s.command(f.owner, f.order.id, 'archive', await command(f)),
      code('ARCHIVE_NOT_READY'),
    );
    await f.db.query(
      "UPDATE order_revisions SET confirmed_at=now()-interval '16 days' WHERE order_id=$1",
      [f.order.id],
    );
    await f.db.query(
      "UPDATE shipments SET confirmed_at=now()-interval '16 days' WHERE order_id=$1",
      [f.order.id],
    );
    await s.command(f.owner, f.order.id, 'archive', await command(f));
    const date = businessDate();
    const r = await new ReportService(f.db).read(
      f.owner,
      reportQuerySchema.parse({
        from: new Date(Date.parse(date) - 20 * 86400000).toISOString().slice(0, 10),
        to: date,
      }),
    );
    assert.equal(r.sales, v.money.total);
    assert.equal(r.orders, 1);
    await assert.rejects(
      s.command(f.actors.ADMIN, f.order.id, 'restore', await command(f)),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      f.drafts.save(f.owner, f.draftId, {
        ...f.input,
        rowVersion: 1,
        reason: 'ลองแก้ก่อนเปิดออกจากเก็บ',
      }),
      code('ORDER_ARCHIVED'),
    );
    await new PaymentService(f.db).refund(
      f.owner,
      f.order.id,
      refundSchema.parse({
        ...(await base(f)),
        receiptId: receipt.entryId,
        amount: '100',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
      }),
    );
    assert.equal((await s.preview(f.owner, f.order.id)).state.storage, 'ACTIVE');
    assert.equal((await s.preview(f.owner, f.order.id)).archive.eligible, false);
  } finally {
    await f.db.close();
  }
});

test('history as of yesterday uses the then-valid obligation, and later cancellation/agreements never rewrite it', async () => {
  const f = await productionFixture();
  try {
    await f.db.query(
      "UPDATE order_revisions SET confirmed_at=now()-interval '2 days' WHERE order_id=$1",
      [f.order.id],
    );
    const total = (await new SettlementService(f.db).detail(f.owner, f.order.id)).money.total,
      s = new OrderLifecycleService(f.db);
    await s.command(f.owner, f.order.id, 'cancel', await command(f));
    await agree(f, '1000');
    const yesterday = new Date(Date.parse(businessDate()) - 86400000).toISOString().slice(0, 10);
    const past = await new ReportService(f.db).read(
      f.owner,
      reportQuerySchema.parse({ from: yesterday, to: yesterday }),
    );
    assert.equal(past.historicalOutstanding, total);
    assert.equal(past.historicalPendingCancellations, 0);
    const now = await report(f);
    assert.equal(now.historicalOutstanding, '1000');
    assert.equal(now.outstanding, '1000');
  } finally {
    await f.db.close();
  }
});

test('contracts require a reviewed effect snapshot, a reason and precise whole LAK; unprivileged staff cannot inspect or mutate lifecycle', async () => {
  const f = await productionFixture();
  try {
    const s = new OrderLifecycleService(f.db),
      input = await command(f);
    for (const extra of [
      { reason: '' },
      { reviewed: false },
      { agreedTotal: '1.5' },
      { agreedTotal: '-1' },
      { agreedTotal: '9000000000000001' },
    ])
      assert.equal(
        cancellationAgreementSchema.safeParse({ ...input, agreedTotal: '0', ...extra }).success,
        false,
      );
    await assert.rejects(s.preview(f.actors.GRAPHIC, f.order.id), code('PERMISSION_DENIED'));
    await assert.rejects(
      s.command(f.actors.PRINTING, f.order.id, 'cancel', input),
      code('PERMISSION_DENIED'),
    );
    assert.equal((await f.db.query('SELECT * FROM order_lifecycle_events')).length, 0);
  } finally {
    await f.db.close();
  }
});

test('customers see cancellation without internal finance; new delivery work is refused while a general inquiry restores archived visibility and blocks archive', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    const links = new TrackingLinkService(f.db),
      created = await links.issue(f.owner, f.order.id, {
        requestId: randomUUID(),
        reason: 'เปิดลิงก์เพื่อทดสอบ',
        days: 1,
      }),
      token = String(created.token),
      session = await links.verify({ token, phone: f.input.phone }, 'lifecycle-test');
    const s = new OrderLifecycleService(f.db);
    await s.command(f.owner, f.order.id, 'cancel', await command(f));
    await agree(f, '0');
    await s.command(f.owner, f.order.id, 'archive', await command(f));
    const publicView = await new PublicTrackingService(f.db).view(session, token);
    assert.equal(publicView.orderState, 'CANCELLED');
    assert.equal(publicView.payment, 'REVIEW_REQUIRED');
    assert.equal(publicView.readyQuantity, 0);
    assert.equal('cancel_agreed_lak' in publicView, false);
    assert.equal('netPaid' in publicView, false);
    const requests = new CustomerRequestService(f.db);
    await assert.rejects(
      requests.submit(session, token, {
        requestId: randomUUID(),
        kind: 'DELIVERY',
        message: 'อยากให้ส่งสินค้าเพิ่ม',
      }),
      code('ORDER_CANCELLED'),
    );
    const input = {
      requestId: randomUUID(),
      kind: 'GENERAL' as const,
      message: 'สอบถามรายละเอียดหลังยกเลิก',
    };
    await requests.submit(session, token, input);
    await requests.submit(session, token, input);
    const v = await s.preview(f.owner, f.order.id);
    assert.equal(v.state.storage, 'ACTIVE');
    assert.equal(v.state.business, 'CANCELLED');
    assert.equal(v.effects.openRequests, 1);
    assert.equal(v.history.at(-1)!.kind, 'AUTO_RESTORE');
    await assert.rejects(
      s.command(f.owner, f.order.id, 'archive', await command(f)),
      code('ARCHIVE_NOT_READY'),
    );
  } finally {
    await f.db.close();
  }
});
