import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { fixturePng, reviseOrder } from './helpers/revise-order';
import { TrackingLinkService } from '../../apps/server/src/tracking/link-service';
import { PublicTrackingService } from '../../apps/server/src/tracking/public-service';
import {
  parseCustomerTrackingUrl,
  invoiceTrackingSchema,
} from '../../packages/contracts/src/tracking';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
const reason = () => ({ requestId: randomUUID(), reason: 'ตรวจ QR ใบแจ้งหนี้' });
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;

test('invoice tracking accepts only canonical same-site tracking links and strict opaque token input', () => {
  const token = 'a'.repeat(43),
    origin = 'https://shop.example',
    url = origin + '/#track=' + token;
  assert.deepEqual(parseCustomerTrackingUrl(' ' + url + ' ', origin), { token, url });
  for (const raw of [
    'not a url',
    '/#track=' + token,
    'https://elsewhere.example/#track=' + token,
    origin + '/other#track=' + token,
    origin + '/?extra=1#track=' + token,
    'https://user:password@shop.example/#track=' + token,
    origin + '/#track=' + token + '&order=other',
    origin + '/#track=abc',
  ])
    assert.throws(() => parseCustomerTrackingUrl(raw, origin));
  assert.equal(invoiceTrackingSchema.safeParse({ token }).success, true);
  assert.equal(invoiceTrackingSchema.safeParse({ token, orderId: randomUUID() }).success, false);
  assert.equal(invoiceTrackingSchema.safeParse({ token: url }).success, false);
});

test('invoice validation is read-only, reuses the issued link, never discloses the token in replies or audit, and preserves phone verification and staff permissions', async () => {
  const f = await productionFixture();
  try {
    const service = new TrackingLinkService(f.db),
      created = await service.issue(f.owner, f.order.id, { ...reason(), days: 30 }),
      token = String(created.token),
      before = await f.db.query('SELECT * FROM tracking_links ORDER BY id'),
      audit = await f.db.query('SELECT * FROM audit_events ORDER BY id');
    const meta = await service.invoice(f.actors.ADMIN, f.order.id, token);
    assert.equal(meta.id, created.id);
    assert.equal(meta.expiresAt, created.expiresAt);
    assert.equal('token' in meta, false);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.invoice(f.owner, f.order.id, token)),
    );
    assert(results.every((v) => v.id === created.id));
    assert.deepEqual(await f.db.query('SELECT * FROM tracking_links ORDER BY id'), before);
    assert.deepEqual(await f.db.query('SELECT * FROM audit_events ORDER BY id'), audit);
    assert(
      !JSON.stringify(await f.db.query('SELECT result FROM tracking_commands')).includes(token),
    );
    assert(!JSON.stringify(audit).includes(token));
    await assert.rejects(
      service.invoice(f.actors.GRAPHIC, f.order.id, token),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      service.invoice(f.actors.PRINTING, f.order.id, token),
      code('PERMISSION_DENIED'),
    );
    const tracking = new PublicTrackingService(f.db);
    await assert.rejects(tracking.view(undefined, token), code('TRACKING_UNAVAILABLE'));
    await assert.rejects(
      service.verify({ token, phone: '02000000000' }, 'invoice-invalid-phone'),
      code('TRACKING_UNAVAILABLE'),
    );
    const session = await service.verify({ token, phone: f.input.phone }, 'invoice-valid-phone');
    assert.equal((await tracking.view(session, token)).orderNumber, f.order.orderNumber);
  } finally {
    await f.db.close();
  }
});

test('wrong-order, replaced, revoked and expired links cannot be attached or validated for printing', async () => {
  const f = await productionFixture();
  try {
    const service = new TrackingLinkService(f.db),
      first = await service.issue(f.owner, f.order.id, { ...reason(), days: 30 }),
      token = String(first.token);
    const draftId = randomUUID();
    await f.drafts.save(f.owner, draftId, {
      ...f.input,
      customerName: 'ออเดอร์อื่น',
      phone: '02011112222',
    });
    const assets = new AssetService(f.db);
    for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) {
      const id = randomUUID();
      await assets.upload(f.actors.GRAPHIC, id, {
        draftId,
        kind,
        filename: kind + '.png',
        base64: fixturePng,
      });
      await assets.review(f.actors.GRAPHIC, id, 'APPROVED', 'ตรวจไฟล์');
    }
    const input = { draftId, rowVersion: 1, dueDate: businessDate() },
      check = await f.orders.check(f.owner, input),
      other = (await f.orders.confirm(f.owner, input, check.checkToken, 'ยืนยันอีกออเดอร์')).order;
    await assert.rejects(
      service.invoice(f.owner, other.id, token),
      code('INVOICE_TRACKING_UNAVAILABLE'),
    );
    const next = await service.issue(f.actors.ADMIN, f.order.id, { ...reason(), days: 1 });
    await assert.rejects(
      service.invoice(f.owner, f.order.id, token),
      code('INVOICE_TRACKING_UNAVAILABLE'),
    );
    await service.revoke(f.actors.ADMIN, f.order.id, reason());
    await assert.rejects(
      service.invoice(f.owner, f.order.id, String(next.token)),
      code('INVOICE_TRACKING_UNAVAILABLE'),
    );
    const last = await service.issue(f.owner, f.order.id, { ...reason(), days: 1 });
    await f.db.query("UPDATE tracking_links SET expires_at=now()-interval '1 second' WHERE id=$1", [
      last.id,
    ]);
    await assert.rejects(
      service.invoice(f.owner, f.order.id, String(last.token)),
      code('INVOICE_TRACKING_UNAVAILABLE'),
    );
  } finally {
    await f.db.close();
  }
});

test('the same QR can reprint an old invoice after an order revision without replacing the link or changing its frozen values; tracking still follows the latest confirmed order', async () => {
  const f = await productionFixture();
  try {
    const service = new TrackingLinkService(f.db),
      created = await service.issue(f.owner, f.order.id, { ...reason(), days: 30 }),
      token = String(created.token),
      old = structuredClone(f.order.snapshot);
    const session = await service.verify(
      { token, phone: f.input.phone },
      'invoice-before-revision',
    );
    const revised = await reviseOrder(f, {
      phone: '02077778888',
      quote: { ...f.input.quote, quantity: 12 },
    });
    assert.equal((await service.invoice(f.owner, f.order.id, token)).id, created.id);
    assert.deepEqual((await f.orders.history(f.owner, f.order.id)).revisions[1].snapshot, old);
    await assert.rejects(
      new PublicTrackingService(f.db).view(session, token),
      code('TRACKING_UNAVAILABLE'),
    );
    await assert.rejects(
      service.verify({ token, phone: f.input.phone }, 'invoice-old-phone'),
      code('TRACKING_UNAVAILABLE'),
    );
    const next = await service.verify(
      { token, phone: revised.snapshot.input.phone },
      'invoice-new-phone',
    );
    assert.equal((await new PublicTrackingService(f.db).view(next, token)).quantity, 13);
    assert.equal((await f.db.query('SELECT * FROM tracking_links')).length, 1);
  } finally {
    await f.db.close();
  }
});
