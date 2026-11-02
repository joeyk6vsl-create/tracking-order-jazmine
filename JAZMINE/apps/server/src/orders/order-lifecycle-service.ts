import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  LifecycleCommand,
  CancellationAgreement,
  LifecycleView,
} from '../../../../packages/contracts/src/order-lifecycle';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { ShipmentService } from '../settlements/shipment-service';
import { inspectLifecycle } from './order-lifecycle-view';
import { lifecycleEvent } from './order-lifecycle-guard';
export class OrderLifecycleService {
  private auth = new ActorAuthorization();
  private ships: ShipmentService;
  constructor(private db: Database) {
    this.ships = new ShipmentService(db);
  }
  async preview(actor: UserView, id: string): Promise<LifecycleView> {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const fresh = await this.auth.require(sql, actor, 'orders.manage');
      return {
        ...(await inspectLifecycle(sql, id, this.ships)),
        canManageArchive: fresh.role === 'ADMIN_PROMAX',
        canResolveFinance: fresh.role === 'ADMIN_PROMAX',
      };
    });
  }
  async command(
    actor: UserView,
    id: string,
    operation: 'cancel' | 'agreement' | 'archive' | 'restore',
    input: LifecycleCommand | CancellationAgreement,
  ) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(
        sql,
        actor,
        operation === 'cancel' ? 'orders.manage' : 'archive.manage',
        true,
      );
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [id]);
      await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
      const hash = createHash('sha256')
        .update(JSON.stringify({ actor: fresh.id, id, operation, input }))
        .digest('hex');
      const replay = (
        await sql.query('SELECT request_hash,result FROM order_lifecycle_commands WHERE id=$1', [
          input.requestId,
        ])
      )[0];
      if (replay) {
        if (replay.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າຕ່າງກັນ / Request changed', 409);
        return replay.result;
      }
      const before = await inspectLifecycle(sql, id, this.ships);
      if (before.checkToken !== input.checkToken)
        throw new AppError(
          'LIFECYCLE_CHANGED',
          'ຂໍ້ມູນປ່ຽນ ກວດອີກຄັ້ງ / Reload and review current order effects',
          409,
        );
      if (operation === 'cancel') {
        if (before.state.business === 'CANCELLED' || before.state.storage === 'ARCHIVED')
          throw new AppError(
            'ORDER_CLOSED',
            'ອໍເດີປິດແລ້ວ / Order already closed or archived',
            409,
          );
        await sql.query(
          "UPDATE orders SET business_state='CANCELLED',cancelled_at=now(),cancel_agreed_lak=NULL WHERE id=$1",
          [id],
        );
        const closed = await sql.query(
          "UPDATE shipments SET state='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancel_reason=$3 WHERE order_id=$1 AND state='PREPARED' RETURNING id",
          [id, fresh.id, input.reason],
        );
        await lifecycleEvent(sql, fresh, id, 'CANCEL', input.reason, {
          ...before.effects,
          originalTotal: before.originalTotal,
          netPaid: before.netPaid,
          closedPreparedShipments: closed.map((r) => r.id),
          financialResolution: 'DECISION_REQUIRED',
        });
      } else if (operation === 'agreement') {
        if (before.state.business !== 'CANCELLED' || !('agreedTotal' in input))
          throw new AppError(
            'NOT_CANCELLED',
            'ຍົກເລີກອໍເດີກ່ອນ / Cancellation agreement requires a cancelled order',
            409,
          );
        await sql.query(
          "UPDATE orders SET cancel_agreed_lak=$2,storage_state='ACTIVE' WHERE id=$1",
          [id, input.agreedTotal],
        );
        await lifecycleEvent(sql, fresh, id, 'AGREEMENT', input.reason, {
          before: before.state.agreedTotal,
          agreedTotal: input.agreedTotal,
          netPaid: before.netPaid,
          originalTotal: before.originalTotal,
        });
      } else if (operation === 'archive') {
        if (before.state.storage === 'ARCHIVED')
          throw new AppError('ALREADY_ARCHIVED', 'Archived already', 409);
        if (!before.archive.eligible)
          throw new AppError('ARCHIVE_NOT_READY', before.archive.reasons.join(' · '), 409);
        await sql.query("UPDATE orders SET storage_state='ARCHIVED' WHERE id=$1", [id]);
        await lifecycleEvent(sql, fresh, id, 'ARCHIVE', input.reason, {
          business: before.state.business,
          finance: before.finance,
        });
      } else {
        if (before.state.storage !== 'ARCHIVED')
          throw new AppError('NOT_ARCHIVED', 'Order is already active in lists', 409);
        await sql.query("UPDATE orders SET storage_state='ACTIVE' WHERE id=$1", [id]);
        await lifecycleEvent(sql, fresh, id, 'RESTORE', input.reason, {
          business: before.state.business,
        });
      }
      await sql.query(
        'UPDATE orders SET lifecycle_version=lifecycle_version+1,settlement_version=settlement_version+1 WHERE id=$1',
        [id],
      );
      const result = { ok: true, operation, orderId: id };
      await sql.query(
        'INSERT INTO order_lifecycle_commands(id,actor_id,request_hash,result) VALUES($1,$2,$3,$4)',
        [input.requestId, fresh.id, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
}
