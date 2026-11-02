import type { CatalogInput, CatalogItem } from '../../../../packages/contracts/src/catalog';
import type { UserView } from '../../../../packages/contracts/src/identity';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';

const projection =
  'id,kind,name,notes,active,section,availability,source_key AS "sourceKey",display_group AS "displayGroup",display_order AS "displayOrder",row_version AS "rowVersion",(image_data IS NOT NULL) AS "hasImage"';
export class CatalogService {
  private readonly auth = new ActorAuthorization();
  constructor(private readonly db: Database) {}
  async availability(
    actor: UserView,
    id: string,
    rowVersion: number,
    status: string,
    reason: string,
  ) {
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'users.manage', true);
      const result = await sql.query(
        "UPDATE catalog_items SET availability=$3,row_version=row_version+1,updated_at=now() WHERE id=$1 AND row_version=$2 AND kind='FABRIC' RETURNING id",
        [id, rowVersion, status],
      );
      if (!result.length)
        throw new AppError(
          'STALE_STATE',
          'ผ้าเปลี่ยนแล้วหรือไม่ใช่รายการผ้า กรุณาเปิดข้อมูลล่าสุด',
          409,
        );
      await recordAudit(sql, actor.id, 'FABRIC_AVAILABILITY_CHANGED', id, reason, { status });
      return { ok: true };
    });
  }
  async list(actor: UserView, after?: string) {
    await this.auth.require(this.db, actor, 'customers.manage');
    const rows = await this.db.query(
      `SELECT ${projection} FROM catalog_items WHERE ($1::uuid IS NULL OR (display_group,display_order,id)>(SELECT display_group,display_order,id FROM catalog_items WHERE id=$1)) ORDER BY display_group,display_order,id LIMIT 25`,
      [after ?? null],
    );
    return { items: rows, next: rows.length === 25 ? rows.at(-1)!.id : null };
  }
  async options(actor: UserView) {
    await this.auth.require(this.db, actor, 'customers.manage');
    return {
      items: await this.db.query(
        `SELECT ${projection} FROM catalog_items WHERE source_key IS NOT NULL ORDER BY display_group,display_order,id`,
      ),
    };
  }
  async save(actor: UserView, id: string, data: CatalogInput, version?: number) {
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'users.manage', true);
      const before = (
        await sql.query('SELECT * FROM catalog_items WHERE id=$1 FOR UPDATE', [id])
      )[0];
      if (version !== undefined && (!before || before.row_version !== version))
        throw new AppError('STALE_STATE', 'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดรายการใหม่', 409);
      if (version === undefined && before) {
        if (
          before.kind !== data.kind ||
          before.name !== data.name ||
          before.notes !== data.notes ||
          before.active !== data.active
        )
          throw new AppError('CONFLICT', 'รายการนี้ถูกบันทึกแล้ว กรุณาเปิดข้อมูลล่าสุด', 409);
        return {
          item: (await sql.query(`SELECT ${projection} FROM catalog_items WHERE id=$1`, [id]))[0],
        };
      }
      if (before && before.kind !== data.kind)
        throw new AppError('INVALID_KIND', 'เปลี่ยนประเภทของรายการเดิมไม่ได้', 400);
      if (before)
        await sql.query(
          'UPDATE catalog_items SET name=$2,notes=$3,active=$4,row_version=row_version+1,updated_at=now() WHERE id=$1',
          [id, data.name, data.notes, data.active],
        );
      else
        await sql.query(
          'INSERT INTO catalog_items(id,kind,name,notes,active,created_by) VALUES($1,$2,$3,$4,$5,$6)',
          [id, data.kind, data.name, data.notes, data.active, actor.id],
        );
      await recordAudit(
        sql,
        actor.id,
        before ? 'CATALOG_UPDATED' : 'CATALOG_CREATED',
        id,
        undefined,
        { name: data.name, kind: data.kind, active: data.active },
      );
      return {
        item: (
          await sql.query(`SELECT ${projection} FROM catalog_items WHERE id=$1`, [id])
        )[0] as unknown as CatalogItem,
      };
    });
  }
  async image(actor: UserView, id: string) {
    await this.auth.require(this.db, actor, 'customers.manage');
    const row = (await this.db.query('SELECT image_data FROM catalog_items WHERE id=$1', [id]))[0];
    if (!row) throw new AppError('NOT_FOUND', 'ไม่พบรายการ', 404);
    return { image: row.image_data };
  }
  async setImage(actor: UserView, id: string, image: string | null, version: number) {
    if (image !== null) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
      const bytes = match ? Buffer.from(match[2], 'base64') : Buffer.alloc(0);
      const valid =
        match &&
        ((match[1] === 'png' &&
          bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
          (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
          (match[1] === 'webp' &&
            bytes.toString('ascii', 0, 4) === 'RIFF' &&
            bytes.toString('ascii', 8, 12) === 'WEBP'));
      if (!valid || bytes.length > 128 * 1024)
        throw new AppError('INVALID_IMAGE', 'ใช้ภาพ PNG, JPEG หรือ WebP ขนาดไม่เกิน 128 KB', 400);
    }
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'users.manage', true);
      const row = (
        await sql.query(
          'UPDATE catalog_items SET image_data=$2,row_version=row_version+1,updated_at=now() WHERE id=$1 AND row_version=$3 RETURNING id',
          [id, image, version],
        )
      )[0];
      if (!row) throw new AppError('STALE_STATE', 'กรุณาเปิดข้อมูลล่าสุดก่อนเปลี่ยนภาพ', 409);
      await recordAudit(sql, actor.id, 'CATALOG_IMAGE_CHANGED', id);
      return { ok: true };
    });
  }
}
