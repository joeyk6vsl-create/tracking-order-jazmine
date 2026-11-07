import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import {
  ASSET_KINDS,
  ASSET_LABELS,
  BRAND_ASSET_KINDS,
  type AssetView,
  type UploadAsset,
  type UploadBrandAsset,
} from '../../../../packages/contracts/src/assets';
import type { DraftInput } from '../../../../packages/contracts/src/orders';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { validateAsset } from './file-validation';
import { assertOrderOperational } from '../orders/order-lifecycle-guard';
const projection =
  'id,kind,revision,filename,mime,byte_size AS "byteSize",status,review_reason AS "reviewReason",draft_version AS "draftVersion",scope_key AS "scopeKey"';
function scope(draftId: string, input: DraftInput, kind: string) {
  if (kind === 'MOCKUP') return 'DRAFT:' + draftId;
  if (!input.brandingType)
    throw new AppError('BRAND_REQUIRED', 'เลือกแบรนด์ในร่างก่อนแนบป้ายคอหรือเทปคอ', 400);
  return input.brandingType === 'JAZMINE_STANDARD'
    ? 'CENTRAL:JAZMINE'
    : input.customerId
      ? 'CUSTOMER:' + input.customerId
      : 'DRAFT:' + draftId;
}
function labelSource(input: DraftInput): 'JAZMINE' | 'CUSTOMER' | 'DRAFT' | 'UNSET' {
  if (!input.brandingType) return 'UNSET';
  if (input.brandingType === 'JAZMINE_STANDARD') return 'JAZMINE';
  return input.customerId ? 'CUSTOMER' : 'DRAFT';
}
export class AssetService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private access(sql: Sql, actor: UserView, lock = false) {
    return this.auth.require(
      sql,
      actor,
      actor.role === 'ADMIN_PROMAX' || actor.department === 'GRAPHIC'
        ? 'graphic.approve'
        : 'orders.manage',
      lock,
    );
  }
  async queue(actor: UserView) {
    await this.access(this.db, actor);
    return {
      drafts: await this.db.query(
        `SELECT id,row_version AS "rowVersion",input_json->>'customerName' AS "customerName",input_json->>'brandingType' AS "brandingType" FROM order_drafts WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.draft_id=order_drafts.id AND (o.storage_state='ARCHIVED' OR o.business_state='CANCELLED')) ORDER BY updated_at DESC,id DESC LIMIT 50`,
      ),
    };
  }
  async checklist(actor: UserView, draftId: string, sql: Sql = this.db) {
    await this.access(sql, actor);
    const draft = (
      await sql.query('SELECT input_json,row_version FROM order_drafts WHERE id=$1', [draftId])
    )[0];
    if (!draft) throw new AppError('NOT_FOUND', 'ไม่พบร่าง', 404);
    const input = draft.input_json as DraftInput,
      version = Number(draft.row_version),
      assets: AssetView[] = [],
      missing: string[] = [];
    if (!input.brandingType) missing.push('ยังไม่เลือกแบรนด์');
    for (const kind of ASSET_KINDS) {
      if (kind !== 'MOCKUP' && !input.brandingType) {
        missing.push(ASSET_LABELS[kind] + ' — เลือกแบรนด์ก่อน');
        continue;
      }
      const key = scope(draftId, input, kind);
      const rows = await sql.query(
        `SELECT ${projection} FROM graphic_assets WHERE scope_key=$1 AND kind=$2 ORDER BY revision DESC`,
        [key, kind],
      );
      for (const row of rows) {
        const asset = row as unknown as AssetView;
        asset.stale = key.startsWith('DRAFT:') && asset.draftVersion !== version;
        assets.push(asset);
      }
      const latest = rows[0] as unknown as AssetView | undefined;
      if (!latest) missing.push(ASSET_LABELS[kind] + ' — ยังไม่มีไฟล์');
      else if (latest.stale)
        missing.push(ASSET_LABELS[kind] + ' — ข้อมูลร่างเปลี่ยน ต้องส่งและตรวจฉบับใหม่');
      else if (latest.status !== 'APPROVED')
        missing.push(
          ASSET_LABELS[kind] +
            (latest.status === 'REJECTED' ? ' — ส่งกลับแก้ไข' : ' — รอกราฟิกตรวจ'),
        );
    }
    return {
      assets,
      missing,
      ready: missing.length === 0,
      draftVersion: version,
      labelSource: labelSource(input),
    };
  }
  private async libraryScope(sql: Sql, customerId: string | null) {
    if (!customerId) return 'CENTRAL:JAZMINE';
    const customer = (
      await sql.query('SELECT branding_type FROM customers WHERE id=$1', [customerId])
    )[0];
    if (!customer) throw new AppError('NOT_FOUND', 'ไม่พบลูกค้าประจำ', 404);
    if (customer.branding_type !== 'CUSTOM_AGENT')
      throw new AppError('JAZMINE_BRAND', 'ลูกค้ารายนี้ใช้ป้ายคอและเทปคอของ JAZMINE', 400);
    return 'CUSTOMER:' + customerId;
  }
  async library(actor: UserView, customerId: string | null) {
    await this.auth.require(this.db, actor, 'customers.manage');
    const key = await this.libraryScope(this.db, customerId);
    const assets = (await this.db.query(
      `SELECT ${projection} FROM graphic_assets WHERE scope_key=$1 AND kind=ANY($2::text[]) ORDER BY kind,revision DESC`,
      [key, BRAND_ASSET_KINDS],
    )) as unknown as AssetView[];
    const missing = BRAND_ASSET_KINDS.flatMap((kind) => {
      const latest = assets.find((a) => a.kind === kind);
      return !latest
        ? [ASSET_LABELS[kind] + ' — ยังไม่มีไฟล์']
        : latest.status !== 'APPROVED'
          ? [ASSET_LABELS[kind] + ' — ยังไม่พร้อมใช้']
          : [];
    });
    return { assets, missing, ready: missing.length === 0 };
  }
  async uploadLibrary(
    actor: UserView,
    id: string,
    customerId: string | null,
    data: UploadBrandAsset,
  ) {
    await this.auth.require(this.db, actor, 'customers.manage');
    const { bytes, mime } = validateAsset(data.base64);
    const requestHash = createHash('sha256')
      .update(actor.id + String(customerId) + JSON.stringify(data))
      .digest('hex');
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'customers.manage', true);
      await sql.query('LOCK TABLE graphic_assets IN SHARE ROW EXCLUSIVE MODE');
      const key = await this.libraryScope(sql, customerId);
      const previous = (
        await sql.query(`SELECT ${projection},request_hash FROM graphic_assets WHERE id=$1`, [id])
      )[0];
      if (previous) {
        if (previous.request_hash !== requestHash || previous.scopeKey !== key)
          throw new AppError(
            'REQUEST_CONFLICT',
            'คำขอเดิมมีไฟล์ต่างกัน กรุณาตรวจรายการล่าสุด',
            409,
          );
        return { asset: previous };
      }
      const revision = Number(
        (
          await sql.query(
            'SELECT COALESCE(MAX(revision),0)+1 AS next FROM graphic_assets WHERE scope_key=$1 AND kind=$2',
            [key, data.kind],
          )
        )[0].next,
      );
      await sql.query(
        'INSERT INTO graphic_assets(id,scope_key,kind,revision,filename,mime,file_data,byte_size,sha256,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          id,
          key,
          data.kind,
          revision,
          data.filename,
          mime,
          bytes,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          requestHash,
          actor.id,
        ],
      );
      await sql.query(
        "UPDATE graphic_assets SET status='APPROVED',reviewed_by=$2,review_reason='ตรวจโดยแอดมินขณะอัปโหลด',reviewed_at=now() WHERE id=$1",
        [id, fresh.id],
      );
      await recordAudit(sql, actor.id, 'BRAND_FILE_UPLOADED', id, undefined, {
        scope: key,
        kind: data.kind,
        revision,
        approvedOnUpload: true,
      });
      return {
        asset: (await sql.query(`SELECT ${projection} FROM graphic_assets WHERE id=$1`, [id]))[0],
      };
    });
  }
  async upload(actor: UserView, id: string, data: UploadAsset) {
    await this.access(this.db, actor);
    const { bytes, mime } = validateAsset(data.base64);
    const requestHash = createHash('sha256')
      .update(actor.id + JSON.stringify(data))
      .digest('hex');
    return this.db.transaction(async (sql) => {
      const fresh = await this.access(sql, actor, true);
      await sql.query('LOCK TABLE graphic_assets IN SHARE ROW EXCLUSIVE MODE');
      const previous = (
        await sql.query(`SELECT ${projection},request_hash FROM graphic_assets WHERE id=$1`, [id])
      )[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new AppError(
            'REQUEST_CONFLICT',
            'คำขอเดิมมีไฟล์ต่างกัน กรุณาเปิดข้อมูลล่าสุด',
            409,
          );
        return { asset: previous };
      }
      const draft = (
        await sql.query('SELECT input_json,row_version FROM order_drafts WHERE id=$1 FOR SHARE', [
          data.draftId,
        ])
      )[0];
      if (!draft) throw new AppError('NOT_FOUND', 'ไม่พบร่าง', 404);
      const order = (
        await sql.query('SELECT id FROM orders WHERE draft_id=$1 FOR SHARE', [data.draftId])
      )[0];
      if (order) await assertOrderOperational(sql, String(order.id));
      const key = scope(data.draftId, draft.input_json as DraftInput, data.kind);
      const revision = Number(
        (
          await sql.query(
            'SELECT COALESCE(MAX(revision),0)+1 AS next FROM graphic_assets WHERE scope_key=$1 AND kind=$2',
            [key, data.kind],
          )
        )[0].next,
      );
      await sql.query(
        'INSERT INTO graphic_assets(id,scope_key,kind,revision,origin_draft_id,draft_version,filename,mime,file_data,byte_size,sha256,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          id,
          key,
          data.kind,
          revision,
          data.draftId,
          draft.row_version,
          data.filename,
          mime,
          bytes,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          requestHash,
          actor.id,
        ],
      );
      const approvedOnUpload = fresh.role === 'ADMIN_PROMAX' || fresh.department === 'ADMIN';
      if (approvedOnUpload)
        await sql.query(
          "UPDATE graphic_assets SET status='APPROVED',reviewed_by=$2,review_reason='ตรวจโดยแอดมินขณะอัปโหลด',reviewed_at=now() WHERE id=$1",
          [id, fresh.id],
        );
      await recordAudit(sql, actor.id, 'GRAPHIC_FILE_UPLOADED', id, undefined, {
        scope: key,
        kind: data.kind,
        revision,
        draftId: data.draftId,
        draftVersion: draft.row_version,
        approvedOnUpload,
      });
      return {
        asset: (await sql.query(`SELECT ${projection} FROM graphic_assets WHERE id=$1`, [id]))[0],
      };
    });
  }
  async review(actor: UserView, id: string, decision: 'APPROVED' | 'REJECTED', reason: string) {
    return this.db.transaction(async (sql) => {
      if (actor.role === 'ADMIN_PROMAX' || actor.department === 'ADMIN')
        await this.auth.require(sql, actor, 'orders.manage', true);
      else if (actor.department === 'GRAPHIC')
        await this.auth.require(sql, actor, 'graphic.approve', true);
      else
        throw new AppError('PERMISSION_DENIED', 'เฉพาะเจ้าของ แอดมิน หรือกราฟิกตรวจไฟล์ได้', 403);
      await sql.query('LOCK TABLE graphic_assets IN SHARE ROW EXCLUSIVE MODE');
      const asset = (
        await sql.query('SELECT * FROM graphic_assets WHERE id=$1 FOR UPDATE', [id])
      )[0];
      if (!asset) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์', 404);
      if (asset.status !== 'PENDING') {
        if (
          asset.status === decision &&
          asset.review_reason === reason &&
          asset.reviewed_by === actor.id
        )
          return { ok: true };
        throw new AppError(
          'ALREADY_REVIEWED',
          'ไฟล์ฉบับนี้ตรวจแล้ว ส่งไฟล์ฉบับใหม่เมื่อต้องแก้ไข',
          409,
        );
      }
      const latest = (
        await sql.query(
          'SELECT MAX(revision) AS revision FROM graphic_assets WHERE scope_key=$1 AND kind=$2',
          [asset.scope_key, asset.kind],
        )
      )[0];
      if (Number(latest.revision) !== Number(asset.revision))
        throw new AppError('NEWER_FILE', 'มีไฟล์ฉบับใหม่แล้ว กรุณาตรวจฉบับล่าสุด', 409);
      if (String(asset.scope_key).startsWith('DRAFT:')) {
        const draft = (
          await sql.query('SELECT row_version FROM order_drafts WHERE id=$1 FOR SHARE', [
            asset.origin_draft_id,
          ])
        )[0];
        if (Number(draft.row_version) !== Number(asset.draft_version))
          throw new AppError(
            'STALE_GRAPHIC',
            'ร่างเปลี่ยนแล้ว ต้องส่งไฟล์ฉบับใหม่ก่อนอนุมัติ',
            409,
          );
      }
      await sql.query(
        'UPDATE graphic_assets SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now() WHERE id=$1',
        [id, decision, actor.id, reason],
      );
      await recordAudit(sql, actor.id, 'GRAPHIC_FILE_REVIEWED', id, reason, {
        decision,
        revision: asset.revision,
      });
      return { ok: true };
    });
  }
  async content(actor: UserView, id: string) {
    await this.access(this.db, actor);
    const row = (
      await this.db.query('SELECT filename,mime,file_data FROM graphic_assets WHERE id=$1', [id])
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์', 404);
    return {
      filename: String(row.filename),
      mime: String(row.mime),
      bytes: Buffer.from(row.file_data as Uint8Array),
    };
  }
}
