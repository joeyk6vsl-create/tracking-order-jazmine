import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  IssueCorrectionInput,
  IssueCorrectionResult,
  CorrectionView,
  CorrectionRow,
} from '../../../../packages/contracts/src/issue-corrections';
import type { IssueResolve } from '../../../../packages/contracts/src/production-exceptions';
import type { SheetInput, SheetSnapshot } from '../../../../packages/contracts/src/production';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { sourceShipped } from '../shared/fulfillment-ledger';
import { restoreForActivity } from '../orders/order-lifecycle-guard';
import { losses, productionStock, updatePreparation } from './quantities';
import { replacementUsage, resolutionHistory } from './issue-resolution-ledger';
import {
  correctionRows,
  validateReplacementAllowance,
  assertCurrentOrderCapacity,
  validDraftNames,
} from './issue-correction-guards';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Row = Record<string, unknown>;
export class IssueCorrectionService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async inspect(sql: Sql, issueId: string) {
    const issue = (await sql.query('SELECT * FROM production_issues WHERE id=$1', [issueId]))[0];
    if (!issue) throw new AppError('NOT_FOUND', 'ບໍ່ພົບປັນຫາ / Issue not found', 404);
    if (issue.state !== 'RESOLVED')
      throw new AppError(
        'ISSUE_NOT_RESOLVED',
        'ປິດປັນຫາກ່ອນ ຫຼືໃຊ້ຟອມຢືນຢັນ / Resolve the open issue first',
        409,
      );
    const sheet = (
      await sql.query(
        'SELECT s.*,o.latest_revision FROM production_sheets s JOIN orders o ON o.id=s.order_id WHERE s.id=$1',
        [issue.sheet_id],
      )
    )[0];
    const snapshot = (
      await sql.query(
        'SELECT snapshot FROM production_sheet_versions WHERE sheet_id=$1 AND version=$2',
        [sheet.id, issue.sheet_version],
      )
    )[0].snapshot as SheetSnapshot;
    const own = await sql.query(
        'SELECT line_index,scrap_qty,release_qty FROM production_current_losses WHERE issue_id=$1 ORDER BY line_index',
        [issueId],
      ),
      all = await losses(sql, [String(sheet.id)]),
      sent = await sourceShipped(sql, String(sheet.id));
    const carry = (
        await sql.query(
          'SELECT mappings,review_id FROM production_revision_carries WHERE source_sheet_id=$1 AND active',
          [sheet.id],
        )
      )[0],
      mapping =
        (carry?.mappings as { rows: { sourceLineIndex: number; quantity: number }[] } | undefined)
          ?.rows ?? [];
    const children = await sql.query(
      'SELECT s.*,EXISTS(SELECT 1 FROM production_revision_carries c WHERE c.target_sheet_id=s.id AND c.active) AS pending_carry FROM production_replacements r JOIN production_sheets s ON s.id=r.sheet_id WHERE r.issue_id=$1 ORDER BY s.id',
      [issueId],
    );
    const usage = await replacementUsage(sql, issueId),
      stock = await productionStock(sql, String(sheet.order_id));
    const view: Omit<CorrectionView, 'history'> = {
      issueId,
      sheetId: String(sheet.id),
      sheetNumber: String(sheet.sheet_number),
      rowVersion: Number(issue.row_version),
      sheetRowVersion: Number(sheet.row_version),
      checkToken: '',
      currentRows: correctionRows((issue.resolution_rows ?? []) as CorrectionRow[]),
      lines: snapshot.allocations.map((a) => {
        const allocated =
            (sheet.allocations as SheetInput['allocations']).find(
              (x) => x.lineIndex === a.lineIndex,
            )?.quantity ?? 0,
          base = own.find((l) => Number(l.line_index) === a.lineIndex),
          total = all.find((l) => l.line_index === a.lineIndex);
        return {
          lineIndex: a.lineIndex,
          size: snapshot.context.lines[a.lineIndex]?.size ?? '—',
          allocated,
          reviewLimit: Math.min(a.quantity, allocated),
          reported:
            (issue.affected as { lineIndex: number; quantity: number }[]).find(
              (l) => l.lineIndex === a.lineIndex,
            )?.quantity ?? 0,
          otherLoss:
            (total?.scrap ?? 0) +
            (total?.released ?? 0) -
            Number(base?.scrap_qty ?? 0) -
            Number(base?.release_qty ?? 0),
          shipped: sent.find((l) => l.line_index === a.lineIndex)?.quantity ?? 0,
          carried: mapping
            .filter((r) => r.sourceLineIndex === a.lineIndex)
            .reduce((n, r) => n + r.quantity, 0),
        };
      }),
      replacements: children.map((s) => ({
        id: String(s.id),
        number: String(s.sheet_number ?? 'Draft PS'),
        state: String(s.state),
        rowVersion: Number(s.row_version),
        editable:
          s.state === 'DRAFT' &&
          Number(s.issued_version) === 0 &&
          Number(s.order_revision) === Number(sheet.latest_revision) &&
          !s.pending_carry,
        allocations: s.allocations as SheetInput['allocations'],
      })),
      replacementUsage: usage,
    };
    view.checkToken = hash({
      issue,
      sheet,
      own,
      all,
      sent,
      carry,
      children,
      currentAllocated: stock.allocated,
      currentSheets: stock.sheets,
      currentShipped: stock.shipped,
    });
    return { issue, sheet, snapshot, view, children, own };
  }
  async preview(actor: UserView, id: string): Promise<CorrectionView> {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.auth.require(sql, actor, 'production.resolve');
      const p = await this.inspect(sql, id);
      return { ...p.view, history: await resolutionHistory(sql, id) };
    });
  }
  async correct(
    actor: UserView,
    id: string,
    input: IssueCorrectionInput,
  ): Promise<IssueCorrectionResult> {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'production.resolve', true),
        first = (await sql.query('SELECT sheet_id FROM production_issues WHERE id=$1', [id]))[0];
      if (!first) throw new AppError('NOT_FOUND', 'Issue not found', 404);
      const order = (
        await sql.query('SELECT order_id FROM production_sheets WHERE id=$1', [first.sheet_id])
      )[0];
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [order.order_id]);
      await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
      await sql.query('SELECT id FROM production_issues WHERE id=$1 FOR UPDATE', [id]);
      const requestHash = hash({ actor: fresh.id, id, input }),
        replay = (
          await sql.query(
            'SELECT request_hash,result FROM production_exception_commands WHERE id=$1',
            [input.requestId],
          )
        )[0];
      if (replay) {
        if (replay.request_hash !== requestHash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າຕ່າງກັນ / Request changed', 409);
        return replay.result as IssueCorrectionResult;
      }
      const p = await this.inspect(sql, id);
      if (
        p.view.rowVersion !== input.rowVersion ||
        p.view.sheetRowVersion !== input.sheetRowVersion ||
        p.view.checkToken !== input.checkToken
      )
        throw new AppError(
          'CORRECTION_CHANGED',
          'ຂໍ້ມູນປ່ຽນ ກະລຸນາກວດໃໝ່ / Reload correction details',
          409,
        );
      const rows = correctionRows(input.rows);
      for (const r of input.rows) {
        const line = p.view.lines.find((l) => l.lineIndex === r.lineIndex);
        if (
          !line ||
          r.usableQty + r.scrapQty + r.releaseQty > line.reviewLimit ||
          r.scrapQty + r.releaseQty + line.otherLoss + line.shipped + line.carried > line.allocated
        )
          throw new AppError(
            'CORRECTION_QUANTITY',
            'ຈຳນວນບໍ່ພໍ ຫຼືຜູກກັບວຽກ/ສົ່ງແລ້ວ / Quantities conflict with allocated, shipped or continued work',
            409,
          );
      }
      const changes: Row[] = [];
      for (const edit of input.replacementEdits) {
        const child = p.children.find((c) => c.id === edit.sheetId),
          visible = p.view.replacements.find((c) => c.id === edit.sheetId);
        if (!child || !visible?.editable || Number(child.row_version) !== edit.rowVersion)
          throw new AppError(
            'REPLACEMENT_NOT_EDITABLE',
            'ແກ້ໄດ້ສະເພາະ Draft ທີ່ຍັງບໍ່ເຄີຍອອກໃບ / Only an unissued replacement draft can change',
            409,
          );
        if (edit.allocations.some((a) => !p.view.lines.some((l) => l.lineIndex === a.lineIndex)))
          throw new AppError('INVALID_LINE', 'Replacement line not in source sheet', 400);
        const allocations = [...edit.allocations].sort((a, b) => a.lineIndex - b.lineIndex),
          before = child.allocations as SheetInput['allocations'];
        if (
          JSON.stringify(allocations) ===
          JSON.stringify([...before].sort((a, b) => a.lineIndex - b.lineIndex))
        )
          continue;
        if (
          allocations.length &&
          !validDraftNames(child.print_details as SheetInput['printDetails'], allocations)
        )
          throw new AppError(
            'REPLACEMENT_NAMES',
            'ໃຫ້ Graphic ກວດຊື່/ເບີກ່ອນ / Ask graphic staff to reconcile retained names first',
            409,
          );
        const after = {
          allocations: allocations.length ? allocations : before,
          state: allocations.length ? 'DRAFT' : 'CANCELLED',
        };
        await sql.query(
          'UPDATE production_sheets SET allocations=$2,state=$3,row_version=row_version+1,updated_by=$4,updated_at=now(),request_hash=$5 WHERE id=$1',
          [
            child.id,
            JSON.stringify(after.allocations),
            after.state,
            fresh.id,
            hash({ correction: input.requestId, child: child.id, after }),
          ],
        );
        const change = {
          sheetId: String(child.id),
          before: { allocations: before, state: String(child.state) },
          after,
        };
        changes.push(change);
        await recordAudit(
          sql,
          fresh.id,
          'PRODUCTION_REPLACEMENT_DRAFT_CORRECTED',
          String(child.id),
          input.reason,
          { issueId: id, correctionId: input.requestId, ...change },
        );
      }
      if (
        JSON.stringify(rows) === JSON.stringify(correctionRows(p.view.currentRows)) &&
        !changes.length
      )
        throw new AppError('NO_QUANTITY_CHANGE', 'ຈຳນວນຍັງເທົ່າເດີມ / No quantity changes', 400);
      await validateReplacementAllowance(sql, id, rows);
      const version = Number(p.issue.row_version) + 1,
        projected: IssueResolve['rows'] = rows.map((r) => ({ ...r, replacementQty: 0 }));
      await sql.query(
        "INSERT INTO production_issue_resolutions(issue_id,issue_version,kind,rows,actor_id,actor_name,reason,command_id,replacement_changes) VALUES($1,$2,'CORRECTION',$3,$4,$5,$6,$7,$8)",
        [
          id,
          version,
          JSON.stringify(projected),
          fresh.id,
          fresh.displayName,
          input.reason,
          input.requestId,
          JSON.stringify(changes),
        ],
      );
      const lines = new Set([
        ...p.own.map((l) => Number(l.line_index)),
        ...rows.map((r) => r.lineIndex),
      ]);
      for (const line of lines) {
        const before = p.own.find((l) => Number(l.line_index) === line),
          after = rows.find((r) => r.lineIndex === line),
          scrap = (after?.scrapQty ?? 0) - Number(before?.scrap_qty ?? 0),
          released = (after?.releaseQty ?? 0) - Number(before?.release_qty ?? 0);
        if (scrap || released)
          await sql.query(
            'INSERT INTO production_loss_adjustments(issue_id,issue_version,sheet_id,line_index,scrap_delta,release_delta) VALUES($1,$2,$3,$4,$5,$6)',
            [id, version, p.sheet.id, line, scrap, released],
          );
      }
      await sql.query(
        'UPDATE production_issues SET resolution_rows=$2,row_version=row_version+1 WHERE id=$1',
        [id, JSON.stringify(projected)],
      );
      await sql.query(
        'UPDATE production_sheets SET row_version=row_version+1,updated_by=$2,updated_at=now() WHERE id=$1',
        [p.sheet.id, fresh.id],
      );
      await assertCurrentOrderCapacity(sql, String(p.sheet.order_id));
      await updatePreparation(sql, String(p.sheet.order_id));
      await restoreForActivity(sql, fresh, String(p.sheet.order_id), input.reason);
      await recordAudit(
        sql,
        fresh.id,
        'PRODUCTION_ISSUE_QUANTITIES_CORRECTED',
        String(p.sheet.id),
        input.reason,
        {
          issueId: id,
          correctionId: input.requestId,
          before: p.view.currentRows,
          after: rows,
          issueVersion: version,
          replacementChanges: changes,
        },
      );
      const result: IssueCorrectionResult = { ok: true, issueId: id, issueVersion: version };
      await sql.query(
        'INSERT INTO production_exception_commands(id,actor_id,request_hash,result) VALUES($1,$2,$3,$4)',
        [input.requestId, fresh.id, requestHash, JSON.stringify(result)],
      );
      return result;
    });
  }
}
