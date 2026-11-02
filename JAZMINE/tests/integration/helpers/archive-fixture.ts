import { randomUUID } from 'node:crypto';
import type { productionFixture } from './production-fixture';
import { SettlementService } from '../../../apps/server/src/settlements/settlement-service';
import { PaymentService } from '../../../apps/server/src/settlements/payment-service';
import { ShipmentService } from '../../../apps/server/src/settlements/shipment-service';
import { OrderLifecycleService } from '../../../apps/server/src/orders/order-lifecycle-service';
import { lifecycleCommandSchema } from '../../../packages/contracts/src/order-lifecycle';
import {
  receiptSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../../packages/contracts/src/settlement';
export type ArchiveFixture = Awaited<ReturnType<typeof productionFixture>>;
export async function settlementInput(f: ArchiveFixture) {
  const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
  return {
    requestId: randomUUID(),
    expectedVersion: v.version,
    orderRevision: v.revision,
    reason: 'ตรวจข้อมูลทดสอบ',
  };
}
export async function lifecycleInput(f: ArchiveFixture) {
  const v = await new OrderLifecycleService(f.db).preview(f.owner, f.order.id);
  return lifecycleCommandSchema.parse({
    requestId: randomUUID(),
    checkToken: v.checkToken,
    reason: 'ตรวจออเดอร์ทดสอบ',
    reviewed: true,
  });
}
export async function receive(f: ArchiveFixture, amount: string) {
  return new PaymentService(f.db).receipt(
    f.owner,
    f.order.id,
    receiptSchema.parse({
      ...(await settlementInput(f)),
      purpose: 'PAYMENT',
      currency: 'LAK',
      amount,
      method: 'CASH',
      reference: '',
      occurredAt: new Date().toISOString(),
      rateRevision: 2,
    }),
  ) as Promise<{ entryId: string }>;
}
export async function completedOrder(f: ArchiveFixture, paid = true) {
  await f.finish(f.id);
  const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
  const receipt = paid ? await receive(f, v.money.total) : null;
  const ships = new ShipmentService(f.db);
  const prepared = (await ships.prepare(
    f.owner,
    f.order.id,
    shipmentPrepareSchema.parse({
      ...(await settlementInput(f)),
      method: 'CUSTOMER_PICKUP',
      recipient: 'ผู้รับทดสอบ',
      phone: '',
      address: '',
      carrier: '',
      tracking: '',
      notes: '',
      items: [{ lineIndex: 0, quantity: 11 }],
    }),
  )) as { shipmentId: string };
  await ships.confirm(
    f.owner,
    f.order.id,
    prepared.shipmentId,
    shipmentConfirmSchema.parse({ ...(await settlementInput(f)), confirmedEarly: false }),
  );
  await f.db.query(
    "UPDATE order_revisions SET confirmed_at=now()-interval '16 days' WHERE order_id=$1",
    [f.order.id],
  );
  await f.db.query("UPDATE shipments SET confirmed_at=now()-interval '16 days' WHERE order_id=$1", [
    f.order.id,
  ]);
  return receipt;
}
