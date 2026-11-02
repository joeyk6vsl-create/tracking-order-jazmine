import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import {
  archiveSettingsSchema,
  type ArchiveSettingsView,
} from '../../../../packages/contracts/src/order-lifecycle';
import type { z } from 'zod';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { ShipmentService } from '../settlements/shipment-service';
import { inspectLifecycle } from './order-lifecycle-view';
import { lifecycleEvent } from './order-lifecycle-guard';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function settingsView(sql: Sql): Promise<ArchiveSettingsView> {
  const r = (
    await sql.query(
      "SELECT s.*,(SELECT count(*)::int FROM order_archive_candidates c JOIN orders o ON o.id=c.order_id WHERE c.eligible_since IS NOT NULL AND c.policy_version=s.row_version AND o.storage_state='ACTIVE') AS waiting FROM archive_settings s WHERE id=true",
    )
  )[0];
  return {
    enabled: !!r.enabled,
    rowVersion: Number(r.row_version),
    actorName: String(r.actor_name),
    reason: String(r.reason),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    lastRunAt: r.last_run_at ? new Date(r.last_run_at as string).toISOString() : null,
    waiting: Number(r.waiting),
  };
}
export class ArchiveAutomationService {
  private auth = new ActorAuthorization();
  private ships: ShipmentService;
  constructor(private db: Database) {
    this.ships = new ShipmentService(db);
  }
  async settings(actor: UserView) {
    await this.auth.require(this.db, actor, 'archive.manage');
    return settingsView(this.db);
  }
  async save(actor: UserView, raw: z.infer<typeof archiveSettingsSchema>) {
    const input = archiveSettingsSchema.parse(raw);
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'archive.manage', true);
      await sql.query('SELECT id FROM archive_settings WHERE id=true FOR UPDATE');
      const requestHash = hash({ actor: fresh.id, input }),
        old = (
          await sql.query('SELECT request_hash,result FROM archive_settings_commands WHERE id=$1', [
            input.requestId,
          ])
        )[0];
      if (old) {
        if (old.request_hash !== requestHash)
          throw new AppError('REQUEST_CONFLICT', 'Request changed', 409);
        return old.result as ArchiveSettingsView;
      }
      const before = await settingsView(sql);
      if (before.rowVersion !== input.rowVersion)
        throw new AppError('STALE_STATE', 'Reload current archive settings', 409);
      await sql.query(
        'UPDATE archive_settings SET enabled=$1,row_version=row_version+1,actor_id=$2,actor_name=$3,reason=$4,updated_at=now(),scan_after=NULL WHERE id=true',
        [input.enabled, fresh.id, fresh.displayName, input.reason],
      );
      const result = await settingsView(sql);
      await recordAudit(
        sql,
        fresh.id,
        'ARCHIVE_AUTOMATION_SETTINGS_CHANGED',
        fresh.id,
        input.reason,
        { before, result },
      );
      await sql.query(
        'INSERT INTO archive_settings_commands(id,request_hash,result) VALUES($1,$2,$3)',
        [input.requestId, requestHash, JSON.stringify(result)],
      );
      return result;
    });
  }
  async processBatch(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid archive batch limit');
    const ids = await this.db.transaction(async (sql) => {
      const s = (await sql.query('SELECT * FROM archive_settings WHERE id=true FOR UPDATE'))[0];
      if (!s.enabled) return [];
      let rows = await sql.query(
        "SELECT id FROM orders WHERE storage_state='ACTIVE' AND ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2",
        [s.scan_after, limit],
      );
      if (!rows.length && s.scan_after)
        rows = await sql.query(
          "SELECT id FROM orders WHERE storage_state='ACTIVE' ORDER BY id LIMIT $1",
          [limit],
        );
      await sql.query('UPDATE archive_settings SET scan_after=$1,last_run_at=now() WHERE id=true', [
        rows.at(-1)?.id ?? null,
      ]);
      return rows.map((r) => String(r.id));
    });
    let archived = 0;
    for (const id of ids)
      archived += await this.db
        .transaction(async (sql) => {
          const policy = (
            await sql.query(
              'SELECT enabled,row_version FROM archive_settings WHERE id=true FOR SHARE',
            )
          )[0];
          if (!policy.enabled) return 0;
          const order = (
            await sql.query('SELECT storage_state FROM orders WHERE id=$1 FOR UPDATE', [id])
          )[0];
          if (order?.storage_state !== 'ACTIVE') return 0;
          await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
          const view = await inspectLifecycle(sql, id, this.ships);
          const candidate = (
            await sql.query(
              "SELECT *,eligible_since+interval '15 days'<=now() AS waited FROM order_archive_candidates WHERE order_id=$1",
              [id],
            )
          )[0];
          if (!view.archive.baseEligible) {
            await sql.query(
              'INSERT INTO order_archive_candidates(order_id,policy_version) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET eligible_since=NULL,activity_token=NULL,policy_version=EXCLUDED.policy_version',
              [id, policy.row_version],
            );
            return 0;
          }
          if (
            !candidate?.eligible_since ||
            candidate.activity_token !== view.archive.activityToken ||
            candidate.policy_version !== policy.row_version
          ) {
            await sql.query(
              'INSERT INTO order_archive_candidates(order_id,eligible_since,activity_token,policy_version) VALUES($1,now(),$2,$3) ON CONFLICT(order_id) DO UPDATE SET eligible_since=EXCLUDED.eligible_since,activity_token=EXCLUDED.activity_token,policy_version=EXCLUDED.policy_version',
              [id, view.archive.activityToken, policy.row_version],
            );
            return 0;
          }
          if (!candidate.waited || !view.archive.eligible) return 0;
          await sql.query(
            "UPDATE orders SET storage_state='ARCHIVED',lifecycle_version=lifecycle_version+1,settlement_version=settlement_version+1 WHERE id=$1",
            [id],
          );
          await lifecycleEvent(
            sql,
            { id: null, displayName: 'JAZMINE automatic archive' },
            id,
            'ARCHIVE',
            'Archive conditions remained clear for 15 days',
            {
              automatic: true,
              policyVersion: policy.row_version,
              eligibleSince: new Date(candidate.eligible_since as string).toISOString(),
              business: view.state.business,
              finance: view.finance,
            },
          );
          return 1;
        })
        .catch(() => {
          console.error('ยังเก็บออเดอร์บางรายการไม่ได้ จะตรวจใหม่ในรอบถัดไป');
          return 0;
        });
    return archived;
  }
}
