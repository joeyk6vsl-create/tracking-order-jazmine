import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { OrderSnapshot } from '../../../../packages/contracts/src/confirmation';
import type {
  SheetSnapshot,
  SheetInput,
  PartFile,
} from '../../../../packages/contracts/src/production';
import { WORK_STAGES, type WorkState } from '../../../../packages/contracts/src/production-work';
import type {
  RevisionReviewInput,
  RevisionReviewResult,
  RevisionReviewView,
  RevisionSource,
} from '../../../../packages/contracts/src/production-revisions';
import { goodsKey, fulfillmentLines } from '../../../../packages/contracts/src/fulfillment';
import { Database, type Sql } from '../database';
import { assertOrderOperational } from '../orders/order-lifecycle-guard';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { sourceShipped } from '../shared/fulfillment-ledger';
import { losses, checkCapacity, updatePreparation } from './quantities';
import { context, required, iso } from './production-context';
import { carryFingerprint } from './revision-inheritance';
import { closedSourceGuard } from './revision-reversal-service';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Row = Record<string, unknown>;
type Source = { row: Row; snapshot: SheetSnapshot | null; stages: Row[]; view: RevisionSource };
export class RevisionReviewService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private read(sql: Sql, actor: UserView) {
    return this.auth.require(
      sql,
      actor,
      actor.department === 'GRAPHIC' ? 'graphic.approve' : 'production.resolve',
    );
  }
  private async inspect(sql: Sql, orderId: string) {
    const order = (
      await sql.query(
        'SELECT o.id,o.order_number,o.latest_revision AS revision,r.snapshot,r.confirmed_at FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.id=$1',
        [orderId],
      )
    )[0];
    if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);
    const target = order.snapshot as OrderSnapshot,
      ctx = context(order),
      targetLines = fulfillmentLines(target);
    const old = await sql.query(
      "SELECT s.*,v.snapshot FROM production_sheets s LEFT JOIN production_sheet_versions v ON v.sheet_id=s.id AND v.version=s.issued_version WHERE s.order_id=$1 AND s.order_revision<>$2 AND s.state<>'CANCELLED' ORDER BY s.id",
      [orderId, order.revision],
    );
    if (old.length > 100)
      throw new AppError('REVIEW_LIMIT', 'ໃບເກົ່າເກີນ 100 / Ask the administrator to review', 409);
    const ids = old.map((r) => String(r.id)),
      adjustments = await losses(sql, ids);
    const stages = ids.length
      ? await sql.query(
          'SELECT * FROM production_stage_work WHERE sheet_id=ANY($1::uuid[]) ORDER BY sheet_id,sheet_version,department',
          [ids],
        )
      : [];
    const issues = ids.length
      ? await sql.query(
          "SELECT id,sheet_id,row_version FROM production_issues WHERE sheet_id=ANY($1::uuid[]) AND state='OPEN' ORDER BY id",
          [ids],
        )
      : [];
    const assetIds = [
      ...new Set(
        [
          ...target.assets,
          ...old.flatMap((r) => (r.snapshot as SheetSnapshot | null)?.context.assets ?? []),
        ].map((a) => a.id),
      ),
    ];
    const assets = assetIds.length
      ? await sql.query(
          'SELECT id,kind,sha256,status FROM graphic_assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',
          [assetIds],
        )
      : [];
    const fingerprint = (selected: typeof target.assets) =>
      selected
        .map((a) => {
          const stored = assets.find((r) => r.id === a.id);
          return stored?.status === 'APPROVED'
            ? `${stored.kind}:${stored.sha256}`
            : `unapproved:${a.id}`;
        })
        .sort()
        .join('|');
    const sources: Source[] = [];
    for (const row of old) {
      const snapshot = row.snapshot as SheetSnapshot | null,
        sent = await sourceShipped(sql, String(row.id)),
        blocked: string[] = [];
      if (row.state !== 'READY' || !snapshot)
        blocked.push('ໃບຍັງບໍ່ພ້ອມ / Source instructions are not ready');
      if (issues.some((i) => i.sheet_id === row.id))
        blocked.push('ປິດປັນຫາຄ້າງກ່ອນ / Resolve open issues first');
      if (
        snapshot &&
        (fingerprint(snapshot.context.assets) !== fingerprint(target.assets) ||
          target.assets.some(
            (t) =>
              !assets.some((a) => a.id === t.id && a.kind === t.kind && a.status === 'APPROVED'),
          ))
      )
        blocked.push('ແບບ/ໄຟລ໌ປ່ຽນ / Artwork changed; prepare new production');
      const ownStages = stages.filter(
        (w) => w.sheet_id === row.id && Number(w.sheet_version) === Number(row.issued_version),
      );
      const allocations = row.allocations as SheetInput['allocations'];
      const lines = allocations.map((a) => {
        const loss = adjustments.find((l) => l.sheet_id === row.id && l.line_index === a.lineIndex),
          shipped = sent.find((s) => s.line_index === a.lineIndex)?.quantity ?? 0,
          source = snapshot?.context.lines[a.lineIndex];
        return {
          sourceLineIndex: a.lineIndex,
          size: source?.size ?? '—',
          allocated: a.quantity,
          scrap: loss?.scrap ?? 0,
          released: loss?.released ?? 0,
          shipped,
          reusable: Math.max(0, a.quantity - (loss?.scrap ?? 0) - (loss?.released ?? 0) - shipped),
          targets: source
            ? targetLines
                .filter((l) => l.key === goodsKey(source))
                .map((l) => ({ lineIndex: l.lineIndex, size: l.size }))
            : [],
        };
      });
      const view: RevisionSource = {
        id: String(row.id),
        number: String(row.sheet_number ?? 'Draft PS'),
        orderRevision: Number(row.order_revision),
        state: String(row.state),
        blockers: blocked,
        lines,
        stages: WORK_STAGES.map((department) => ({
          department,
          state: (ownStages.find((s) => s.department === department)?.state ??
            'NOT_STARTED') as WorkState,
        })),
        names: (snapshot?.printDetails?.names ?? []).map((n, index) => ({
          index,
          sourceLineIndex: n.lineIndex,
          name: n.name,
          number: n.number,
        })),
      };
      sources.push({ row, snapshot, stages: ownStages, view });
    }
    const currentSheets = await sql.query(
      "SELECT id,row_version,allocations,state FROM production_sheets WHERE order_id=$1 AND order_revision=$2 AND state<>'CANCELLED' ORDER BY id",
      [orderId, order.revision],
    );
    const shipped = await sql.query(
      'SELECT s.id,s.state,a.sheet_id,a.sheet_version,a.line_index,a.goods_key,a.quantity FROM shipments s JOIN shipment_allocations a ON a.shipment_id=s.id WHERE s.order_id=$1 ORDER BY s.id,a.sheet_id,a.line_index',
      [orderId],
    );
    return {
      ctx,
      target,
      sources,
      issues,
      token: hash({ order, sources, adjustments, assets, currentSheets, shipped }),
    };
  }
  async preview(actor: UserView, orderId: string): Promise<RevisionReviewView> {
    return this.db.transaction(async (sql) => {
      await this.read(sql, actor);
      const p = await this.inspect(sql, orderId);
      const rows = await sql.query(
        'SELECT r.*,x.actor_name AS reversed_by,x.reason AS reversal_reason,x.created_at AS reversed_at FROM production_revision_reviews r LEFT JOIN production_revision_reversals x ON x.review_id=r.id WHERE r.order_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 20',
        [orderId],
      );
      return {
        context: p.ctx,
        canReview: actor.role === 'ADMIN_PROMAX' || actor.department === 'ADMIN',
        checkToken: p.token,
        sources: p.sources.map((s) => s.view),
        history: rows.map((r) => ({
          id: String(r.id),
          revision: Number(r.order_revision),
          actorName: String(r.actor_name),
          reason: String(r.reason),
          at: iso(r.created_at),
          result: r.result as RevisionReviewResult,
          reversal: r.reversed_at
            ? {
                actorName: String(r.reversed_by),
                reason: String(r.reversal_reason),
                at: iso(r.reversed_at),
              }
            : null,
        })),
      };
    });
  }
  async apply(
    actor: UserView,
    orderId: string,
    input: RevisionReviewInput,
  ): Promise<RevisionReviewResult> {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'production.resolve', true);
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [orderId]);
      await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
      const requestHash = hash({ actor: fresh.id, orderId, input });
      const old = (
        await sql.query('SELECT request_hash,result FROM production_revision_reviews WHERE id=$1', [
          input.requestId,
        ])
      )[0];
      if (old) {
        if (old.request_hash !== requestHash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າຕ່າງກັນ / Request changed', 409);
        return old.result as RevisionReviewResult;
      }
      await assertOrderOperational(sql, orderId);
      const p = await this.inspect(sql, orderId);
      if (p.ctx.revision !== input.orderRevision || p.token !== input.checkToken)
        throw new AppError(
          'REVIEW_CHANGED',
          'ຂໍ້ມູນປ່ຽນ ກະລຸນາກວດໃໝ່ / Review current data again',
          409,
        );
      if (
        !p.sources.length ||
        input.decisions.length !== p.sources.length ||
        p.sources.some((s) => !input.decisions.some((d) => d.sheetId === s.row.id))
      )
        throw new AppError('REVIEW_INCOMPLETE', 'ກວດໃບເກົ່າໃຫ້ຄົບ / Review every old sheet', 409);
      if (p.issues.length)
        throw new AppError('ISSUE_OPEN', 'ປິດປັນຫາຄ້າງກ່ອນ / Resolve open issues first', 409);
      await sql.query(
        'INSERT INTO production_revision_reviews(id,order_id,order_revision,actor_id,actor_name,reason,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          input.requestId,
          orderId,
          p.ctx.revision,
          fresh.id,
          fresh.displayName,
          input.reason,
          requestHash,
          '{}',
        ],
      );
      for (const s of p.sources)
        await sql.query(
          "UPDATE production_sheets SET state='CANCELLED',row_version=row_version+1,updated_by=$2,updated_at=now() WHERE id=$1",
          [s.row.id, fresh.id],
        );
      const result: RevisionReviewResult = {
        ok: true,
        reviewId: input.requestId,
        revision: p.ctx.revision,
        sheets: [],
      };
      for (const s of p.sources) {
        const decision = input.decisions.find((d) => d.sheetId === s.row.id)!,
          snap = s.snapshot;
        if (decision.rows.length && s.view.blockers.length)
          throw new AppError('REUSE_NOT_ALLOWED', s.view.blockers.join(' · '), 409);
        for (const r of decision.rows) {
          const line = s.view.lines.find((l) => l.sourceLineIndex === r.sourceLineIndex);
          if (
            !line ||
            r.quantity > line.reusable ||
            !line.targets.some((t) => t.lineIndex === r.targetLineIndex)
          )
            throw new AppError(
              'REUSE_QUANTITY',
              'ແບບ/Size/ຈຳນວນບໍ່ກົງ / Invalid reuse quantity or target',
              409,
            );
        }
        const chosenNames = decision.nameIndexes.map((i) => {
          const n = s.view.names.find((n) => n.index === i),
            mapping = n && decision.rows.find((r) => r.sourceLineIndex === n.sourceLineIndex);
          if (!n || !mapping)
            throw new AppError(
              'REUSE_NAMES',
              'ກວດຊື່ ແລະ ເບີທີ່ໃຊ້ຕໍ່ / Review retained names',
              409,
            );
          return { lineIndex: mapping.targetLineIndex, name: n.name, number: n.number };
        });
        for (const mapping of decision.rows) {
          const line = s.view.lines.find((l) => l.sourceLineIndex === mapping.sourceLineIndex)!,
            names = s.view.names.filter(
              (n) => n.sourceLineIndex === mapping.sourceLineIndex,
            ).length,
            kept = decision.nameIndexes.filter(
              (i) =>
                s.view.names.find((n) => n.index === i)?.sourceLineIndex ===
                mapping.sourceLineIndex,
            ).length;
          if (
            kept > mapping.quantity ||
            kept < Math.max(0, mapping.quantity - (line.allocated - names))
          )
            throw new AppError(
              'REUSE_NAMES',
              'ຈຳນວນຊື່ທີ່ໃຊ້ຕໍ່ບໍ່ກົງ / Retained names do not match quantity',
              409,
            );
        }
        let targetId: string | null = null;
        const number = null;
        const qty = decision.rows.reduce((n, r) => n + r.quantity, 0),
          available = s.view.lines.reduce((n, l) => n + l.reusable, 0);
        if (qty && snap) {
          targetId = uuidv7();
          const quantities = new Map<number, number>();
          for (const r of decision.rows)
            quantities.set(
              r.targetLineIndex,
              (quantities.get(r.targetLineIndex) ?? 0) + r.quantity,
            );
          const allocations = [...quantities]
              .map(([lineIndex, quantity]) => ({ lineIndex, quantity }))
              .sort((a, b) => a.lineIndex - b.lineIndex),
            details = { ...(snap.printDetails ?? { priority: 'UNSPECIFIED' }), names: chosenNames };
          await checkCapacity(
            sql,
            orderId,
            p.ctx.revision,
            targetId,
            allocations,
            p.ctx.lines.map((l) => l.quantity),
          );
          const notes = snap.notes;
          await sql.query(
            'INSERT INTO production_sheets(id,order_id,order_revision,allocations,notes,request_hash,created_by,updated_by,print_details) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)',
            [
              targetId,
              orderId,
              p.ctx.revision,
              JSON.stringify(allocations),
              notes,
              hash({ review: input.requestId, source: s.row.id }),
              fresh.id,
              JSON.stringify(details),
            ],
          );
          const files: PartFile[] = [];
          for (const file of snap.files) {
            const id = uuidv7(),
              copied = (
                await sql.query(
                  "INSERT INTO production_part_files(id,sheet_id,part,revision,filename,mime,file_data,sha256,request_hash,created_by,source_file_id) SELECT $1,$2,part,1,filename,mime,''::bytea,sha256,$3,$4,COALESCE(source_file_id,id) FROM production_part_files WHERE id=$5 RETURNING id,part,revision,filename,mime",
                  [
                    id,
                    targetId,
                    hash({ review: input.requestId, sourceFile: file.id }),
                    fresh.id,
                    file.id,
                  ],
                )
              )[0];
            if (!copied)
              throw new AppError('REUSE_FILES', 'ບໍ່ພົບໄຟລ໌ຕົ້ນທາງ / Source file missing', 409);
            files.push(copied as PartFile);
          }
          const parts = required(p.ctx, allocations);
          if (parts.some((part) => !files.some((f) => f.part === part)))
            throw new AppError('REUSE_FILES', 'ໄຟລ໌ບໍ່ຄົບ / Source files incomplete', 409);
        }
        await sql.query(
          'INSERT INTO production_revision_carries(source_sheet_id,review_id,source_version,target_sheet_id,mappings,quantities,inherited_stages,target_fingerprint,source_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(source_sheet_id) DO UPDATE SET review_id=EXCLUDED.review_id,source_version=EXCLUDED.source_version,target_sheet_id=EXCLUDED.target_sheet_id,mappings=EXCLUDED.mappings,quantities=EXCLUDED.quantities,inherited_stages=EXCLUDED.inherited_stages,target_fingerprint=EXCLUDED.target_fingerprint,source_state=EXCLUDED.source_state,source_guard=NULL,active=true WHERE NOT production_revision_carries.active',
          [
            s.row.id,
            input.requestId,
            Number(s.row.issued_version),
            targetId,
            JSON.stringify({ rows: decision.rows, nameIndexes: decision.nameIndexes }),
            JSON.stringify(
              s.view.lines.map((l) => ({
                ...l,
                reused:
                  decision.rows.find((r) => r.sourceLineIndex === l.sourceLineIndex)?.quantity ?? 0,
                notReused:
                  l.reusable -
                  (decision.rows.find((r) => r.sourceLineIndex === l.sourceLineIndex)?.quantity ??
                    0),
              })),
            ),
            JSON.stringify(s.stages),
            targetId ? await carryFingerprint(sql, targetId) : null,
            String(s.row.state),
          ],
        );
        result.sheets.push({
          sourceSheetId: String(s.row.id),
          targetSheetId: targetId,
          number,
          reused: qty,
          notReused: available - qty,
        });
      }
      for (const s of p.sources)
        await sql.query(
          'UPDATE production_revision_carries SET source_guard=$2 WHERE source_sheet_id=$1 AND review_id=$3',
          [s.row.id, await closedSourceGuard(sql, String(s.row.id)), input.requestId],
        );
      await updatePreparation(sql, orderId);
      await recordAudit(sql, fresh.id, 'PRODUCTION_REVISION_REVIEWED', orderId, input.reason, {
        reviewId: input.requestId,
        revision: p.ctx.revision,
        sheets: result.sheets,
      });
      await sql.query('UPDATE production_revision_reviews SET result=$2 WHERE id=$1', [
        input.requestId,
        JSON.stringify(result),
      ]);
      return result;
    });
  }
}
