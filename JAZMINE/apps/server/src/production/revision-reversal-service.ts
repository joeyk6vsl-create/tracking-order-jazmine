import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import {
  revisionReversalSchema,
  type RevisionReversalInput,
  type RevisionReversalResult,
  type RevisionReversalView,
} from '../../../../packages/contracts/src/production-revisions';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { updatePreparation } from './quantities';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
// A checkpoint of the closed source, including quantity corrections and fulfilment.
// Never infer the original READY/DRAFT state for reviews predating this checkpoint.
export async function closedSourceGuard(sql: Sql, id: string) {
  const rows = await sql.query(
    `SELECT jsonb_build_object(
    'sheet',to_jsonb(s),
    'work',(SELECT jsonb_agg(to_jsonb(w) ORDER BY sheet_version,department) FROM production_stage_work w WHERE w.sheet_id=s.id),
    'issues',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM production_issues i WHERE i.sheet_id=s.id),
    'resolutions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY issue_id,issue_version) FROM production_issue_resolutions r WHERE r.issue_id IN(SELECT id FROM production_issues WHERE sheet_id=s.id)),
    'shipments',(SELECT jsonb_agg(jsonb_build_object('shipment',to_jsonb(sh),'allocation',to_jsonb(a)) ORDER BY sh.id,a.line_index) FROM shipment_allocations a JOIN shipments sh ON sh.id=a.shipment_id WHERE a.sheet_id=s.id),
    'files',(SELECT jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'sha256',f.sha256) ORDER BY f.id) FROM production_part_files f WHERE f.sheet_id=s.id),
    'replacements',(SELECT jsonb_agg(to_jsonb(child) ORDER BY child.id) FROM production_replacements r JOIN production_sheets child ON child.id=r.sheet_id WHERE r.issue_id IN(SELECT id FROM production_issues WHERE sheet_id=s.id))
  ) AS checkpoint FROM production_sheets s WHERE s.id=$1`,
    [id],
  );
  return hash(rows[0]?.checkpoint ?? null);
}
export class RevisionReversalService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async inspect(sql: Sql, reviewId: string): Promise<RevisionReversalView> {
    const review = (
      await sql.query(
        'SELECT r.*,o.latest_revision,o.business_state,o.storage_state FROM production_revision_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=$1',
        [reviewId],
      )
    )[0];
    if (!review) throw new AppError('NOT_FOUND', 'Review not found', 404);
    const reversal = (
      await sql.query(
        'SELECT actor_name,reason,created_at FROM production_revision_reversals WHERE review_id=$1',
        [reviewId],
      )
    )[0];
    const carries = await sql.query(
      'SELECT * FROM production_revision_carry_records WHERE review_id=$1 ORDER BY source_sheet_id',
      [reviewId],
    );
    const blockers: string[] = [];
    const prepared = await sql.query(
      "SELECT * FROM shipments WHERE order_id=$1 AND state='PREPARED' ORDER BY id",
      [review.order_id],
    );
    if (prepared.length)
      blockers.push(
        'ມີລາຍການກຽມສົ່ງຄ້າງ / Review or cancel prepared deliveries before reversing this plan',
      );
    if (reversal) blockers.push('ຍົກເລີກແຜນນີ້ແລ້ວ / This plan was already reversed');
    if (review.business_state !== 'ACTIVE' || review.storage_state !== 'ACTIVE')
      blockers.push('Order ຍົກເລີກ/Archive ແລ້ວ / Order is cancelled or archived');
    if (Number(review.latest_revision) !== Number(review.order_revision))
      blockers.push(
        'Order ມີສະບັບໃໝ່ / Order revision changed; review the current production chain',
      );
    if (!carries.length || carries.some((c) => !c.source_guard || !c.source_state))
      blockers.push(
        'ແຜນເກົ່າບໍ່ມີຂໍ້ມູນຄືນສະຖານະ / This older plan has no restoration checkpoint; review manually',
      );
    const sheets: RevisionReversalView['sheets'] = [];
    const guards: unknown[] = [];
    for (const c of carries) {
      const source = (
        await sql.query('SELECT * FROM production_sheets WHERE id=$1', [c.source_sheet_id])
      )[0];
      const currentGuard = await closedSourceGuard(sql, String(c.source_sheet_id));
      guards.push(currentGuard);
      if (
        !reversal &&
        (!c.active || source?.state !== 'CANCELLED' || c.source_guard !== currentGuard)
      )
        blockers.push(
          `${source?.sheet_number ?? 'PS'}: ຂໍ້ມູນໃບເກົ່າປ່ຽນ / Source records changed; review manually`,
        );
      const target = c.target_sheet_id
        ? (await sql.query('SELECT * FROM production_sheets WHERE id=$1', [c.target_sheet_id]))[0]
        : null;
      if (c.target_sheet_id) {
        const activity = await sql.query(
          `SELECT
          EXISTS(SELECT 1 FROM production_stage_events WHERE sheet_id=$1) AS work,
          EXISTS(SELECT 1 FROM production_issues WHERE sheet_id=$1) AS issues,
          EXISTS(SELECT 1 FROM shipment_allocations WHERE sheet_id=$1) AS shipments,
          EXISTS(SELECT 1 FROM production_revision_carries WHERE source_sheet_id=$1 AND active) AS carried`,
          [c.target_sheet_id],
        );
        const stages = await sql.query(
          'SELECT department,state,row_version,started_at,started_by,completed_at,completed_by FROM production_stage_work WHERE sheet_id=$1 ORDER BY sheet_version,department',
          [c.target_sheet_id],
        );
        const inherited = (c.inherited_stages as Record<string, unknown>[])
          .map((s) => ({
            department: s.department,
            state: s.state,
            row_version: s.row_version,
            started_at: s.started_at,
            started_by: s.started_by,
            completed_at: s.completed_at,
            completed_by: s.completed_by,
          }))
          .sort((a, b) => String(a.department).localeCompare(String(b.department)));
        // DRAFT has no inherited work yet. READY v1 may contain only the frozen inherited work.
        const stageGuard =
          Number(target?.issued_version) === 0
            ? stages.length === 0
            : hash(stages) === hash(inherited);
        guards.push({ target, activity, stages });
        const a = activity[0];
        if (
          !reversal &&
          (!target ||
            Number(target.issued_version) > 1 ||
            (Number(target.issued_version) === 1 &&
              !['READY', 'CANCELLED'].includes(String(target.state))) ||
            !stageGuard)
        )
          blockers.push(
            `${target?.sheet_number ?? 'New PS'}: ໃບໃໝ່ປ່ຽນຈາກແຜນ / New instructions changed after approval; review manually`,
          );
        if (a.work || a.issues || a.shipments || a.carried)
          blockers.push(
            `${target?.sheet_number ?? 'New PS'}: ມີວຽກ/ປັນຫາ/ລາຍການສົ່ງຕໍ່ແລ້ວ / New work, issues, delivery records or another reuse plan exists; review manually`,
          );
      }
      sheets.push({
        sourceSheetId: String(c.source_sheet_id),
        sourceNumber: String(source?.sheet_number ?? 'Draft PS'),
        sourceState: c.source_state ? String(c.source_state) : null,
        targetSheetId: c.target_sheet_id ? String(c.target_sheet_id) : null,
        targetNumber: target ? String(target.sheet_number ?? 'Draft PS') : null,
        targetState: target ? String(target.state) : null,
      });
    }
    const unique = [...new Set(blockers)];
    return {
      reviewId,
      orderId: String(review.order_id),
      revision: Number(review.order_revision),
      canReverse: !unique.length,
      blockers: unique,
      sheets,
      checkToken: hash({ review, carries, guards, reversal, prepared }),
      reversal: reversal
        ? {
            actorName: String(reversal.actor_name),
            reason: String(reversal.reason),
            at: new Date(reversal.created_at as string).toISOString(),
          }
        : null,
    };
  }
  async preview(actor: UserView, reviewId: string) {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      await this.auth.require(sql, actor, 'production.resolve');
      return this.inspect(sql, reviewId);
    });
  }
  async reverse(
    actor: UserView,
    reviewId: string,
    raw: RevisionReversalInput,
  ): Promise<RevisionReversalResult> {
    const input = revisionReversalSchema.parse(raw);
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'production.resolve', true);
      const review = (
        await sql.query('SELECT order_id FROM production_revision_reviews WHERE id=$1', [reviewId])
      )[0];
      if (!review) throw new AppError('NOT_FOUND', 'Review not found', 404);
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [review.order_id]);
      await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
      const requestHash = hash({ actor: fresh.id, reviewId, input });
      const previous = (
        await sql.query(
          'SELECT request_hash,result FROM production_revision_reversals WHERE id=$1',
          [input.requestId],
        )
      )[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new AppError('REQUEST_CONFLICT', 'Request changed', 409);
        return previous.result as RevisionReversalResult;
      }
      const view = await this.inspect(sql, reviewId);
      if (view.reversal)
        throw new AppError('REVIEW_ALREADY_REVERSED', 'This plan was already reversed', 409);
      if (view.checkToken !== input.checkToken)
        throw new AppError(
          'REVIEW_CHANGED',
          'ຂໍ້ມູນປ່ຽນ ກວດໃໝ່ / Data changed; check the reversal again',
          409,
        );
      if (!view.canReverse) throw new AppError('REVERSAL_BLOCKED', view.blockers.join(' · '), 409);
      const result: RevisionReversalResult = {
        ok: true,
        reviewId,
        reversalId: input.requestId,
        restoredSheetIds: view.sheets.map((s) => s.sourceSheetId),
        cancelledSheetIds: view.sheets.flatMap((s) => (s.targetSheetId ? [s.targetSheetId] : [])),
      };
      for (const sheet of view.sheets) {
        if (sheet.targetSheetId)
          await sql.query(
            "UPDATE production_sheets SET state='CANCELLED',row_version=row_version+1,updated_by=$2,updated_at=now() WHERE id=$1",
            [sheet.targetSheetId, fresh.id],
          );
        await sql.query(
          'UPDATE production_sheets SET state=$2,row_version=row_version+1,updated_by=$3,updated_at=now() WHERE id=$1',
          [sheet.sourceSheetId, sheet.sourceState, fresh.id],
        );
      }
      await sql.query('UPDATE production_revision_carries SET active=false WHERE review_id=$1', [
        reviewId,
      ]);
      await sql.query(
        'INSERT INTO production_revision_carry_history SELECT * FROM production_revision_carries WHERE review_id=$1',
        [reviewId],
      );
      await sql.query(
        'INSERT INTO production_revision_reversals(id,review_id,actor_id,actor_name,reason,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.requestId,
          reviewId,
          fresh.id,
          fresh.displayName,
          input.reason,
          requestHash,
          JSON.stringify(result),
        ],
      );
      await updatePreparation(sql, String(review.order_id));
      await recordAudit(
        sql,
        fresh.id,
        'PRODUCTION_REVISION_REVERSED',
        String(review.order_id),
        input.reason,
        result,
      );
      return result;
    });
  }
}
