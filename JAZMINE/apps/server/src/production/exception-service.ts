import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { SheetSnapshot, SheetInput } from '../../../../packages/contracts/src/production';
import { WORK_STAGES } from '../../../../packages/contracts/src/production-work';
import type {
  IssueReport,
  IssueResolve,
  ReplacementInput,
  ExceptionDetail,
  IssueView,
} from '../../../../packages/contracts/src/production-exceptions';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { sourceShipped } from '../shared/fulfillment-ledger';
import { assertOrderOperational, restoreForActivity } from '../orders/order-lifecycle-guard';
import { resolutionHistory, replacementUsage } from './issue-resolution-ledger';
import {
  losses,
  checkCapacity,
  checkReplacement,
  readiness,
  updatePreparation,
} from './quantities';
type Row = Record<string, unknown>;
export class ExceptionService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async access(sql: Sql, actor: UserView, resolve = false, lock = false) {
    const fresh = await this.auth.require(
      sql,
      actor,
      resolve || actor.department === 'ADMIN' ? 'production.resolve' : 'production.own',
      lock,
    );
    if (
      fresh.role !== 'ADMIN_PROMAX' &&
      fresh.department !== 'ADMIN' &&
      !WORK_STAGES.includes(fresh.department as (typeof WORK_STAGES)[number])
    )
      throw new AppError('PERMISSION_DENIED', 'ບໍ່ມີສິດໃນວຽກຜະລິດນີ້', 403);
    return fresh;
  }
  private async lock(sql: Sql, id: string) {
    const found = (await sql.query('SELECT order_id FROM production_sheets WHERE id=$1', [id]))[0];
    if (!found) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ PS', 404);
    await sql.query('SELECT id FROM orders WHERE id=$1 FOR SHARE', [found.order_id]);
    await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
    return (
      await sql.query(
        'SELECT s.*,o.latest_revision FROM production_sheets s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s',
        [id],
      )
    )[0];
  }
  private hash(actor: UserView, operation: string, id: string, input: unknown) {
    return createHash('sha256')
      .update(JSON.stringify({ actor: actor.id, operation, id, input }))
      .digest('hex');
  }
  private async replay(sql: Sql, id: string, hash: string) {
    const row = (
      await sql.query('SELECT request_hash,result FROM production_exception_commands WHERE id=$1', [
        id,
      ])
    )[0];
    if (row && row.request_hash !== hash)
      throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເດີມມີຂໍ້ມູນຕ່າງກັນ', 409);
    return row?.result;
  }
  private async receipt(sql: Sql, actor: UserView, id: string, hash: string, result: unknown) {
    await sql.query(
      'INSERT INTO production_exception_commands(id,actor_id,request_hash,result) VALUES($1,$2,$3,$4)',
      [id, actor.id, hash, JSON.stringify(result)],
    );
    return result;
  }
  async detail(actor: UserView, id: string): Promise<ExceptionDetail> {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return this.readDetail(sql, actor, id);
    });
  }
  private async readDetail(sql: Sql, actor: UserView, id: string): Promise<ExceptionDetail> {
    const fresh = await this.access(sql, actor),
      canResolve = fresh.role === 'ADMIN_PROMAX' || fresh.department === 'ADMIN';
    const sheet = (await sql.query('SELECT order_id FROM production_sheets WHERE id=$1', [id]))[0];
    if (!sheet) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ PS', 404);
    const issues = await sql.query(
      `SELECT id,sheet_version AS "sheetVersion",department,category,mode,description,affected,state,row_version AS "rowVersion",reporter_name AS "reporterName",reported_at AS "reportedAt",resolver_name AS "resolverName",resolved_at AS "resolvedAt",resolution_reason AS "resolutionReason",resolution_rows AS "resolutionRows" FROM production_issues WHERE sheet_id=$1 AND ($2::text IS NULL OR department=$2) ORDER BY reported_at DESC,id DESC`,
      [id, canResolve ? null : fresh.department],
    );
    const children = await sql.query(
      'SELECT r.issue_id,s.id,s.sheet_number AS "sheetNumber",s.state,s.allocations FROM production_replacements r JOIN production_sheets s ON s.id=r.sheet_id WHERE r.issue_id IN(SELECT id FROM production_issues WHERE sheet_id=$1)',
      [id],
    );
    return {
      canResolve,
      issues: (await Promise.all(
        issues.map(async (i) => ({
          ...i,
          resolutionHistory: await resolutionHistory(sql, String(i.id)),
          replacementUsage: await replacementUsage(sql, String(i.id)),
          replacements: children
            .filter((c) => c.issue_id === i.id)
            .map(({ id, sheetNumber, state, allocations }) => ({
              id,
              sheetNumber,
              state,
              allocations,
            })),
        })),
      )) as IssueView[],
      readiness: canResolve ? await readiness(sql, String(sheet.order_id)) : null,
      losses: (await losses(sql, [id])).map((l) => ({
        lineIndex: l.line_index,
        scrap: l.scrap,
        released: l.released,
      })),
    };
  }
  async report(actor: UserView, id: string, input: IssueReport) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.access(sql, actor, false, true);
      if (
        fresh.role !== 'ADMIN_PROMAX' &&
        fresh.department !== 'ADMIN' &&
        fresh.department !== input.department
      )
        throw new AppError('PERMISSION_DENIED', 'ລາຍງານໄດ້ສະເພາະພະແນກຕົນເອງ', 403);
      const sheet = await this.lock(sql, id),
        hash = this.hash(fresh, 'report', id, input),
        replay = await this.replay(sql, input.requestId, hash);
      if (replay) return replay;
      if (
        sheet.state !== 'READY' ||
        Number(sheet.issued_version) !== input.version ||
        Number(sheet.row_version) !== input.sheetRowVersion ||
        Number(sheet.order_revision) !== Number(sheet.latest_revision)
      )
        throw new AppError('INSTRUCTIONS_CHANGED', 'PS / Order ປ່ຽນແລ້ວ ກະລຸນາ Reload', 409);
      const snapshot = (
        await sql.query(
          'SELECT snapshot FROM production_sheet_versions WHERE sheet_id=$1 AND version=$2',
          [id, input.version],
        )
      )[0].snapshot as SheetSnapshot;
      const deductions = await losses(sql, [id]);
      const sent = await sourceShipped(sql, id);
      for (const row of input.affected) {
        const allocated =
          snapshot.allocations.find((a) => a.lineIndex === row.lineIndex)?.quantity ?? 0;
        const loss = deductions.find((l) => l.line_index === row.lineIndex);
        if (
          row.quantity >
          allocated -
            (loss?.scrap ?? 0) -
            (loss?.released ?? 0) -
            (sent.find((s) => s.line_index === row.lineIndex)?.quantity ?? 0)
        )
          throw new AppError('AFFECTED_QUANTITY', 'ຈຳນວນທີ່ລາຍງານເກີນຈຳນວນຄົງເຫຼືອໃນ PS', 400);
      }
      await sql.query(
        'INSERT INTO production_issues(id,sheet_id,sheet_version,department,category,mode,description,affected,reported_by,reporter_name,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          input.requestId,
          id,
          input.version,
          input.department,
          input.category,
          input.mode,
          input.description,
          JSON.stringify(input.affected),
          fresh.id,
          fresh.displayName,
          hash,
        ],
      );
      await recordAudit(sql, fresh.id, 'PRODUCTION_ISSUE_REPORTED', id, input.description, {
        issueId: input.requestId,
        version: input.version,
        department: input.department,
        mode: input.mode,
        affected: input.affected,
      });
      await restoreForActivity(sql, fresh, String(sheet.order_id), input.description);
      return this.receipt(sql, fresh, input.requestId, hash, {
        ok: true,
        issueId: input.requestId,
      });
    });
  }
  private async replacement(
    sql: Sql,
    actor: UserView,
    issue: Row,
    sheet: Row,
    allocations: SheetInput['allocations'],
    reason: string,
  ) {
    await assertOrderOperational(sql, String(sheet.order_id));
    if (Number(sheet.order_revision) !== Number(sheet.latest_revision))
      throw new AppError(
        'ORDER_CHANGED',
        'Order ມີສະບັບໃໝ່ ສ້າງງານທົດແທນຈາກຄຳສັ່ງເກົ່າບໍ່ໄດ້',
        409,
      );
    const snapshot = (
        await sql.query(
          'SELECT snapshot FROM production_sheet_versions WHERE sheet_id=$1 AND version=$2',
          [sheet.id, issue.sheet_version],
        )
      )[0].snapshot as SheetSnapshot,
      id = uuidv7();
    await checkReplacement(sql, String(issue.id), id, allocations);
    await checkCapacity(
      sql,
      String(sheet.order_id),
      Number(sheet.order_revision),
      id,
      allocations,
      snapshot.context.lines.map((l) => l.quantity),
    );
    const notes = `Replacement / ຜະລິດທົດແທນ ${sheet.sheet_number} v${issue.sheet_version}\nIssue: ${issue.id}\n${reason}\nກວດແບບ, ຜ້າ, ຊື່/ເບີ ແລະໄຟລ໌ກ່ອນອອກ PS.`;
    await sql.query(
      'INSERT INTO production_sheets(id,order_id,order_revision,allocations,notes,request_hash,created_by,updated_by,print_details) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)',
      [
        id,
        sheet.order_id,
        sheet.order_revision,
        JSON.stringify(allocations),
        notes,
        createHash('sha256').update(id).digest('hex'),
        actor.id,
        JSON.stringify({ priority: snapshot.printDetails?.priority ?? 'UNSPECIFIED', names: [] }),
      ],
    );
    await sql.query(
      'INSERT INTO production_replacements(sheet_id,issue_id,created_by,reason) VALUES($1,$2,$3,$4)',
      [id, issue.id, actor.id, reason],
    );
    await recordAudit(sql, actor.id, 'PRODUCTION_REPLACEMENT_CREATED', id, reason, {
      issueId: issue.id,
      sourceSheetId: sheet.id,
      sourceVersion: issue.sheet_version,
      allocations,
    });
    return id;
  }
  async resolve(actor: UserView, issueId: string, input: IssueResolve) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.access(sql, actor, true, true),
        issue = (await sql.query('SELECT * FROM production_issues WHERE id=$1', [issueId]))[0];
      if (!issue) throw new AppError('NOT_FOUND', 'ບໍ່ພົບປັນຫາ', 404);
      const sheet = await this.lock(sql, String(issue.sheet_id)),
        hash = this.hash(fresh, 'resolve', issueId, input),
        replay = await this.replay(sql, input.requestId, hash);
      if (replay) return replay;
      // อ่านใหม่หลังล็อก PS เพื่อให้การปิดพร้อมกันเห็นผลของคำขอก่อนหน้า
      const current = (
        await sql.query('SELECT * FROM production_issues WHERE id=$1 FOR UPDATE', [issueId])
      )[0];
      if (
        current.state !== 'OPEN' ||
        Number(current.row_version) !== input.rowVersion ||
        Number(sheet.row_version) !== input.sheetRowVersion
      )
        throw new AppError('STALE_STATE', 'ປັນຫາ / PS ປ່ຽນແລ້ວ ກະລຸນາ Reload', 409);
      const affected = current.affected as IssueReport['affected'];
      if (
        input.rows.length !== affected.length ||
        input.rows.some((r) => !affected.some((a) => a.lineIndex === r.lineIndex))
      )
        throw new AppError('RESOLUTION_BALANCE', 'ກະລຸນາແຍກຈຳນວນທຸກລາຍການທີ່ລາຍງານ', 400);
      const deductions = await losses(sql, [String(sheet.id)]),
        allocated = sheet.allocations as SheetInput['allocations'];
      const sent = await sourceShipped(sql, String(sheet.id));
      for (const row of input.rows) {
        const count = affected.find((a) => a.lineIndex === row.lineIndex)!.quantity,
          loss = deductions.find((l) => l.line_index === row.lineIndex),
          remaining =
            (allocated.find((a) => a.lineIndex === row.lineIndex)?.quantity ?? 0) -
            (loss?.scrap ?? 0) -
            (loss?.released ?? 0) -
            (sent.find((s) => s.line_index === row.lineIndex)?.quantity ?? 0);
        if (
          row.usableQty + row.scrapQty + row.releaseQty + row.ignoredQty !== count ||
          row.usableQty + row.scrapQty + row.releaseQty > remaining ||
          row.replacementQty > row.scrapQty + row.releaseQty
        )
          throw new AppError(
            'RESOLUTION_BALANCE',
            'ຈຳນວນຕ້ອງລວມເທົ່າທີ່ລາຍງານ ບໍ່ເກີນ PS ແລະທົດແທນບໍ່ເກີນທີ່ເສຍ/ປ່ອຍຄືນ',
            400,
          );
        await sql.query(
          'INSERT INTO production_losses(issue_id,sheet_id,line_index,scrap_qty,release_qty) VALUES($1,$2,$3,$4,$5)',
          [issueId, sheet.id, row.lineIndex, row.scrapQty, row.releaseQty],
        );
      }
      await sql.query(
        "UPDATE production_issues SET state='RESOLVED',row_version=row_version+1,resolved_by=$2,resolver_name=$3,resolved_at=now(),resolution_reason=$4,resolution_rows=$5 WHERE id=$1",
        [issueId, fresh.id, fresh.displayName, input.reason, JSON.stringify(input.rows)],
      );
      await sql.query(
        "INSERT INTO production_issue_resolutions(issue_id,issue_version,kind,rows,actor_id,actor_name,reason,command_id) VALUES($1,$2,'INITIAL',$3,$4,$5,$6,$7)",
        [
          issueId,
          Number(current.row_version) + 1,
          JSON.stringify(input.rows),
          fresh.id,
          fresh.displayName,
          input.reason,
          input.requestId,
        ],
      );
      const replacements = input.rows
        .filter((r) => r.replacementQty > 0)
        .map((r) => ({ lineIndex: r.lineIndex, quantity: r.replacementQty }));
      const replacementId = replacements.length
        ? await this.replacement(sql, fresh, current, sheet, replacements, input.reason)
        : null;
      await updatePreparation(sql, String(sheet.order_id));
      await restoreForActivity(sql, fresh, String(sheet.order_id), input.reason);
      await recordAudit(
        sql,
        fresh.id,
        'PRODUCTION_ISSUE_RESOLVED',
        String(sheet.id),
        input.reason,
        { issueId, version: current.sheet_version, rows: input.rows, replacementId },
      );
      return this.receipt(sql, fresh, input.requestId, hash, { ok: true, replacementId });
    });
  }
  async createReplacement(actor: UserView, issueId: string, input: ReplacementInput) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.access(sql, actor, true, true),
        issue = (await sql.query('SELECT * FROM production_issues WHERE id=$1', [issueId]))[0];
      if (!issue) throw new AppError('NOT_FOUND', 'ບໍ່ພົບປັນຫາ', 404);
      const sheet = await this.lock(sql, String(issue.sheet_id)),
        hash = this.hash(fresh, 'replace', issueId, input),
        replay = await this.replay(sql, input.requestId, hash);
      if (replay) return replay;
      if (issue.state !== 'RESOLVED')
        throw new AppError('ISSUE_OPEN', 'ຕ້ອງຢືນຢັນຈຳນວນໃນປັນຫາກ່ອນ', 409);
      const replacementId = await this.replacement(
        sql,
        fresh,
        issue,
        sheet,
        input.allocations,
        input.reason,
      );
      await updatePreparation(sql, String(sheet.order_id));
      return this.receipt(sql, fresh, input.requestId, hash, { ok: true, replacementId });
    });
  }
}
