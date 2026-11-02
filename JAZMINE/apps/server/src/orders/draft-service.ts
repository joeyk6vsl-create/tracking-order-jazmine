import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { DraftInput, DraftView } from '../../../../packages/contracts/src/orders';
import { Database } from '../database';
import { PricingService } from '../pricing/pricing-service';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { AppError } from '../errors';
import { priceDraft } from './price-draft';
import { assertOrderOperational } from './order-lifecycle-guard';
const projection =
  'id,row_version AS "rowVersion",input_json AS input,quote_json AS pricing,selection_json AS selections';
export class DraftService {
  private auth = new ActorAuthorization();
  constructor(
    private db: Database,
    private pricing: PricingService,
  ) {}
  async list(actor: UserView) {
    await this.auth.require(this.db, actor, 'orders.manage');
    return {
      drafts: await this.db.query(
        `SELECT ${projection} FROM order_drafts WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.draft_id=order_drafts.id AND (o.business_state='CANCELLED' OR o.storage_state='ARCHIVED')) ORDER BY updated_at DESC,id DESC LIMIT 50`,
      ),
    };
  }
  async preview(actor: UserView, data: DraftInput) {
    await this.auth.require(this.db, actor, 'orders.manage');
    return priceDraft(this.pricing, actor, data);
  }
  async save(actor: UserView, id: string, data: DraftInput) {
    await this.auth.require(this.db, actor, 'orders.manage');
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const replay = (
      await this.db.query(`SELECT ${projection},request_hash FROM order_drafts WHERE id=$1`, [id])
    )[0];
    if (replay?.request_hash === hash)
      return {
        draft: {
          id: replay.id,
          rowVersion: replay.rowVersion,
          input: replay.input,
          pricing: replay.pricing,
          selections: replay.selections,
        } as DraftView,
      };
    // Draft prices are previews. Every save recalculates; confirmation will require its own full validation.
    const quote = await priceDraft(this.pricing, actor, data);
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'orders.manage', true);
      await sql.query('LOCK TABLE order_drafts IN SHARE ROW EXCLUSIVE MODE');
      const order = (await sql.query('SELECT id FROM orders WHERE draft_id=$1 FOR SHARE', [id]))[0];
      if (order) await assertOrderOperational(sql, String(order.id));
      const previous = (
        await sql.query(
          'SELECT request_hash,row_version,input_json,quote_json,selection_json FROM order_drafts WHERE id=$1 FOR UPDATE',
          [id],
        )
      )[0];
      if (previous?.request_hash === hash)
        return {
          draft: (
            await sql.query(`SELECT ${projection} FROM order_drafts WHERE id=$1`, [id])
          )[0] as unknown as DraftView,
        };
      if ((previous ? Number(previous.row_version) : 0) !== data.rowVersion)
        throw new AppError('STALE_STATE', 'ร่างเปลี่ยนแล้ว กรุณาเปิดฉบับล่าสุด', 409);
      await sql.query('LOCK TABLE pricing_versions IN SHARE MODE');
      const version = (
        await sql.query('SELECT revision FROM pricing_versions ORDER BY revision DESC LIMIT 1')
      )[0];
      if (Number(version.revision) !== quote.revision)
        throw new AppError('PRICE_CHANGED', 'ราคามีฉบับใหม่ กรุณาลองบันทึกอีกครั้ง', 409);
      if (data.customerId) {
        const customer = (
          await sql.query(
            "SELECT name,phone FROM customers WHERE id=$1 AND status='ACTIVE' FOR SHARE",
            [data.customerId],
          )
        )[0];
        if (!customer)
          throw new AppError('CUSTOMER_UNAVAILABLE', 'ลูกค้าประจำนี้ไม่พร้อมใช้งาน', 400);
        if (customer.name !== data.customerName || customer.phone !== data.phone)
          throw new AppError('CUSTOMER_CHANGED', 'ข้อมูลลูกค้าเปลี่ยนแล้ว กรุณาเลือกใหม่', 409);
      }
      const ids = (data.lines.length ? data.lines : [data.quote]).flatMap((line) => [
        line.productId,
        line.fabricId,
        ...line.parts.flatMap((p) => [p.componentId, ...(p.fabricId ? [p.fabricId] : [])]),
      ]);
      const selected = await sql.query(
        'SELECT id,name,kind,row_version FROM catalog_items WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',
        [ids],
      );
      if (previous)
        await sql.query(
          'UPDATE order_drafts SET input_json=$2,quote_json=$3,selection_json=$4,request_hash=$5,row_version=row_version+1,updated_by=$6,updated_at=now() WHERE id=$1',
          [
            id,
            JSON.stringify(data),
            JSON.stringify(quote),
            JSON.stringify(selected),
            hash,
            actor.id,
          ],
        );
      else
        await sql.query(
          'INSERT INTO order_drafts(id,input_json,quote_json,selection_json,request_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)',
          [
            id,
            JSON.stringify(data),
            JSON.stringify(quote),
            JSON.stringify(selected),
            hash,
            actor.id,
          ],
        );
      await recordAudit(
        sql,
        actor.id,
        previous ? 'ORDER_DRAFT_UPDATED' : 'ORDER_DRAFT_CREATED',
        id,
        data.reason,
        {
          pricingRevision: quote.revision,
          ready: quote.ready,
          before: previous
            ? {
                input: previous.input_json,
                pricing: previous.quote_json,
                selections: previous.selection_json,
              }
            : null,
          after: { input: data, pricing: quote, selections: selected },
        },
      );
      return {
        draft: (
          await sql.query(`SELECT ${projection} FROM order_drafts WHERE id=$1`, [id])
        )[0] as unknown as DraftView,
      };
    });
  }
}
