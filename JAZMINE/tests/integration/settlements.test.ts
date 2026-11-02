import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import { minor, toLak, refundLak } from '../../apps/server/src/settlements/money';
import {
  receiptSchema,
  refundSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
  shipmentMetadataSchema,
} from '../../packages/contracts/src/settlement';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { AppError } from '../../apps/server/src/errors';
import { issueReportSchema } from '../../packages/contracts/src/production-exceptions';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { businessDate } from '../../packages/contracts/src/customers';
import { draftSchema } from '../../packages/contracts/src/orders';
import { sheetSchema } from '../../packages/contracts/src/production';
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;

test('money uses exact cents, owner FX and cumulative rounding; contracts require reason and whole LAK', () => {
  assert.equal(minor('123.45'), 12345n);
  assert.equal(toLak(101n, '650.1234567890'), 657n);
  assert.equal(refundLak(2n, 3n, 1n, 0n), 1n);
  assert.equal(refundLak(2n, 3n, 2n, 1n), 0n);
  assert.equal(refundLak(2n, 3n, 3n, 1n), 1n);
  assert.equal(refundLak(2n, 100n, 2n, 1n), 0n);
  assert.equal(refundLak(2n, 100n, 100n, 1n), 1n);
  const base = {
    requestId: randomUUID(),
    expectedVersion: 0,
    orderRevision: 1,
    reason: 'รับมัดจำ',
    purpose: 'DEPOSIT',
    currency: 'LAK',
    amount: '1',
    method: 'CASH',
    reference: '',
    occurredAt: new Date().toISOString(),
    rateRevision: 2,
  };
  assert.equal(receiptSchema.safeParse(base).success, true);
  for (const change of [
    { reason: '' },
    { amount: '1.01' },
    { amount: '-1' },
    { amount: '0' },
    { exchangeRate: '999' },
    { currency: 'BTC' },
  ])
    assert.equal(receiptSchema.safeParse({ ...base, ...change }).success, false);
});

