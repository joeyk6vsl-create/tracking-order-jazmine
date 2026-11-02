import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import { businessDate } from '../../../../packages/contracts/src/customers';
import { nextDocumentNumber } from '../shared/document-number';
import { queueDocument } from '../documents/queue-document';
import { draftSchema } from '../../../../packages/contracts/src/orders';
import type {
  ConfirmedOrder,
  OrderReadiness,
  OrderSnapshot,
  ReadinessInput,
} from '../../../../packages/contracts/src/confirmation';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { PricingService } from '../pricing/pricing-service';
import { AssetService } from '../assets/asset-service';
import { priceDraft } from './price-draft';
import { AppError } from '../errors';
import { recordAudit, recordEvent } from '../shared/audit';
import { assertOrderOperational } from './order-lifecycle-guard';
const projection =
  'o.id,o.business_state AS "businessState",o.storage_state AS "storageState",o.order_number AS "orderNumber",o.invoice_number AS "invoiceNumber",r.revision,r.draft_version AS "draftVersion",r.confirmed_at AS "confirmedAt",r.snapshot';
export class ConfirmationService {
  private auth = new ActorAuthorization();
  private pricing: PricingService;
  private assets: AssetService;
  constructor(private db: Database) {
    this.pricing = new PricingService(db);
    this.assets = new AssetService(db);
  }
  private async lock(sql: Sql, actor: UserView) {
    await this.auth.require(sql, actor, 'orders.manage', true);
    // Same lock order as file upload/review and draft saving. Writes cannot change the checked state mid-confirm.
    await sql.query('LOCK TABLE graphic_assets IN SHARE MODE');
    await sql.query('LOCK TABLE order_drafts IN SHARE ROW EXCLUSIVE MODE');
    await sql.query(
      'LOCK TABLE pricing_versions,catalog_items,catalog_item_sizes,catalog_item_fabrics,customers IN SHARE MODE',
    );
  }
  private async inspect(sql: Sql, actor: UserView, input: ReadinessInput): Promise<OrderReadiness> {
    const existing = (
      await sql.query('SELECT id FROM orders WHERE draft_id=$1 FOR SHARE', [input.draftId])
    )[0];
    if (existing) await assertOrderOperational(sql, String(existing.id));
    const draft = (
      await sql.query('SELECT input_json,quote_json,row_version FROM order_drafts WHERE id=$1', [
        input.draftId,
      ])
    )[0];
    if (!draft) throw new AppError('NOT_FOUND', 'ไม่พบร่าง', 404);
    if (Number(draft.row_version) !== input.rowVersion)
      throw new AppError('STALE_STATE', 'ร่างเปลี่ยนแล้ว กรุณาเปิดฉบับล่าสุด', 409);
    const data = draftSchema.parse(draft.input_json),
      missing: string[] = [],
      warnings: string[] = [];
    if (!data.brandingType) missing.push('ยังไม่เลือกแบรนด์');
    if (data.customerId) {
      const customer = (
        await sql.query('SELECT name,phone,status FROM customers WHERE id=$1', [data.customerId])
      )[0];
      if (
        !customer ||
        customer.status !== 'ACTIVE' ||
        customer.name !== data.customerName ||
        customer.phone !== data.phone
      )
        missing.push('ข้อมูลลูกค้าประจำเปลี่ยนหรือปิดใช้งาน กรุณาเลือกและบันทึกใหม่');
    }
    const lines = data.lines.length ? data.lines : [data.quote];
    const ids = [
      ...new Set(
        lines.flatMap((l) => [
          l.productId,
          l.fabricId,
          ...l.parts.flatMap((p) => [p.componentId, ...(p.fabricId ? [p.fabricId] : [])]),
        ]),
      ),
    ];
    const selections = await sql.query<OrderSnapshot['selections'][number]>(
      'SELECT id,name,kind,availability,row_version,source_key FROM catalog_items WHERE id=ANY($1::uuid[]) ORDER BY id',
      [ids],
    );
    for (const [index, line] of lines.entries()) {
      const parts = selections.filter((item) => line.parts.some((p) => p.componentId === item.id));
      for (const required of [
        { prefix: 'ບ່າ', label: 'บ่าเสื้อ' },
        { prefix: 'ປາຍແຂນ', label: 'ปลายแขน' },
        { prefix: 'ແຂນ', label: 'แขนเสื้อ (ยังไม่มีค่าเริ่มต้นที่กำหนดไว้)' },
      ]) {
        if (
          !parts.some(
            (p) =>
              p.source_key?.includes('/' + required.prefix) ||
              (!p.source_key && p.name.startsWith(required.prefix)),
          )
        )
          missing.push(`รายการ ${index + 1}: เลือก${required.label}ก่อนยืนยัน`);
      }
    }
    for (const item of selections.filter((i) => i.kind === 'FABRIC')) {
      if (item.availability === 'UNKNOWN') missing.push('ยังไม่ระบุความพร้อมของผ้า ' + item.name);
      if (item.availability === 'OUT_OF_STOCK') missing.push('ผ้าหมด: ' + item.name);
      if (item.availability === 'LOW_STOCK') warnings.push('ผ้าใกล้หมด: ' + item.name);
    }
    let pricing = draft.quote_json as OrderSnapshot['pricing'];
    try {
      pricing = await priceDraft(this.pricing, actor, data, sql);
      missing.push(...pricing.missing);
      if ((draft.quote_json as { revision: number }).revision !== pricing.revision)
        missing.push('ราคามีฉบับใหม่ กรุณาเปิดแก้ร่าง คำนวณและบันทึกใหม่ก่อนตรวจไฟล์');
    } catch (error) {
      if (error instanceof AppError) missing.push(error.message);
      else throw error;
    }
    const files = await this.assets.checklist(actor, input.draftId, sql);
    missing.push(...files.missing);
    const approved = files.assets.filter(
      (a) =>
        !a.stale &&
        a.status === 'APPROVED' &&
        a.revision ===
          Math.max(...files.assets.filter((f) => f.kind === a.kind).map((f) => f.revision)),
    );
    const snapshot: OrderSnapshot = {
      input: data,
      pricing,
      selections,
      assets: approved,
      dueDate: input.dueDate,
      businessDate: businessDate(),
    };
    const checkToken = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    return { ready: missing.length === 0, missing, warnings, checkToken, snapshot };
  }
  async check(actor: UserView, input: ReadinessInput) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql, actor);
      return this.inspect(sql, actor, input);
    });
  }
  async confirm(actor: UserView, input: ReadinessInput, token: string, reason: string) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql, actor);
      let order = (
        await sql.query('SELECT * FROM orders WHERE draft_id=$1 FOR UPDATE', [input.draftId])
      )[0];
      if (order) {
        await assertOrderOperational(sql, String(order.id));
        const replay = (
          await sql.query(
            `SELECT ${projection} FROM orders o JOIN order_revisions r ON r.order_id=o.id WHERE o.id=$1 AND r.draft_version=$2`,
            [order.id, input.rowVersion],
          )
        )[0];
        if (replay) {
          if ((replay.snapshot as OrderSnapshot).dueDate !== input.dueDate)
            throw new AppError(
              'DRAFT_REVISION_REQUIRED',
              'ต้องบันทึกแก้ร่างเป็นฉบับใหม่ก่อนเปลี่ยนกำหนดส่งของออเดอร์ที่ยืนยันแล้ว',
              409,
            );
          return { order: replay as unknown as ConfirmedOrder };
        }
      }
      const checked = await this.inspect(sql, actor, input);
      if (!checked.ready) throw new AppError('ORDER_NOT_READY', checked.missing.join(' · '), 409);
      if (checked.checkToken !== token)
        throw new AppError(
          'CHECK_CHANGED',
          'ข้อมูลเปลี่ยนหลังตรวจ กรุณาตรวจความพร้อมอีกครั้ง',
          409,
        );
      const revision = order ? Number(order.latest_revision) + 1 : 1;
      if (!order) {
        order = {
          id: uuidv7(),
          order_number: await nextDocumentNumber(sql, 'JAZ', checked.snapshot.businessDate),
          invoice_number: await nextDocumentNumber(sql, 'INV', checked.snapshot.businessDate),
        };
        await sql.query(
          'INSERT INTO orders(id,draft_id,order_number,invoice_number,latest_revision) VALUES($1,$2,$3,$4,$5)',
          [order.id, input.draftId, order.order_number, order.invoice_number, revision],
        );
      } else
        await sql.query('UPDATE orders SET latest_revision=$2 WHERE id=$1', [order.id, revision]);
      const revisionId = uuidv7();
      await sql.query(
        'INSERT INTO order_revisions(id,order_id,revision,draft_version,pricing_revision,snapshot,confirmed_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          revisionId,
          order.id,
          revision,
          input.rowVersion,
          checked.snapshot.pricing.revision,
          JSON.stringify(checked.snapshot),
          actor.id,
          reason,
        ],
      );
      for (const asset of checked.snapshot.assets)
        await sql.query('INSERT INTO order_revision_assets(revision_id,asset_id) VALUES($1,$2)', [
          revisionId,
          asset.id,
        ]);
      await queueDocument(sql, 'INVOICE', String(order.id), revision, true);
      await sql.query(
        "INSERT INTO production_preparations(order_id,required_revision) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET required_revision=EXCLUDED.required_revision,status='WAITING_FOR_PRODUCTION_SHEET'",
        [order.id, revision],
      );
      await recordAudit(
        sql,
        actor.id,
        revision === 1 ? 'ORDER_CONFIRMED' : 'ORDER_REVISED',
        String(order.id),
        reason,
        { revision, draftVersion: input.rowVersion, invoiceNumber: order.invoice_number },
      );
      await recordEvent(sql, revision === 1 ? 'OrderConfirmed' : 'OrderRevised', String(order.id));
      return {
        order: (
          await sql.query(
            `SELECT ${projection} FROM orders o JOIN order_revisions r ON r.order_id=o.id WHERE r.id=$1`,
            [revisionId],
          )
        )[0] as unknown as ConfirmedOrder,
      };
    });
  }
  async list(actor: UserView) {
    await this.auth.require(this.db, actor, 'orders.manage');
    return {
      orders: await this.db.query(
        `SELECT ${projection} FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.storage_state='ACTIVE' AND o.business_state='ACTIVE' ORDER BY o.created_at DESC,o.id DESC LIMIT 50`,
      ),
    };
  }
  async history(actor: UserView, id: string) {
    await this.auth.require(this.db, actor, 'orders.manage');
    return {
      revisions: await this.db.query(
        `SELECT ${projection} FROM orders o JOIN order_revisions r ON r.order_id=o.id WHERE o.id=$1 ORDER BY r.revision DESC`,
        [id],
      ),
    };
  }
}
