import type { UserView } from '../../../../packages/contracts/src/identity';
import type { SettlementView } from '../../../../packages/contracts/src/settlement';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { readOrder, moneySummary } from './ledger';
import { PaymentService } from './payment-service';
import { ShipmentService } from './shipment-service';
import { lifecycleState } from '../orders/order-lifecycle-guard';
export class SettlementService {
  private auth = new ActorAuthorization();
  private payments: PaymentService;
  private shipments: ShipmentService;
  constructor(private db: Database) {
    this.payments = new PaymentService(db);
    this.shipments = new ShipmentService(db);
  }
  async list(actor: UserView, search: string, includeArchived = false) {
    await this.auth.require(this.db, actor, 'payments.record');
    return {
      orders: await this.db.query(
        "SELECT o.id,o.business_state AS \"businessState\",o.storage_state AS \"storageState\",o.order_number AS \"orderNumber\",r.snapshot->'input'->>'customerName' AS \"customerName\" FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE ($2::boolean OR o.storage_state='ACTIVE') AND ($1='' OR strpos(lower(o.order_number||' '||(r.snapshot->'input'->>'customerName')),lower($1))>0) ORDER BY o.created_at DESC,o.id DESC LIMIT 50",
        [search, includeArchived],
      ),
    };
  }
  async detail(actor: UserView, id: string): Promise<SettlementView> {
    const fresh = await this.auth.require(this.db, actor, 'payments.record');
    // ภาพรวมอ่านใน transaction เดียวเพื่อไม่ให้ยอดเงินกับจำนวนส่งมาจากคนละจังหวะ
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR SHARE', [id]);
      const order = await readOrder(sql, id);
      return {
        lifecycle: lifecycleState(order as unknown as Record<string, unknown>),
        orderId: id,
        orderNumber: order.order_number,
        invoiceNumber: order.invoice_number,
        customerName: order.snapshot.input.customerName,
        phone: order.snapshot.input.phone,
        revision: Number(order.latest_revision),
        version: Number(order.settlement_version),
        canRefund: fresh.role === 'ADMIN_PROMAX',
        rates: await this.payments.rates(sql),
        money: await moneySummary(sql, order),
        payments: await this.payments.list(sql, id),
        shipments: await this.shipments.list(sql, id),
        delivery: await this.shipments.summary(sql, order),
      };
    });
  }
}
