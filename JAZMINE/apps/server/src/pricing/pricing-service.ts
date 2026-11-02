import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import {
  pricingConfigSchema,
  type PricingConfig,
  type PricingQuote,
  type QuoteResult,
} from '../../../../packages/contracts/src/pricing';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { AppError } from '../errors';
export function discountedTotal(subtotal: number, percent: number, fixed: number) {
  // Integer arithmetic: percentage first, round half up to one kip, then fixed discount.
  const value = BigInt(subtotal) * (10000n - BigInt(Math.round(percent * 100)));
  if (value <= 0n) return 0;
  return Math.max(0, Number((value + 5000n) / 10000n) - fixed);
}
export class PricingService {
  private readonly auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async current(actor: UserView, sql: Sql = this.db) {
    await this.auth.require(sql, actor, 'customers.manage');
    const row = (
      await sql.query(
        'SELECT revision,config,source FROM pricing_versions ORDER BY revision DESC LIMIT 1',
      )
    )[0];
    if (!row)
      throw new AppError('PRICE_NOT_READY', 'ยังไม่ได้นำเข้าราคา กรุณาเปิดโปรแกรมใหม่', 409);
    return {
      revision: Number(row.revision),
      config: pricingConfigSchema.parse(row.config),
      source: String(row.source),
    };
  }
  async save(actor: UserView, revision: number, config: PricingConfig, reason: string) {
    return this.db.transaction(async (sql) => {
      await this.auth.require(sql, actor, 'users.manage', true);
      await sql.query('LOCK TABLE pricing_versions IN EXCLUSIVE MODE');
      const latest = (
        await sql.query('SELECT revision FROM pricing_versions ORDER BY revision DESC LIMIT 1')
      )[0];
      if (Number(latest?.revision) !== revision)
        throw new AppError('STALE_STATE', 'ราคาเปลี่ยนแล้ว กรุณาเปิดข้อมูลล่าสุด', 409);
      const id = uuidv7();
      await sql.query(
        'INSERT INTO pricing_versions(id,revision,config,source,reason,created_by) VALUES($1,$2,$3,$4,$5,$6)',
        [id, revision + 1, JSON.stringify(config), 'OWNER_CONFIG', reason, actor.id],
      );
      await recordAudit(sql, actor.id, 'PRICING_VERSION_CREATED', id, reason, {
        revision: revision + 1,
      });
      return { ok: true };
    });
  }
  async quote(actor: UserView, input: PricingQuote, sql: Sql = this.db): Promise<QuoteResult> {
    const view = await this.current(actor, sql);
    if (input.applyBuyGet && input.freeQuantity > 0)
      throw new AppError(
        'FREE_QUANTITY_CONFLICT',
        'เลือกของแถมอัตโนมัติหรือใส่จำนวนเองอย่างใดอย่างหนึ่ง',
        400,
      );
    if (input.applyBuyGet && !view.config.buyGet)
      throw new AppError('PROMOTION_NOT_SET', 'เจ้าของยังไม่กำหนดกติกาซื้อครบแถม', 409);
    const automaticFreeQuantity =
      input.applyBuyGet && view.config.buyGet
        ? Math.floor(input.quantity / view.config.buyGet.buy) * view.config.buyGet.get
        : 0;
    if (automaticFreeQuantity > 10000)
      throw new AppError(
        'TOO_MANY_FREE_UNITS',
        'จำนวนของแถมสูงเกินไป กรุณาตรวจจำนวนที่ซื้อและกติกา',
        400,
      );
    const freeQuantity = input.applyBuyGet ? automaticFreeQuantity : input.freeQuantity;
    const product = (
      await sql.query(
        "SELECT source_key FROM catalog_items WHERE id=$1 AND kind='PRODUCT' AND active=true",
        [input.productId],
      )
    )[0];
    if (!product) throw new AppError('INVALID_PRODUCT', 'เลือกสินค้าที่ใช้งานได้', 400);
    const group = view.config.collar[String(product.source_key ?? input.productId)];
    if (!group)
      throw new AppError('PRICE_GROUP_MISSING', 'ยังไม่กำหนดกลุ่มราคาของแบบเสื้อนี้', 409);
    if (
      !(
        await sql.query('SELECT name FROM catalog_item_sizes WHERE item_id=$1 AND name=$2', [
          input.productId,
          input.size,
        ])
      ).length
    )
      throw new AppError('SIZE_UNAVAILABLE', 'ไซซ์นี้ยังไม่เปิดให้เลือกกับสินค้า', 400);
    if (
      !(
        await sql.query(
          'SELECT f.id FROM catalog_item_fabrics c JOIN catalog_items f ON f.id=c.fabric_id WHERE c.item_id=$1 AND f.id=$2 AND f.active=true',
          [input.productId, input.fabricId],
        )
      ).length
    )
      throw new AppError('FABRIC_UNAVAILABLE', 'ผ้านี้ยังไม่ได้เลือกไว้สำหรับสินค้า', 400);
    const base = view.config.base[input.group]['ABCD'.indexOf(group)],
      sizeExtra = view.config.size[input.group][input.size];
    const fabricExtra = view.config.adjustments[input.fabricId] ?? null;
    const missing: string[] = [];
    if (fabricExtra === null)
      missing.push('ยังไม่กำหนดราคาเพิ่มของผ้า เลือก 0 ได้เมื่อเจ้าของยืนยันว่าไม่คิดเพิ่ม');
    let componentExtra: number | null = 0,
      partFabricExtra: number | null = 0;
    const slots = new Set<string>();
    for (const part of input.parts) {
      const component = (
        await sql.query(
          "SELECT source_key,name FROM catalog_items WHERE id=$1 AND kind='COMPONENT' AND active=true",
          [part.componentId],
        )
      )[0];
      if (!component)
        throw new AppError('INVALID_COMPONENT', 'ส่วนประกอบนี้ปิดใช้งานหรือไม่ใช่ส่วนประกอบ', 400);
      const source = String(component.source_key ?? '');
      const slot = source.includes('/ແຂນ')
        ? 'sleeve'
        : source.includes('/ປາຍແຂນ')
          ? 'cuff'
          : source.includes('/ບ່າ')
            ? 'shoulder'
            : part.componentId;
      if (slots.has(slot))
        throw new AppError(
          'DUPLICATE_PART',
          'เลือกส่วนประกอบประเภทเดียวกันมากกว่าหนึ่งแบบไม่ได้',
          400,
        );
      slots.add(slot);
      const extra = view.config.components[part.componentId];
      if (extra === undefined) {
        componentExtra = null;
        missing.push('ยังไม่กำหนดราคาส่วนประกอบ ' + component.name);
      } else if (componentExtra !== null) componentExtra += extra;
      if (!part.fabricId && view.config.partFabric[part.componentId]?.enabled) {
        partFabricExtra = null;
        missing.push(
          'เลือกผ้าแยกของ ' + component.name + ' ก่อนคำนวณราคา เพราะเปิดคิดเพิ่มค่าผ้าไว้',
        );
      }
      if (part.fabricId) {
        if (
          !(
            await sql.query(
              'SELECT f.id FROM catalog_item_fabrics c JOIN catalog_items f ON f.id=c.fabric_id WHERE c.item_id=$1 AND f.id=$2 AND f.active=true',
              [part.componentId, part.fabricId],
            )
          ).length
        )
          throw new AppError(
            'PART_FABRIC_UNAVAILABLE',
            'ผ้านี้ยังไม่เปิดใช้กับส่วนประกอบที่เลือก',
            400,
          );
        const setting = view.config.partFabric[part.componentId];
        if (!setting) {
          partFabricExtra = null;
          missing.push('ยังไม่กำหนดว่าจะคิดเพิ่มค่าผ้าของ ' + component.name);
        } else if (setting.enabled) {
          const rate = setting.rates[part.fabricId];
          if (rate === undefined) {
            partFabricExtra = null;
            missing.push('ยังไม่กำหนดค่าผ้าของ ' + component.name);
          } else if (partFabricExtra !== null) partFabricExtra += rate;
        }
      }
    }
    const unit =
        fabricExtra === null || componentExtra === null || partFabricExtra === null
          ? null
          : base + sizeExtra + fabricExtra + componentExtra + partFabricExtra,
      subtotal = unit === null ? null : unit * input.quantity;
    const total = subtotal === null ? null : discountedTotal(subtotal, input.percent, input.fixed);
    const exchangeRate = input.currency === 'LAK' ? '1' : view.config.fx[input.currency];
    if (exchangeRate === null) missing.push('เจ้าของยังไม่กำหนดอัตราแลกเปลี่ยน ' + input.currency);
    return {
      revision: view.revision,
      ready: missing.length === 0,
      missing,
      currency: 'LAK',
      base,
      sizeExtra,
      fabricExtra,
      unit,
      subtotal,
      total,
      quantity: input.quantity,
      freeQuantity,
      automaticFreeQuantity,
      productionQuantity: input.quantity + freeQuantity,
      percent: input.percent,
      fixed: input.fixed,
      componentExtra,
      partFabricExtra,
      displayCurrency: input.currency,
      exchangeRate,
      convertedTotal:
        total === null || exchangeRate === null
          ? null
          : input.currency === 'LAK'
            ? String(total)
            : convertLak(total, exchangeRate),
    };
  }
}
export function convertLak(lak: number, rate: string): string {
  const [whole, fraction = ''] = rate.split('.');
  const divisor = BigInt(whole) * 10000000000n + BigInt(fraction.padEnd(10, '0'));
  if (divisor <= 0n) throw new AppError('INVALID_RATE', 'อัตราต้องมากกว่า 0', 400);
  const cents = (BigInt(lak) * 100n * 10000000000n + divisor / 2n) / divisor;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
