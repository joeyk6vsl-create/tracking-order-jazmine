import type { UserView } from '../../../../packages/contracts/src/identity';
import type { CatalogChoicesInput } from '../../../../packages/contracts/src/catalog-choices';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';

export class CatalogChoicesService {
  private readonly auth = new ActorAuthorization();
  constructor(private readonly db: Database) {}
  async get(actor: UserView, id: string) {
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'customers.manage');
      const item = (
        await sql.query('SELECT kind,row_version FROM catalog_items WHERE id=$1 FOR SHARE', [id])
      )[0];
      if (!item || item.kind === 'FABRIC')
        throw new AppError('INVALID_ITEM', 'เลือกสินค้าหรือส่วนประกอบก่อน', 400);
      const sizes = await sql.query(
        'SELECT name FROM catalog_item_sizes WHERE item_id=$1 ORDER BY position',
        [id],
      );
      const fabrics = await sql.query(
        "SELECT id,name,active FROM catalog_items WHERE kind='FABRIC' ORDER BY display_group,display_order,id",
      );
      const selected = await sql.query(
        'SELECT fabric_id FROM catalog_item_fabrics WHERE item_id=$1 ORDER BY fabric_id',
        [id],
      );
      return {
        rowVersion: item.row_version,
        sizes: sizes.map((s) => s.name),
        fabricIds: selected.map((s) => s.fabric_id),
        fabrics,
      };
    });
  }
  async save(actor: UserView, id: string, data: CatalogChoicesInput) {
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'users.manage', true);
      const item = (
        await sql.query('SELECT kind,row_version FROM catalog_items WHERE id=$1 FOR UPDATE', [id])
      )[0];
      if (!item || item.kind === 'FABRIC')
        throw new AppError('INVALID_ITEM', 'เลือกสินค้าหรือส่วนประกอบก่อน', 400);
      if (item.row_version !== data.rowVersion)
        throw new AppError('STALE_STATE', 'มีผู้แก้รายการแล้ว กรุณาเปิดข้อมูลล่าสุด', 409);
      if (item.kind === 'COMPONENT' && data.sizes.length)
        throw new AppError('INVALID_SIZES', 'กำหนดไซซ์ที่สินค้า ส่วนประกอบเลือกเฉพาะผ้า', 400);
      for (const fabricId of [...data.fabricIds].sort()) {
        const fabric = (
          await sql.query(
            "SELECT id FROM catalog_items WHERE id=$1 AND kind='FABRIC' AND active=true FOR SHARE",
            [fabricId],
          )
        )[0];
        if (!fabric)
          throw new AppError(
            'INVALID_FABRIC',
            'มีผ้าที่ปิดใช้งานหรือไม่ใช่ชนิดผ้า กรุณาเลือกใหม่',
            400,
          );
      }
      const before = {
        sizes: await sql.query(
          'SELECT name FROM catalog_item_sizes WHERE item_id=$1 ORDER BY position',
          [id],
        ),
        fabrics: await sql.query('SELECT fabric_id FROM catalog_item_fabrics WHERE item_id=$1', [
          id,
        ]),
      };
      await sql.query('DELETE FROM catalog_item_sizes WHERE item_id=$1', [id]);
      await sql.query('DELETE FROM catalog_item_fabrics WHERE item_id=$1', [id]);
      for (const [position, name] of data.sizes.entries())
        await sql.query('INSERT INTO catalog_item_sizes(item_id,name,position) VALUES($1,$2,$3)', [
          id,
          name,
          position,
        ]);
      for (const fabricId of data.fabricIds)
        await sql.query('INSERT INTO catalog_item_fabrics(item_id,fabric_id) VALUES($1,$2)', [
          id,
          fabricId,
        ]);
      await sql.query(
        'UPDATE catalog_items SET row_version=row_version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      await recordAudit(sql, actor.id, 'CATALOG_CHOICES_UPDATED', id, undefined, {
        before,
        after: { sizes: data.sizes, fabricIds: data.fabricIds },
      });
      return { ok: true };
    });
  }
}