test('receipts correct atomically, retry once, enforce current rates/permissions, refund partially or fully without changing original records', async () => {
  const f = await productionFixture(),
    { db, owner, actors, order } = f;
  try {
    const views = new SettlementService(db),
      payments = new PaymentService(db);
    const view = () => views.detail(owner, order.id);
    async function base() {
      const v = await view();
      return {
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'ทดสอบรับเงิน',
      };
    }
    const receive = async (extra = {}) =>
      receiptSchema.parse({
        ...(await base()),
        purpose: 'DEPOSIT',
        currency: 'LAK',
        amount: '100000',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
        rateRevision: (await view()).rates.revision,
        ...extra,
      });
    await assert.rejects(views.detail(actors.PRINTING, order.id), code('PERMISSION_DENIED'));
    const input = await receive();
    await assert.rejects(
      payments.receipt(actors.GRAPHIC, order.id, input),
      code('PERMISSION_DENIED'),
    );
    const first = (await payments.receipt(actors.ADMIN, order.id, input)) as { entryId: string };
    assert.deepEqual(await payments.receipt(actors.ADMIN, order.id, input), first);
    assert.equal((await view()).payments.length, 1);
    await assert.rejects(
      payments.receipt(actors.ADMIN, order.id, { ...input, amount: '1' }),
      code('REQUEST_CONFLICT'),
    );
    await assert.rejects(
      payments.receipt(actors.ADMIN, order.id, { ...input, requestId: randomUUID() }),
      code('STALE_STATE'),
    );
    const replacement = (await payments.receipt(
      actors.ADMIN,
      order.id,
      await receive({
        amount: '90000',
        replaceReceiptId: first.entryId,
        reason: 'แก้จากแสนเป็นเก้าหมื่น',
      }),
    )) as { entryId: string };
    let v = await view();
    assert.equal(v.money.netPaid, '90000');
    assert.equal(v.payments[0].state, 'VOIDED');
    assert.equal(v.payments[1].correctsId, first.entryId);
    assert.equal(v.payments[0].amount, '100000.00');
    const refund = refundSchema.parse({
      ...(await base()),
      receiptId: replacement.entryId,
      amount: '30000',
      method: 'TRANSFER',
      reference: 'R1',
      occurredAt: new Date().toISOString(),
    });
    await assert.rejects(
      payments.refund(actors.ADMIN, order.id, refund),
      code('PERMISSION_DENIED'),
    );
    const returned = (await payments.refund(owner, order.id, refund)) as { entryId: string };
    assert.deepEqual(await payments.refund(owner, order.id, refund), returned);
    assert.equal((await view()).money.netPaid, '60000');
    await assert.rejects(
      payments.void(actors.ADMIN, order.id, returned.entryId, await base()),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      payments.void(owner, order.id, replacement.entryId, await base()),
      code('REFUND_LINKED'),
    );
    await assert.rejects(
      payments.receipt(owner, order.id, await receive({ replaceReceiptId: replacement.entryId })),
      code('REFUND_LINKED'),
    );
    await assert.rejects(
      payments.refund(
        owner,
        order.id,
        refundSchema.parse({ ...refund, ...(await base()), amount: '60001' }),
      ),
      code('REFUND_LIMIT'),
    );
    await payments.refund(
      owner,
      order.id,
      refundSchema.parse({ ...refund, ...(await base()), amount: '60000' }),
    );
    assert.equal((await view()).money.netPaid, '0');
    await payments.void(owner, order.id, returned.entryId, await base());
    assert.equal((await view()).money.netPaid, '30000');
    // A failed correction must never void the old row or allocate another document number.
    const active = (await payments.receipt(owner, order.id, await receive())) as {
      entryId: string;
    };
    const pricing = new PricingService(db),
      current = await pricing.current(owner);
    current.config.fx.THB = '650.1234567890';
    await pricing.save(owner, current.revision, current.config, 'เจ้าของตั้งอัตรา');
    await assert.rejects(
      payments.receipt(
        owner,
        order.id,
        await receive({ rateRevision: 2, replaceReceiptId: active.entryId }),
      ),
      code('RATE_CHANGED'),
    );
    assert.equal((await view()).payments.find((p) => p.id === active.entryId)!.state, 'ACTIVE');
    const fx = (await payments.receipt(
      owner,
      order.id,
      await receive({ currency: 'THB', amount: '1.01' }),
    )) as { entryId: string };
    const next = await pricing.current(owner);
    next.config.fx.THB = '700';
    await pricing.save(owner, next.revision, next.config, 'ปรับอัตราใหม่');
    await payments.refund(
      owner,
      order.id,
      refundSchema.parse({
        ...(await base()),
        receiptId: fx.entryId,
        amount: '0.01',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
      }),
    );
    await payments.refund(
      owner,
      order.id,
      refundSchema.parse({
        ...(await base()),
        receiptId: fx.entryId,
        amount: '1',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
      }),
    );
    v = await view();
    assert.equal(v.payments.find((p) => p.id === fx.entryId)!.exchangeRate, '650.1234567890');
    const returns = v.payments.filter((p) => p.receiptId === fx.entryId);
    assert.equal(
      returns.reduce((n, p) => n + BigInt(p.lakAmount), 0n),
      657n,
    );
    const fresh = await receive({ amount: '1' });
    const results = await Promise.allSettled([
      payments.receipt(owner, order.id, fresh),
      payments.receipt(owner, order.id, { ...fresh, requestId: randomUUID() }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await views.detail(actors.ADMIN, order.id)).canRefund, false);
  } finally {
    await db.close();
  }
});

test('latest order value recalculates balance while paid entries and invoice snapshots stay frozen', async () => {
  const f = await productionFixture(),
    { db, owner, actors, order } = f;
  try {
    const views = new SettlementService(db),
      payments = new PaymentService(db);
    const initial = await views.detail(owner, order.id);
    await payments.receipt(
      owner,
      order.id,
      receiptSchema.parse({
        requestId: randomUUID(),
        expectedVersion: 0,
        orderRevision: 1,
        reason: 'จ่ายเต็ม',
        purpose: 'PAYMENT',
        currency: 'LAK',
        amount: initial.money.total,
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
        rateRevision: initial.rates.revision,
      }),
    );
    const ships = new ShipmentService(db);
    const base = async () => {
      const v = await views.detail(owner, order.id);
      return {
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'ตรวจการแก้ออเดอร์หลังส่ง',
      };
    };
    const prepare = async (quantity: number) =>
      ships.prepare(
        owner,
        order.id,
        shipmentPrepareSchema.parse({
          ...(await base()),
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
    await f.finish(f.id);
    const sent = await prepare(3);
    await ships.confirm(
      owner,
      order.id,
      sent.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    const pending = await prepare(1);
    const revise = async (version: number, discount: number, quantity = 10) => {
      await f.drafts.save(
        owner,
        f.draftId,
        draftSchema.parse({
          ...f.input,
          rowVersion: version,
          reason: 'ปรับราคา',
          quote: { ...f.input.quote, fixed: discount, quantity },
        }),
      );
      const assets = new AssetService(db),
        id = randomUUID();
      await assets.upload(actors.GRAPHIC, id, {
        draftId: f.draftId,
        kind: 'MOCKUP',
        filename: 'new.png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      });
      await assets.review(actors.GRAPHIC, id, 'APPROVED', 'อนุมัติฉบับใหม่');
      const request = { draftId: f.draftId, rowVersion: version + 1, dueDate: businessDate() },
        check = await f.orders.check(owner, request);
      await f.orders.confirm(owner, request, check.checkToken, 'ยืนยันราคาใหม่');
    };
    await revise(1, 1000);
    let v = await views.detail(owner, order.id);
    assert.equal(v.money.overpaid, '1000');
    assert.equal(v.money.resolutionRequired, true);
    assert.equal(v.payments.length, 1);
    assert.equal(v.payments[0].snapshot.orderRevision, 1);
    assert.equal(v.delivery.shippedQuantity, 3);
    assert.equal(v.delivery.readyQuantity, 0);
    await assert.rejects(
      ships.confirm(
        owner,
        order.id,
        pending.shipmentId,
        shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
      ),
      code('SHIPMENT_REVISION'),
    );
    await ships.cancel(owner, order.id, pending.shipmentId, await base());
    const old = (await f.production.detail(owner, f.id)).sheet;
    await f.production.action(
      actors.GRAPHIC,
      f.id,
      old.rowVersion,
      'ตรวจใบเก่าหลังแก้ออเดอร์',
      'cancel',
    );
    const nextSheet = randomUUID();
    await assert.rejects(
      f.production.save(
        actors.GRAPHIC,
        nextSheet,
        sheetSchema.parse({
          ...f.sheetInput,
          orderRevision: 2,
          allocations: [{ lineIndex: 0, quantity: 11 }],
        }),
      ),
      code('ALREADY_FULFILLED'),
    );
    await f.production.save(
      actors.GRAPHIC,
      nextSheet,
      sheetSchema.parse({
        ...f.sheetInput,
        orderRevision: 2,
        allocations: [{ lineIndex: 0, quantity: 8 }],
      }),
    );
    await f.publish(nextSheet);
    await f.finish(nextSheet);
    v = await views.detail(owner, order.id);
    assert.equal(v.delivery.readyQuantity, 8);
    assert.equal(v.delivery.shippedQuantity, 3);
    assert.equal(
      (
        await db.query('SELECT status FROM production_preparations WHERE order_id=$1', [order.id])
      )[0].status,
      'SHEETS_READY',
    );
    await revise(2, 0);
    v = await views.detail(owner, order.id);
    assert.equal(v.money.status, 'PAID');
    assert.equal(v.payments.length, 1);
    await revise(3, 0, 1);
    v = await views.detail(owner, order.id);
    assert.equal(v.delivery.excessQuantity, 1);
    assert.equal(v.delivery.reviewRequired, true);
    assert.notEqual(v.delivery.status, 'COMPLETED');
  } finally {
    await db.close();
  }
});

test('partial shipping consumes QC once, permits unpaid/early confirmation, keeps tracking history and reverses mistaken shipment safely', async () => {
  const f = await productionFixture(),
    { db, owner, actors, order } = f;
  try {
    const views = new SettlementService(db),
      ships = new ShipmentService(db),
      view = () => views.detail(owner, order.id);
    async function base() {
      const v = await view();
      return {
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'ทดสอบส่งสินค้า',
      };
    }
    const prepare = async (quantity: number, extra = {}) =>
      shipmentPrepareSchema.parse({
        ...(await base()),
        method: 'CUSTOMER_PICKUP',
        recipient: 'ผู้รับ',
        phone: '020',
        address: '',
        carrier: '',
        tracking: '',
        notes: '',
        items: [{ lineIndex: 0, quantity }],
        ...extra,
      });
    await assert.rejects(
      ships.prepare(actors.PRINTING, order.id, await prepare(3)),
      code('PERMISSION_DENIED'),
    );
    const input = await prepare(3),
      first = (await ships.prepare(actors.ADMIN, order.id, input)) as { shipmentId: string };
    assert.deepEqual(await ships.prepare(actors.ADMIN, order.id, input), first);
    assert.equal((await view()).delivery.shippedQuantity, 0);
    await assert.rejects(
      ships.confirm(
        owner,
        order.id,
        first.shipmentId,
        shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: true }),
      ),
      code('NOT_READY_TO_SHIP'),
    );
    assert.equal((await db.query('SELECT * FROM shipment_allocations')).length, 0);
    await f.finish(f.id);
    await ships.confirm(
      actors.ADMIN,
      order.id,
      first.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: true }),
    );
    let v = await view();
    assert.equal(v.money.status, 'UNPAID');
    assert.equal(v.delivery.status, 'PARTIALLY_SHIPPED');
    assert.equal(v.delivery.shippedQuantity, 3);
    assert.equal(v.delivery.readyQuantity, 8);
    assert.equal(v.shipments[0].confirmedEarly, true);
    const source = (await f.production.detail(owner, f.id)).sheet;
    await assert.rejects(
      f.production.save(
        actors.GRAPHIC,
        f.id,
        sheetSchema.parse({
          ...f.sheetInput,
          rowVersion: source.rowVersion,
          allocations: [{ lineIndex: 0, quantity: 2 }],
          reason: 'ลองลดต่ำกว่าที่ส่งแล้ว',
        }),
      ),
      code('BELOW_SHIPPED'),
    );
    const audit = (
      await db.query("SELECT detail FROM audit_events WHERE action='SHIPMENT_CONFIRMED'")
    )[0].detail as { dueAtConfirmation: string };
    assert.equal(audit.dueAtConfirmation, v.money.total);
    await ships.metadata(
      actors.ADMIN,
      order.id,
      first.shipmentId,
      shipmentMetadataSchema.parse({
        ...(await base()),
        carrier: 'Local',
        tracking: 'TRACK-1',
        notes: 'รับแล้ว',
      }),
    );
    v = await view();
    assert.equal(v.shipments[0].updates.length, 1);
    assert.equal(v.shipments[0].updates[0].before.tracking, '');
    assert.equal(v.shipments[0].tracking, 'TRACK-1');
    await assert.rejects(
      ships.prepare(owner, order.id, await prepare(9)),
      code('SHIPMENT_QUANTITY'),
    );
    const job = (await f.work.detail(owner, f.id)).job;
    await assert.rejects(
      f.exceptions.report(
        actors.QC_PACKING,
        f.id,
        issueReportSchema.parse({
          requestId: randomUUID(),
          version: job.version,
          sheetRowVersion: job.sheetRowVersion,
          department: 'QC_PACKING',
          category: 'DAMAGE',
          mode: 'CONTINUE',
          description: 'ห้ามนับของส่งแล้วเป็นเสีย',
          affected: [{ lineIndex: 0, quantity: 9 }],
        }),
      ),
      code('AFFECTED_QUANTITY'),
    );
    const second = (await ships.prepare(
      owner,
      order.id,
      await prepare(8, { method: 'SHOP_DELIVERY', address: 'Vientiane' }),
    )) as { shipmentId: string };
    const confirm = shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false });
    await ships.confirm(owner, order.id, second.shipmentId, confirm);
    assert.deepEqual(await ships.confirm(owner, order.id, second.shipmentId, confirm), {
      ok: true,
      shipmentId: second.shipmentId,
    });
    v = await view();
    assert.equal(v.delivery.orderStatus, 'COMPLETED');
    assert.equal(v.delivery.readyQuantity, 0);
    assert.equal(v.delivery.shippedQuantity, 11);
    await ships.cancel(actors.ADMIN, order.id, second.shipmentId, await base());
    v = await view();
    assert.equal(v.delivery.shippedQuantity, 3);
    assert.equal(v.delivery.readyQuantity, 8);
    assert.equal(v.shipments[1].state, 'CANCELLED');
    assert.equal(v.delivery.orderStatus, 'CONFIRMED');
    const again = (await ships.prepare(owner, order.id, await prepare(8))) as {
      shipmentId: string;
    };
    await ships.confirm(
      owner,
      order.id,
      again.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    assert.equal((await view()).delivery.shippedQuantity, 11);
  } finally {
    await db.close();
  }
});
