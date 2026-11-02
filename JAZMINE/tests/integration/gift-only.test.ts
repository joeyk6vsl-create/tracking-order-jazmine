import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { reviseOrder } from './helpers/revise-order';
import { quoteSchema } from '../../packages/contracts/src/pricing';
import { draftSchema } from '../../packages/contracts/src/orders';
import { PricingService, discountedTotal } from '../../apps/server/src/pricing/pricing-service';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import {
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { ReportService } from '../../apps/server/src/reports/report-service';
import { reportQuerySchema } from '../../packages/contracts/src/reports';
import { businessDate } from '../../packages/contracts/src/customers';
import { Database } from '../../apps/server/src/database';
import { unpackDump } from '../../apps/server/src/backups/archive';
import { AppError } from '../../apps/server/src/errors';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
type F = Awaited<ReturnType<typeof productionFixture>>;
async function sizes(f: F) {
  const version = Number(
    (
      await f.db.query('SELECT row_version FROM catalog_items WHERE id=$1', [
        f.input.quote.productId,
      ])
    )[0].row_version,
  );
  await new CatalogChoicesService(f.db).save(f.owner, f.input.quote.productId, {
    rowVersion: version,
    sizes: ['M', 'L'],
    fabricIds: [f.input.quote.fabricId],
  });
}
async function closeOriginal(f: F) {
  const s = (await f.production.detail(f.owner, f.id)).sheet;
  await f.production.action(
    f.actors.GRAPHIC,
    f.id,
    s.rowVersion,
    'จัดใบใหม่หลังเปลี่ยนรายการ',
    'cancel',
  );
}
async function prepare(f: F, items: { lineIndex: number; quantity: number }[]) {
  const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
  return new ShipmentService(f.db).prepare(
    f.actors.ADMIN,
    f.order.id,
    shipmentPrepareSchema.parse({
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'จัดส่งสินค้าจริงรวมของแถม',
      method: 'CUSTOMER_PICKUP',
      recipient: 'ผู้รับ',
      phone: '',
      address: '',
      carrier: '',
      tracking: '',
      notes: '',
      items,
    }),
  ) as Promise<{ shipmentId: string }>;
}
async function confirmShipment(f: F, id: string) {
  const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
  await new ShipmentService(f.db).confirm(
    f.actors.ADMIN,
    f.order.id,
    id,
    shipmentConfirmSchema.parse({
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'ส่งจำนวนจริงรวมของแถม',
      confirmedEarly: false,
    }),
  );
}

test('gift-only contracts allow purchased zero with physical gifts, reject empty/negative/fractional lines, and allow a zero-valued header only when valid lines exist', () => {
  const line = {
    productId: randomUUID(),
    fabricId: randomUUID(),
    size: 'M',
    group: 'RETAIL',
    quantity: 0,
    freeQuantity: 2,
  };
  assert.equal(quoteSchema.safeParse(line).success, true);
  for (const extra of [
    { freeQuantity: 0 },
    { quantity: -1 },
    { quantity: 0.5 },
    { freeQuantity: -1 },
    { freeQuantity: 10001 },
    { quantity: 10001 },
  ])
    assert.equal(quoteSchema.safeParse({ ...line, ...extra }).success, false);
  const input = {
    rowVersion: 0,
    reason: 'สร้างของแถม',
    customerName: 'ลูกค้า',
    phone: '02055551234',
    quote: { ...line, freeQuantity: 0 },
  };
  assert.equal(draftSchema.safeParse(input).success, false);
  assert.equal(draftSchema.safeParse({ ...input, lines: [line] }).success, true);
  assert.equal(
    draftSchema.safeParse({ ...input, lines: [{ ...line, freeQuantity: 0 }] }).success,
    false,
  );
  assert.equal(draftSchema.safeParse({ ...input, quote: line }).success, true);
});

test('gift-first multi-size orders bill only purchased units, discount once, preserve unknown prices and never multiply promotion gifts', async () => {
  const f = await productionFixture();
  try {
    await sizes(f);
    const pricing = new PricingService(f.db),
      view = await pricing.current(f.owner);
    view.config.buyGet = { buy: 10, get: 1 };
    view.config.fx.THB = '700';
    await pricing.save(f.owner, view.revision, view.config, 'ตั้งกติกาและสกุลเงินทดสอบ');
    const gift = {
        ...f.input.quote,
        quantity: 0,
        freeQuantity: 2,
        size: 'L' as const,
        currency: 'THB' as const,
      },
      paid = { ...f.input.quote, quantity: 20, freeQuantity: 0, currency: 'THB' as const };
    const input = draftSchema.parse({
      ...f.input,
      quote: { ...gift, freeQuantity: 0, applyBuyGet: true, percent: 10, fixed: 50000 },
      lines: [gift, paid],
    });
    const result = await f.drafts.preview(f.actors.ADMIN, input),
      paidPrice = await pricing.quote(f.owner, paid);
    assert.equal(result.quantity, 20);
    assert.equal(result.freeQuantity, 2);
    assert.equal(result.productionQuantity, 22);
    assert.equal(result.automaticFreeQuantity, 2);
    assert.equal(result.linePricing![0].subtotal, 0);
    assert.equal(result.linePricing![0].total, 0);
    assert.equal(result.subtotal, paidPrice.subtotal);
    assert.equal(result.total, discountedTotal(paidPrice.subtotal!, 10, 50000));
    assert.equal(result.exchangeRate, '700');
    assert(result.convertedTotal);
    await assert.rejects(
      f.drafts.preview(f.owner, { ...input, lines: [{ ...gift, freeQuantity: 3 }, paid] }),
      code('FREE_ALLOCATION_MISMATCH'),
    );
    await assert.rejects(
      f.drafts.preview(f.owner, {
        ...input,
        lines: [{ ...gift, freeQuantity: 2, applyBuyGet: true }, paid],
      }),
      code('LINE_PROMOTION'),
    );
    const id = randomUUID(),
      saved = await f.drafts.save(f.actors.ADMIN, id, input);
    await f.drafts.save(f.actors.ADMIN, id, input);
    assert.equal(saved.draft.input.lines[0].quantity, 0);
    assert.equal((await f.db.query('SELECT id FROM order_drafts WHERE id=$1', [id])).length, 1);
    const current = await pricing.current(f.owner);
    delete current.config.adjustments[gift.fabricId];
    await pricing.save(f.owner, current.revision, current.config, 'ไม่ทราบราคาผ้า');
    const unknown = await f.drafts.preview(f.owner, input);
    assert.equal(unknown.ready, false);
    assert.equal(unknown.total, null);
    assert(unknown.missing.length > 0);
  } finally {
    await f.db.close();
  }
});

test('gift-only sizes remain real demand through confirmation, QC, partial pickup and completion, without changing frozen earlier orders or creating money', async () => {
  const f = await productionFixture();
  try {
    await sizes(f);
    await closeOriginal(f);
    const original = structuredClone(f.order.snapshot),
      gift = { ...f.input.quote, size: 'L' as const, quantity: 0, freeQuantity: 2 },
      paid = { ...f.input.quote, freeQuantity: 0 };
    const order = await reviseOrder(f, {
      quote: { ...gift, freeQuantity: 0 },
      lines: [gift, paid],
    });
    assert.equal(order.snapshot.pricing.productionQuantity, 12);
    assert.equal(order.snapshot.pricing.linePricing![0].total, 0);
    assert.deepEqual((await f.orders.history(f.owner, f.order.id)).revisions[1].snapshot, original);
    const id = randomUUID();
    await f.production.save(f.actors.GRAPHIC, id, {
      ...f.sheetInput,
      orderRevision: 2,
      allocations: [
        { lineIndex: 0, quantity: 2 },
        { lineIndex: 1, quantity: 10 },
      ],
    });
    const giftShipment = await prepare(f, [{ lineIndex: 0, quantity: 2 }]);
    await assert.rejects(confirmShipment(f, giftShipment.shipmentId), code('NOT_READY_TO_SHIP'));
    await f.publish(id);
    await f.finish(id);
    const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(v.delivery.lines[0].ready, 2);
    assert.equal(v.delivery.lines[1].ready, 10);
    const first = await prepare(f, [{ lineIndex: 1, quantity: 10 }]);
    await confirmShipment(f, first.shipmentId);
    const partial = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(partial.delivery.orderStatus, 'CONFIRMED');
    assert.equal(partial.delivery.readyQuantity, 2);
    await confirmShipment(f, giftShipment.shipmentId);
    const done = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(done.delivery.orderStatus, 'COMPLETED');
    assert.equal(done.delivery.shippedQuantity, 12);
    assert.equal(done.payments.length, 0);
    const report = await new ReportService(f.db).read(
      f.owner,
      reportQuerySchema.parse({ from: businessDate(), to: businessDate() }),
    );
    assert.equal(report.sales, String(order.snapshot.pricing.total));
    assert.equal(report.quantity, 12);
    assert.equal(report.received, '0');
    assert.equal(report.profit, null);
  } finally {
    await f.db.close();
  }
});

test('a manually gifted order may have zero sale value while still requiring graphic approval, production and delivery; restored copies retain that distinction', async () => {
  const f = await productionFixture();
  try {
    await closeOriginal(f);
    const gift = { ...f.input.quote, quantity: 0, freeQuantity: 3 };
    const order = await reviseOrder(f, { quote: gift, lines: [] });
    assert.equal(order.snapshot.pricing.total, 0);
    assert.equal(order.snapshot.pricing.productionQuantity, 3);
    const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(v.money.status, 'PAID');
    assert.equal(v.money.netPaid, '0');
    assert.equal(v.delivery.orderStatus, 'CONFIRMED');
    const id = randomUUID();
    await f.production.save(f.actors.GRAPHIC, id, {
      ...f.sheetInput,
      orderRevision: 2,
      allocations: [{ lineIndex: 0, quantity: 3 }],
    });
    await f.publish(id);
    await f.finish(id);
    const p = await prepare(f, [{ lineIndex: 0, quantity: 3 }]);
    await confirmShipment(f, p.shipmentId);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.orderStatus,
      'COMPLETED',
    );
    const dump = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await dump.arrayBuffer())),
      );
    try {
      const restored = await new SettlementService(copy).detail(f.owner, f.order.id);
      assert.equal(restored.money.total, '0');
      assert.equal(restored.payments.length, 0);
      assert.equal(restored.delivery.shippedQuantity, 3);
    } finally {
      await copy.close();
    }
    const pricing = new PricingService(f.db),
      config = await pricing.current(f.owner);
    config.config.buyGet = { buy: 10, get: 1 };
    await pricing.save(f.owner, config.revision, config.config, 'ตั้งโปรโมชั่นทดสอบ');
    await assert.rejects(
      f.drafts.preview(
        f.owner,
        draftSchema.parse({
          ...f.input,
          quote: { ...gift, freeQuantity: 0, applyBuyGet: true },
          lines: [gift],
        }),
      ),
      code('FREE_ALLOCATION_MISMATCH'),
    );
  } finally {
    await f.db.close();
  }
});
