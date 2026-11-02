import { createHash } from 'node:crypto';
import type { UserView, Permission } from '../../../../packages/contracts/src/identity';
import type { OrderSnapshot } from '../../../../packages/contracts/src/confirmation';
import type { SettlementAction, MoneySummary } from '../../../../packages/contracts/src/settlement';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
export { nextDocumentNumber as nextNumber } from '../shared/document-number';
import { restoreForActivity } from '../orders/order-lifecycle-guard';
export type OrderRow = {
  business_state: 'ACTIVE' | 'CANCELLED';
  storage_state: 'ACTIVE' | 'ARCHIVED';
  lifecycle_version: number;
  cancelled_at: string | null;
  cancel_agreed_lak: string | null;
  id: string;
  order_number: string;
  invoice_number: string;
  latest_revision: number;
  settlement_version: number;
  snapshot: OrderSnapshot;
};
export async function readOrder(sql: Sql, id: string): Promise<OrderRow> {
  const row = (
    await sql.query(
      'SELECT o.*,r.snapshot FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.id=$1',
      [id],
    )
  )[0];
  if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ Order', 404);
  return row as unknown as OrderRow;
}
export async function moneySummary(sql: Sql, order: OrderRow): Promise<MoneySummary> {
  const entries = await sql.query(
    "SELECT kind,sum(lak_amount)::text AS amount FROM payment_entries WHERE order_id=$1 AND state='ACTIVE' GROUP BY kind",
    [order.id],
  );
  const received = BigInt(String(entries.find((e) => e.kind === 'RECEIPT')?.amount ?? '0')),
    refunded = BigInt(String(entries.find((e) => e.kind === 'REFUND')?.amount ?? '0')),
    paid = received - refunded,
    total = BigInt(order.snapshot.pricing.total!),
    pending = order.business_state === 'CANCELLED' && order.cancel_agreed_lak == null,
    obligation =
      order.business_state === 'CANCELLED' ? BigInt(order.cancel_agreed_lak ?? '0') : total;
  if (paid < 0n) throw new AppError('MONEY_INVARIANT', 'ຍອດເງິນບໍ່ສອດຄ່ອງ ໃຫ້ເຈົ້າຂອງກວດສອບ', 409);
  return {
    total: String(total),
    received: String(received),
    refunded: String(refunded),
    netPaid: String(paid),
    due: String(!pending && obligation > paid ? obligation - paid : 0n),
    overpaid: String(!pending && paid > obligation ? paid - obligation : 0n),
    status: pending
      ? 'UNPAID'
      : paid > obligation
        ? 'OVERPAID'
        : paid === obligation
          ? 'PAID'
          : paid === 0n
            ? 'UNPAID'
            : 'PARTIALLY_PAID',
    resolutionRequired: pending || paid > obligation,
  };
}
export class SettlementLedger {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async command(
    actor: UserView,
    id: string,
    permission: Permission,
    operation: string,
    input: SettlementAction,
    run: (sql: Sql, actor: UserView, order: OrderRow) => Promise<unknown>,
  ) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, permission, true);
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [id]);
      const order = await readOrder(sql, id),
        hash = createHash('sha256')
          .update(JSON.stringify({ actor: fresh.id, id, operation, input }))
          .digest('hex'),
        old = (
          await sql.query('SELECT request_hash,result FROM settlement_commands WHERE id=$1', [
            input.requestId,
          ])
        )[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າມີຂໍ້ມູນຕ່າງກັນ', 409);
        return old.result;
      }
      if (
        Number(order.latest_revision) !== input.orderRevision ||
        Number(order.settlement_version) !== input.expectedVersion
      )
        throw new AppError('STALE_STATE', 'Order / ລາຍການເງິນຫຼືສົ່ງປ່ຽນແລ້ວ ກະລຸນາ Reload', 409);
      const result = await run(sql, fresh, order);
      await restoreForActivity(sql, fresh, id, input.reason);
      await sql.query('UPDATE orders SET settlement_version=settlement_version+1 WHERE id=$1', [
        id,
      ]);
      await sql.query(
        'INSERT INTO settlement_commands(id,actor_id,request_hash,result) VALUES($1,$2,$3,$4)',
        [input.requestId, fresh.id, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
}
