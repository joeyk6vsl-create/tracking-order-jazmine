import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { SheetSnapshot } from '../../../../packages/contracts/src/production';
import {
  WORK_STAGES,
  type WorkStage,
  type WorkStageView,
  type WorkJob,
  type WorkAction,
  type WorkDetail,
  type WorkQueue,
  type workQuerySchema,
} from '../../../../packages/contracts/src/production-work';
import type { z } from 'zod';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { canWorkDepartment } from '../identity/domain/permissions';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { productionFileContent } from './production-file-content';
import { assertOrderOperational } from '../orders/order-lifecycle-guard';

type Row = Record<string, unknown>;
const jobProjection =
  "s.id,s.sheet_number,s.issued_version,s.row_version,s.state,s.order_revision,o.latest_revision,o.business_state,o.storage_state,v.version,v.snapshot,(EXISTS(SELECT 1 FROM production_stage_events e WHERE e.sheet_id=s.id AND e.sheet_version<>v.version) OR EXISTS(SELECT 1 FROM production_stage_work old WHERE old.sheet_id=s.id AND old.sheet_version<>v.version AND old.state<>'NOT_STARTED')) AS previous_work,(SELECT count(*)::int FROM production_issues i WHERE i.sheet_id=s.id AND i.state='OPEN') AS open_issues,(SELECT jsonb_build_object('sheetId',c.source_sheet_id,'number',src.sheet_number,'version',c.source_version,'orderRevision',src.order_revision) FROM production_revision_carry_records c JOIN production_sheets src ON src.id=c.source_sheet_id WHERE c.target_sheet_id=s.id AND v.version=1) AS carried_from";
