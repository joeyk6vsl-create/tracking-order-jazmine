import { createHash } from 'node:crypto';

import type { UserView } from '../../../../packages/contracts/src/identity';

import type {
  SheetInput,
  SheetView,
  PartFile,
} from '../../../../packages/contracts/src/production';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { validateAsset } from '../assets/file-validation';

import { OPTIONAL_PARTS } from '../../../../packages/contracts/src/production';
import { checkCapacity, updatePreparation } from './quantities';
import { context, required } from './production-context';
import { issueProductionSheet } from './production-issuance';
import { productionFileContent } from './production-file-content';
import { validateInheritance, inheritStages } from './revision-inheritance';
import { assertOrderOperational, restoreForActivity } from '../orders/order-lifecycle-guard';
const projection =
  'id,order_id AS "orderId",order_revision AS "orderRevision",sheet_number AS "sheetNumber",state,row_version AS "rowVersion",issued_version AS "issuedVersion",allocations,notes,print_details AS "printDetails"';
export class ProductionService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async preparation(sql: Sql, orderId: string) {
    await updatePreparation(sql, orderId);
  }
  private read(sql: Sql, actor: UserView) {
    return this.auth.require(
      sql,
      actor,
      actor.department === 'GRAPHIC' || actor.role === 'ADMIN_PROMAX'
        ? 'graphic.approve'
        : 'orders.manage',
    );
  }
  private async order(sql: Sql, id: string, revision?: number) {
    const row = (
      await sql.query(
        'SELECT o.id,o.order_number,o.latest_revision,r.revision,r.snapshot,r.confirmed_at FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=COALESCE($2::int,o.latest_revision) WHERE o.id=$1',
        [id, revision ?? null],
      )
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ไม่พบออเดอร์ที่ยืนยัน', 404);
    return row;
  }
  private async lock(sql: Sql, actor: UserView, orderId: string, operational = true) {
    await this.auth.require(sql, actor, 'graphic.approve', true);
    await sql.query('SELECT id FROM orders WHERE id=$1 FOR SHARE', [orderId]);
    if (operational) await assertOrderOperational(sql, orderId);
    await sql.query('LOCK TABLE production_sheets IN SHARE ROW EXCLUSIVE MODE');
  }
  async queue(actor: UserView) {
    await this.read(this.db, actor);
    const rows = await this.db.query(
      "SELECT o.id,o.order_number,o.latest_revision,r.revision,r.snapshot,r.confirmed_at FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.business_state='ACTIVE' AND o.storage_state='ACTIVE' ORDER BY o.created_at DESC,o.id DESC LIMIT 50",
    );
    return { orders: rows.map(context) };
  }
  async list(actor: UserView, orderId: string) {
    await this.read(this.db, actor);
    return {
      context: context(await this.order(this.db, orderId)),
      sheets: await this.db.query(
        `SELECT ${projection} FROM production_sheets WHERE order_id=$1 ORDER BY updated_at DESC,id`,
        [orderId],
      ),
    };
  }
  async detail(actor: UserView, id: string) {
    await this.read(this.db, actor);
    const sheet = (
      await this.db.query(`SELECT ${projection} FROM production_sheets WHERE id=$1`, [id])
    )[0] as unknown as SheetView;
    if (!sheet) throw new AppError('NOT_FOUND', 'ไม่พบใบผลิต', 404);
    const row = await this.order(this.db, sheet.orderId, sheet.orderRevision),
      ctx = context(row);
    return {
      sheet,
      pendingInheritance:
        sheet.issuedVersion === 0
          ? ((
              await this.db.query(
                'SELECT c.source_sheet_id AS "sourceSheetId",s.sheet_number AS "sourceNumber",c.source_version AS "sourceVersion" FROM production_revision_carry_records c JOIN production_sheets s ON s.id=c.source_sheet_id WHERE c.target_sheet_id=$1',
                [id],
              )
            )[0] as
              { sourceSheetId: string; sourceNumber: string; sourceVersion: number } | undefined)
          : undefined,
      hasWork:
        (
          await this.db.query(
            "SELECT (EXISTS(SELECT 1 FROM production_stage_events WHERE sheet_id=$1) OR EXISTS(SELECT 1 FROM production_stage_work WHERE sheet_id=$1 AND state<>'NOT_STARTED')) AS found",
            [id],
          )
        )[0].found === true,
      context: ctx,
      stale: Number(row.latest_revision) !== sheet.orderRevision,
      requiredParts: required(ctx, sheet.allocations),
      files: await this.db.query(
        'SELECT id,part,revision,filename,mime FROM production_part_files WHERE sheet_id=$1 ORDER BY part,revision DESC',
        [id],
      ),
      versions: await this.db.query(
        'SELECT version,issued_at AS "issuedAt" FROM production_sheet_versions WHERE sheet_id=$1 ORDER BY version DESC',
        [id],
      ),
    };
  }
  async save(actor: UserView, id: string, data: SheetInput) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql, actor, data.orderId);
      const row = await this.order(sql, data.orderId);
      if (Number(row.revision) !== data.orderRevision)
        throw new AppError('ORDER_CHANGED', 'ออเดอร์มีฉบับใหม่ กรุณาเปิดข้อมูลล่าสุด', 409);
      const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        before = (
          await sql.query('SELECT * FROM production_sheets WHERE id=$1 FOR UPDATE', [id])
        )[0];
      if (before?.request_hash === hash)
        return {
          sheet: (
            await sql.query(`SELECT ${projection} FROM production_sheets WHERE id=$1`, [id])
          )[0],
        };
      if ((before ? Number(before.row_version) : 0) !== data.rowVersion)
        throw new AppError('STALE_STATE', 'ใบผลิตเปลี่ยนแล้ว กรุณาเปิดข้อมูลล่าสุด', 409);
      if (
        before &&
        (before.order_id !== data.orderId ||
          Number(before.order_revision) !== data.orderRevision ||
          before.state === 'CANCELLED')
      )
        throw new AppError('SHEET_CONTEXT', 'เปลี่ยนออเดอร์หรือแก้ใบที่ยกเลิกแล้วไม่ได้', 409);
      const other = await sql.query(
        "SELECT order_revision,allocations FROM production_sheets WHERE order_id=$1 AND id<>$2 AND state<>'CANCELLED'",
        [data.orderId, id],
      );
      if (other.some((s) => Number(s.order_revision) !== data.orderRevision))
        throw new AppError(
          'OLD_SHEETS',
          'มีใบผลิตฉบับออเดอร์เก่า ต้องตรวจและยกเลิกก่อนจัดชุดใหม่',
          409,
        );
      const ctx = context(row);
      const recipes = new Set(
        data.allocations.map((a) => {
          const line = ctx.lines[a.lineIndex];
          return line
            ? JSON.stringify({
                productId: line.productId,
                fabricId: line.fabricId,
                parts: [...line.parts].sort((a, b) => a.componentId.localeCompare(b.componentId)),
              })
            : 'INVALID';
        }),
      );
      if (recipes.size > 1)
        throw new AppError(
          'DIFFERENT_RECIPES',
          'แบบ ผ้า หรือส่วนประกอบต่างกัน ให้แยกใบผลิตคนละชุด',
          400,
        );
      await checkCapacity(
        sql,
        data.orderId,
        data.orderRevision,
        id,
        data.allocations,
        ctx.lines.map((l) => l.quantity),
      );
      for (const entry of data.printDetails.names) {
        const allocation = data.allocations.find((a) => a.lineIndex === entry.lineIndex);
        if (
          !allocation ||
          data.printDetails.names.filter((n) => n.lineIndex === entry.lineIndex).length >
            allocation.quantity
        )
          throw new AppError(
            'NAMES_EXCEED_ALLOCATION',
            'รายชื่อและเบอร์ต้องอยู่ในรายการที่จัดผลิต และไม่เกินจำนวนในใบนี้',
            400,
          );
      }
      if (before)
        await sql.query(
          "UPDATE production_sheets SET allocations=$2,notes=$3,state='DRAFT',row_version=row_version+1,request_hash=$4,updated_by=$5,updated_at=now(),print_details=$6 WHERE id=$1",
          [
            id,
            JSON.stringify(data.allocations),
            data.notes,
            hash,
            actor.id,
            JSON.stringify(data.printDetails),
          ],
        );
      else
        await sql.query(
          'INSERT INTO production_sheets(id,order_id,order_revision,allocations,notes,request_hash,created_by,updated_by,print_details) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)',
          [
            id,
            data.orderId,
            data.orderRevision,
            JSON.stringify(data.allocations),
            data.notes,
            hash,
            actor.id,
            JSON.stringify(data.printDetails),
          ],
        );
      await recordAudit(
        sql,
        actor.id,
        before ? 'PRODUCTION_SHEET_EDITED' : 'PRODUCTION_SHEET_CREATED',
        id,
        data.reason,
        {
          before: before
            ? {
                allocations: before.allocations,
                notes: before.notes,
                state: before.state,
                printDetails: before.print_details,
              }
            : null,
          after: data,
        },
      );
      await this.preparation(sql, data.orderId);
      return {
        sheet: (
          await sql.query(`SELECT ${projection} FROM production_sheets WHERE id=$1`, [id])
        )[0],
      };
    });
  }
  async upload(
    actor: UserView,
    id: string,
    fileId: string,
    data: { part: string; filename: string; base64: string },
  ) {
    await this.auth.require(this.db, actor, 'graphic.approve');
    const { bytes, mime } = validateAsset(data.base64),
      hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const found = (
      await this.db.query('SELECT order_id FROM production_sheets WHERE id=$1', [id])
    )[0];
    if (!found) throw new AppError('NOT_FOUND', 'ไม่พบใบผลิต', 404);
    return this.db.transaction(async (sql) => {
      await this.lock(sql, actor, String(found.order_id));
      const sheet = (
        await sql.query('SELECT * FROM production_sheets WHERE id=$1 FOR UPDATE', [id])
      )[0];
      const replay = (
        await sql.query('SELECT id,sheet_id,request_hash FROM production_part_files WHERE id=$1', [
          fileId,
        ])
      )[0];
      if (replay) {
        if (replay.request_hash !== hash || replay.sheet_id !== id)
          throw new AppError('REQUEST_CONFLICT', 'คำขอเดิมมีไฟล์ต่างกัน', 409);
        return { ok: true };
      }
      if (sheet.state !== 'DRAFT')
        throw new AppError('NOT_DRAFT', 'เปิดแก้ใบผลิตเป็นร่างก่อนเพิ่มไฟล์ฉบับใหม่', 409);
      const row = await this.order(sql, String(sheet.order_id));
      if (Number(row.revision) !== Number(sheet.order_revision))
        throw new AppError('ORDER_CHANGED', 'ออเดอร์มีฉบับใหม่แล้ว', 409);
      const ctx = context(row);
      if (
        ![
          ...required(ctx, sheet.allocations as SheetInput['allocations']),
          ...OPTIONAL_PARTS,
        ].includes(data.part as PartFile['part'])
      )
        throw new AppError('PART_NOT_USED', 'ส่วนนี้ไม่ได้ใช้ในใบผลิต', 400);
      const revision = Number(
        (
          await sql.query(
            'SELECT COALESCE(MAX(revision),0)+1 AS n FROM production_part_files WHERE sheet_id=$1 AND part=$2',
            [id, data.part],
          )
        )[0].n,
      );
      await sql.query(
        'INSERT INTO production_part_files(id,sheet_id,part,revision,filename,mime,file_data,sha256,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          fileId,
          id,
          data.part,
          revision,
          data.filename,
          mime,
          bytes,
          createHash('sha256').update(bytes).digest('hex'),
          hash,
          actor.id,
        ],
      );
      await sql.query(
        'UPDATE production_sheets SET row_version=row_version+1,updated_by=$2 WHERE id=$1',
        [id, actor.id],
      );
      await recordAudit(sql, actor.id, 'PRODUCTION_PART_UPLOADED', fileId, undefined, {
        sheetId: id,
        part: data.part,
        revision,
      });
      return { ok: true };
    });
  }
  async action(
    actor: UserView,
    id: string,
    rowVersion: number,
    reason: string,
    action: 'ready' | 'cancel',
  ) {
    await this.auth.require(this.db, actor, 'graphic.approve');
    const found = (
      await this.db.query('SELECT order_id FROM production_sheets WHERE id=$1', [id])
    )[0];
    if (!found) throw new AppError('NOT_FOUND', 'ไม่พบใบผลิต', 404);
    return this.db.transaction(async (sql) => {
      await this.lock(sql, actor, String(found.order_id), action !== 'cancel');
      const sheet = (
        await sql.query('SELECT * FROM production_sheets WHERE id=$1 FOR UPDATE', [id])
      )[0];
      if (
        action === 'ready' &&
        sheet.state === 'READY' &&
        Number(sheet.ready_input_version) === rowVersion
      )
        return { ok: true };
      if (Number(sheet.row_version) !== rowVersion)
        throw new AppError('STALE_STATE', 'ใบผลิตเปลี่ยนแล้ว เปิดข้อมูลล่าสุดก่อน', 409);
      if (sheet.state === 'CANCELLED') throw new AppError('CANCELLED', 'ใบผลิตนี้ยกเลิกแล้ว', 409);
      if (action === 'cancel') {
        await sql.query(
          "UPDATE production_sheets SET state='CANCELLED',row_version=row_version+1,updated_by=$2 WHERE id=$1",
          [id, actor.id],
        );
        await recordAudit(sql, actor.id, 'PRODUCTION_SHEET_CANCELLED', id, reason);
        await restoreForActivity(sql, actor, String(found.order_id), reason);
        await this.preparation(sql, String(found.order_id));
        return { ok: true };
      }
      if (sheet.state !== 'DRAFT') throw new AppError('NOT_DRAFT', 'ใบผลิตนี้พร้อมแล้ว', 409);
      const row = await this.order(sql, String(sheet.order_id));
      if (Number(row.revision) !== Number(sheet.order_revision))
        throw new AppError('ORDER_CHANGED', 'ออเดอร์เปลี่ยนแล้ว ต้องตรวจใบผลิตฉบับเก่า', 409);
      const ctx = context(row),
        parts = required(ctx, sheet.allocations as SheetInput['allocations']);
      for (const line of ctx.lines.filter((l) =>
        (sheet.allocations as SheetInput['allocations']).some((a) => a.lineIndex === l.lineIndex),
      ))
        for (const part of line.parts) {
          const selected = ctx.selections.find((i) => i.id === part.componentId),
            source = selected?.source_key ?? selected?.name ?? '';
          if (
            !['ແຂນ', 'ປາຍແຂນ', 'ບ່າ'].some(
              (prefix) => source.includes('/' + prefix) || source.startsWith(prefix),
            )
          )
            throw new AppError(
              'UNSUPPORTED_PART',
              'มีส่วนประกอบที่ยังไม่มีช่องไฟล์ชิ้นงานรองรับ จึงยังทำให้พร้อมไม่ได้',
              409,
            );
        }
      const files = await sql.query<PartFile>(
        'SELECT DISTINCT ON(part) id,part,revision,filename,mime FROM production_part_files WHERE sheet_id=$1 ORDER BY part,revision DESC',
        [id],
      );
      if (parts.some((p) => !files.some((f) => f.part === p)))
        throw new AppError(
          'PART_FILES_MISSING',
          'ไฟล์ชิ้นงานยังไม่ครบ ยังทำใบผลิตให้พร้อมไม่ได้',
          409,
        );
      const carry = await validateInheritance(sql, id, Number(sheet.issued_version));
      const source = carry
        ? (
            await sql.query(
              'SELECT id,sheet_number,order_revision FROM production_sheets WHERE id=$1',
              [carry.source_sheet_id],
            )
          )[0]
        : null;
      await issueProductionSheet(
        sql,
        actor,
        sheet,
        ctx,
        files,
        parts,
        rowVersion,
        reason,
        source && carry
          ? {
              sheetId: String(source.id),
              number: String(source.sheet_number),
              version: Number(carry.source_version),
              orderRevision: Number(source.order_revision),
              reviewId: String(carry.review_id),
            }
          : undefined,
      );
      if (carry) await inheritStages(sql, id, carry);
      await this.preparation(sql, String(found.order_id));
      return { ok: true };
    });
  }
  async content(actor: UserView, id: string) {
    await this.read(this.db, actor);
    const file = await productionFileContent(this.db, id);
    if (!file) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์ชิ้นงาน', 404);
    return {
      filename: String(file.filename),
      mime: String(file.mime),
      bytes: Buffer.from(file.file_data as Uint8Array),
    };
  }
  async history(actor: UserView, id: string) {
    await this.read(this.db, actor);
    const detail = await this.detail(actor, id);
    return {
      state: detail.sheet.state,
      currentVersion: detail.sheet.issuedVersion,
      stale: detail.stale,
      versions: await this.db.query(
        'SELECT version,snapshot,issued_at AS "issuedAt" FROM production_sheet_versions WHERE sheet_id=$1 ORDER BY version DESC',
        [id],
      ),
    };
  }
}
