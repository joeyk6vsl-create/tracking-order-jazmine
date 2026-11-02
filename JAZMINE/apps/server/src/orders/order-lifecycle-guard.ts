import { uuidv7 } from 'uuidv7';
import type { Sql } from '../database';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { LifecycleState } from '../../../../packages/contracts/src/order-lifecycle';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
export function lifecycleState(row: Record<string, unknown>): LifecycleState {
  return {
    business: row.business_state as LifecycleState['business'],
    storage: row.storage_state as LifecycleState['storage'],
    version: Number(row.lifecycle_version),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string).toISOString() : null,
    agreedTotal: row.cancel_agreed_lak == null ? null : String(row.cancel_agreed_lak),
  };
}
export async function assertOrderOperational(sql: Sql, id: string) {
  const row = (
    await sql.query('SELECT business_state,storage_state FROM orders WHERE id=$1', [id])
  )[0];
  if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ Order / Order not found', 404);
  if (row.business_state === 'CANCELLED')
    throw new AppError(
      'ORDER_CANCELLED',
      'ອໍເດີຍົກເລີກແລ້ວ / Order cancelled; history remains available',
      409,
    );
  if (row.storage_state === 'ARCHIVED')
    throw new AppError(
      'ORDER_ARCHIVED',
      'ໃຫ້ເຈົ້າຂອງເປີດຈາກ Archive ກ່ອນ / Ask the owner to restore this archived order',
      409,
    );
}
type LifecycleActor = Pick<UserView, 'id' | 'displayName'> | { id: null; displayName: string };
export async function lifecycleEvent(
  sql: Sql,
  actor: LifecycleActor,
  orderId: string,
  kind: string,
  reason: string,
  detail: Record<string, unknown>,
) {
  await sql.query(
    'INSERT INTO order_lifecycle_events(id,order_id,kind,actor_id,actor_name,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [uuidv7(), orderId, kind, actor.id, actor.displayName, reason, JSON.stringify(detail)],
  );
  await recordAudit(sql, actor.id, 'ORDER_' + kind, orderId, reason, detail);
}
export async function restoreForActivity(
  sql: Sql,
  actor: LifecycleActor,
  orderId: string,
  reason: string,
) {
  const rows = await sql.query(
    "UPDATE orders SET storage_state='ACTIVE',lifecycle_version=lifecycle_version+1 WHERE id=$1 AND storage_state='ARCHIVED' RETURNING id",
    [orderId],
  );
  if (rows.length)
    await lifecycleEvent(sql, actor, orderId, 'AUTO_RESTORE', reason, {
      trigger: 'NEW_RECORDED_ACTIVITY',
    });
}