function states(rows: Row[], department?: WorkStage, stops: Row[] = []): WorkStageView[] {
  const all = WORK_STAGES.map((stage) => {
    const row = rows.find((r) => r.department === stage);
    return {
      department: stage,
      state: (row?.state ?? 'NOT_STARTED') as WorkStageView['state'],
      rowVersion: Number(row?.row_version ?? 0),
      blocked: stops.some(
        (i) => WORK_STAGES.indexOf(i.department as WorkStage) <= WORK_STAGES.indexOf(stage),
      )
        ? 'STOP · ມີປັນຫາລໍຖ້າ Admin ແກ້ໄຂ'
        : undefined,
      startedAt: row?.started_at ? new Date(row.started_at as string).toISOString() : null,
      completedAt: row?.completed_at ? new Date(row.completed_at as string).toISOString() : null,
    };
  });
  return all
    .map((stage, i) => ({
      ...stage,
      previous: i ? { department: all[i - 1].department, state: all[i - 1].state } : null,
    }))
    .filter((s) => !department || s.department === department);
}
function job(row: Row, stageRows: Row[], department?: WorkStage, stops: Row[] = []): WorkJob {
  const snap = row.snapshot as SheetSnapshot;
  return {
    carriedFrom: row.carried_from as WorkJob['carriedFrom'],
    id: String(row.id),
    sheetNumber: String(row.sheet_number),
    version: Number(row.version),
    sheetRowVersion: Number(row.row_version),
    orderNumber: snap.context.orderNumber,
    customerName: snap.context.customerName,
    dueDate: snap.context.dueDate,
    priority: snap.printDetails?.priority ?? 'UNSPECIFIED',
    quantity: snap.allocations.reduce((n, a) => n + a.quantity, 0),
    blocked:
      row.business_state === 'CANCELLED'
        ? 'ອໍເດີຍົກເລີກແລ້ວ / Order cancelled'
        : row.storage_state === 'ARCHIVED'
          ? 'ເກັບໃນ Archive / Archived; history only'
          : row.state === 'CANCELLED'
            ? 'ຍົກເລີກ PS ແລ້ວ / Cancelled'
            : row.state !== 'READY'
              ? 'ກຳລັງແກ້ໄຂ PS / Instructions being revised'
              : Number(row.order_revision) !== Number(row.latest_revision)
                ? 'Order ມີສະບັບໃໝ່ ກະລຸນາຕິດຕໍ່ Admin'
                : Number(row.version) !== Number(row.issued_version)
                  ? 'ສະບັບເກົ່າ / History only'
                  : null,
    previousWork: row.previous_work === true,
    openIssues: Number(row.open_issues),
    stages: states(stageRows, department, stops),
  };
}
export class WorkService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async access(sql: Sql, actor: UserView, lock = false) {
    const fresh = await this.auth.require(
      sql,
      actor,
      actor.department === 'ADMIN'
        ? 'production.resolve'
        : actor.department === 'GRAPHIC'
          ? 'graphic.approve'
          : 'production.own',
      lock,
    );
    return {
      actor: fresh,
      overview: fresh.role === 'ADMIN_PROMAX' || fresh.department === 'ADMIN',
    };
  }
  private department(access: Awaited<ReturnType<WorkService['access']>>, requested?: WorkStage) {
    if (access.overview) return requested;
    if (
      !WORK_STAGES.includes(access.actor.department as WorkStage) ||
      (requested && requested !== access.actor.department)
    )
      throw new AppError('PERMISSION_DENIED', 'ບັນຊີນີ້ເບິ່ງໄດ້ສະເພາະວຽກຂອງພະແນກຕົນເອງ', 403);
    return access.actor.department as WorkStage;
  }
  async queue(actor: UserView, query: z.infer<typeof workQuerySchema>): Promise<WorkQueue> {
    const access = await this.access(this.db, actor),
      department = this.department(access, query.department);
    // กรองสถานะก่อน LIMIT เพื่อไม่ให้คิวงานเสร็จบังงานที่ยังค้าง
    const rows = await this.db.query(
      `SELECT ${jobProjection} FROM production_sheets s JOIN orders o ON o.id=s.order_id JOIN production_sheet_versions v ON v.sheet_id=s.id AND v.version=s.issued_version
      WHERE o.storage_state='ACTIVE' AND (o.business_state='ACTIVE' OR EXISTS(SELECT 1 FROM production_issues oi WHERE oi.sheet_id=s.id AND oi.state='OPEN')) AND (s.state<>'CANCELLED' OR EXISTS(SELECT 1 FROM production_issues i WHERE i.sheet_id=s.id AND i.state='OPEN' AND ($3::text IS NULL OR i.department=$3))) AND ($1='' OR strpos(lower(s.sheet_number||' '||o.order_number||' '||(v.snapshot->'context'->>'customerName')),lower($1))>0)
      AND ($2='ALL' OR ($2='COMPLETED') = ((CASE WHEN $3::text IS NULL THEN (SELECT count(*)=6 FROM production_stage_work w WHERE w.sheet_id=s.id AND w.sheet_version=v.version AND w.state='COMPLETED') ELSE EXISTS(SELECT 1 FROM production_stage_work w WHERE w.sheet_id=s.id AND w.sheet_version=v.version AND w.department=$3 AND w.state='COMPLETED') END) AND NOT EXISTS(SELECT 1 FROM production_issues i WHERE i.sheet_id=s.id AND i.state='OPEN' AND ($3::text IS NULL OR i.department=$3))))
      ORDER BY CASE WHEN v.snapshot->'printDetails'->>'priority'='URGENT' THEN 0 ELSE 1 END,v.snapshot->'context'->>'dueDate',v.issued_at,s.id LIMIT 51`,
      [query.search, query.state, department ?? null],
    );
    const visible = rows.slice(0, 50);
    const work = visible.length
      ? await this.db.query('SELECT * FROM production_stage_work WHERE sheet_id=ANY($1::uuid[])', [
          visible.map((r) => r.id),
        ])
      : [];
    const stops = visible.length
      ? await this.db.query(
          "SELECT sheet_id,department FROM production_issues WHERE sheet_id=ANY($1::uuid[]) AND state='OPEN' AND mode='STOP'",
          [visible.map((r) => r.id)],
        )
      : [];
    return {
      overview: access.overview,
      pendingReviews: (await this.db.query(
        "SELECT src.sheet_number AS \"sourceNumber\",target.id AS \"targetSheetId\" FROM production_revision_carries c JOIN production_sheets src ON src.id=c.source_sheet_id JOIN production_sheets target ON target.id=c.target_sheet_id JOIN orders o ON o.id=target.order_id JOIN production_revision_reviews r ON r.id=c.review_id WHERE c.active AND target.state='DRAFT' AND target.issued_version=0 AND target.order_revision=o.latest_revision AND o.business_state='ACTIVE' AND o.storage_state='ACTIVE' ORDER BY r.created_at DESC,target.id LIMIT 50",
      )) as { sourceNumber: string; targetSheetId: string }[],
      department: department ?? null,
      hasMore: rows.length > 50,
      jobs: visible.map((r) =>
        job(
          r,
          work.filter((w) => w.sheet_id === r.id && Number(w.sheet_version) === Number(r.version)),
          department,
          stops.filter((i) => i.sheet_id === r.id),
        ),
      ),
    };
  }
  async detail(actor: UserView, id: string, version?: number): Promise<WorkDetail> {
    const access = await this.access(this.db, actor),
      department = this.department(access);
    const row = (
      await this.db.query(
        `SELECT ${jobProjection} FROM production_sheets s JOIN orders o ON o.id=s.order_id JOIN production_sheet_versions v ON v.sheet_id=s.id AND v.version=COALESCE($2::int,s.issued_version) WHERE s.id=$1`,
        [id, version ?? null],
      )
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ PS ທີ່ອອກແລ້ວ', 404);
    const work = await this.db.query(
      'SELECT * FROM production_stage_work WHERE sheet_id=$1 AND sheet_version=$2',
      [id, row.version],
    );
    const stops = await this.db.query(
      "SELECT department FROM production_issues WHERE sheet_id=$1 AND state='OPEN' AND mode='STOP'",
      [id],
    );
    return {
      job: job(row, work, department, stops),
      snapshot: row.snapshot as SheetSnapshot,
      versions: (
        await this.db.query(
          'SELECT version FROM production_sheet_versions WHERE sheet_id=$1 ORDER BY version DESC',
          [id],
        )
      ).map((r) => Number(r.version)),
      events: (await this.db.query(
        'SELECT id,department,from_state AS "fromState",to_state AS "toState",reason,actor_name AS "actorName",at FROM production_stage_events WHERE sheet_id=$1 AND sheet_version=$2 AND ($3::text IS NULL OR department=$3) ORDER BY at,id',
        [id, row.version, department ?? null],
      )) as WorkDetail['events'],
    };
  }
  async action(actor: UserView, id: string, department: WorkStage, input: WorkAction) {
    return this.db.transaction(async (sql) => {
      const access = await this.access(sql, actor, true);
      if (!canWorkDepartment(access.actor, department))
        throw new AppError('PERMISSION_DENIED', 'ບໍ່ມີສິດ Start / Complete ໃຫ້ພະແນກອື່ນ', 403);
      const order = (
        await sql.query('SELECT order_id FROM production_sheets WHERE id=$1', [id])
      )[0];
      if (!order) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ PS', 404);
      // ลำดับล็อกตรงกับยืนยันออเดอร์และแก้ PS: ออเดอร์ก่อน ใบผลิตทีหลัง
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR SHARE', [order.order_id]);
      await assertOrderOperational(sql, String(order.order_id));
      const sheet = (
        await sql.query(
          'SELECT s.*,o.latest_revision FROM production_sheets s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s',
          [id],
        )
      )[0];
      const hash = createHash('sha256')
        .update(JSON.stringify({ actor: access.actor.id, id, department, input }))
        .digest('hex');
      const replay = (
        await sql.query('SELECT request_hash,result FROM production_stage_events WHERE id=$1', [
          input.requestId,
        ])
      )[0];
      if (replay) {
        if (replay.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າມີຂໍ້ມູນຕ່າງກັນ', 409);
        return replay.result;
      }
      if (
        sheet.state !== 'READY' ||
        Number(sheet.issued_version) !== input.version ||
        Number(sheet.row_version) !== input.sheetRowVersion ||
        Number(sheet.order_revision) !== Number(sheet.latest_revision)
      )
        throw new AppError(
          'INSTRUCTIONS_CHANGED',
          'PS ຫຼື Order ປ່ຽນແລ້ວ ກະລຸນາເປີດຂໍ້ມູນລ່າສຸດ',
          409,
        );
      for (const stage of WORK_STAGES)
        await sql.query(
          'INSERT INTO production_stage_work(sheet_id,sheet_version,department) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, input.version, stage],
        );
      const rows = await sql.query(
        'SELECT * FROM production_stage_work WHERE sheet_id=$1 AND sheet_version=$2',
        [id, input.version],
      );
      const stage = states(rows).find((s) => s.department === department)!;
      const stops = await sql.query(
        "SELECT department FROM production_issues WHERE sheet_id=$1 AND state='OPEN' AND mode='STOP'",
        [id],
      );
      if (
        stops.some(
          (i) => WORK_STAGES.indexOf(i.department as WorkStage) <= WORK_STAGES.indexOf(department),
        )
      )
        throw new AppError('PRODUCTION_STOPPED', 'ວຽກສ່ວນນີ້ STOP ໃຫ້ Admin ແກ້ປັນຫາກ່ອນ', 409);
      if (stage.rowVersion !== input.stageRowVersion)
        throw new AppError('STALE_STATE', 'ສະຖານະວຽກປ່ຽນແລ້ວ ກະລຸນາ Reload', 409);
      if (
        input.action === 'start' &&
        (stage.state !== 'NOT_STARTED' || stage.previous?.state === 'NOT_STARTED')
      )
        throw new AppError(
          'HANDOFF_NOT_READY',
          'ພະແນກກ່ອນໜ້າຕ້ອງ Start ກ່ອນ ແລະວຽກນີ້ຍັງບໍ່ເຄີຍ Start',
          409,
        );
      if (
        input.action === 'complete' &&
        (stage.state !== 'IN_PROGRESS' || (stage.previous && stage.previous.state !== 'COMPLETED'))
      )
        throw new AppError(
          'HANDOFF_NOT_COMPLETE',
          'ວຽກຕ້ອງ In progress ແລະພະແນກກ່ອນໜ້າຕ້ອງ Complete ກ່ອນ',
          409,
        );
      const state = input.action === 'start' ? 'IN_PROGRESS' : 'COMPLETED';
      const updated = (
        await sql.query(
          `UPDATE production_stage_work SET state=$4,row_version=row_version+1,${input.action === 'start' ? 'started_at=now(),started_by=$5' : 'completed_at=now(),completed_by=$5'} WHERE sheet_id=$1 AND sheet_version=$2 AND department=$3 RETURNING row_version`,
          [id, input.version, department, state, access.actor.id],
        )
      )[0];
      const result = {
        ok: true,
        version: input.version,
        department,
        state,
        rowVersion: Number(updated.row_version),
      };
      await sql.query(
        'INSERT INTO production_stage_events(id,sheet_id,sheet_version,department,from_state,to_state,actor_id,actor_name,reason,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          input.requestId,
          id,
          input.version,
          department,
          stage.state,
          state,
          access.actor.id,
          access.actor.displayName,
          input.reason,
          hash,
          JSON.stringify(result),
        ],
      );
      await recordAudit(
        sql,
        access.actor.id,
        input.action === 'start' ? 'PRODUCTION_STAGE_STARTED' : 'PRODUCTION_STAGE_COMPLETED',
        id,
        input.reason,
        {
          sheetVersion: input.version,
          department,
          from: stage.state,
          to: state,
          requestId: input.requestId,
        },
      );
      return result;
    });
  }
  async content(
    actor: UserView,
    id: string,
    version: number,
    fileId: string,
    kind: 'part' | 'asset',
  ) {
    const access = await this.access(this.db, actor);
    this.department(access);
    const saved = (
      await this.db.query(
        'SELECT snapshot FROM production_sheet_versions WHERE sheet_id=$1 AND version=$2',
        [id, version],
      )
    )[0];
    const snapshot = saved?.snapshot as SheetSnapshot | undefined;
    if (
      !snapshot ||
      !(kind === 'part' ? snapshot.files : snapshot.context.assets).some((f) => f.id === fileId)
    )
      throw new AppError('NOT_FOUND', 'ໄຟລ໌ນີ້ບໍ່ຢູ່ໃນ PS ສະບັບນີ້', 404);
    const row =
      kind === 'part'
        ? await productionFileContent(this.db, fileId)
        : (
            await this.db.query('SELECT filename,mime,file_data FROM graphic_assets WHERE id=$1', [
              fileId,
            ])
          )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບໄຟລ໌', 404);
    return {
      filename: String(row.filename),
      mime: String(row.mime),
      bytes: Buffer.from(row.file_data as Uint8Array),
    };
  }
}
