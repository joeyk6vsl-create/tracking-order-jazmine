import type { UserView } from '../../../../packages/contracts/src/identity';
import type { DraftInput } from '../../../../packages/contracts/src/orders';
import type { QuoteResult } from '../../../../packages/contracts/src/pricing';
import { PricingService, discountedTotal, convertLak } from '../pricing/pricing-service';
import { AppError } from '../errors';
import type { Sql } from '../database';
export async function priceDraft(
  pricing: PricingService,
  actor: UserView,
  data: DraftInput,
  sql?: Sql,
): Promise<QuoteResult & { linePricing?: QuoteResult[] }> {
  if (!data.lines.length) return pricing.quote(actor, data.quote, sql);
  const view = await pricing.current(actor, sql),
    linePricing: QuoteResult[] = [];
  const purchased = data.lines.reduce((n, l) => n + l.quantity, 0),
    free = data.lines.reduce((n, l) => n + l.freeQuantity, 0);
  if (data.quote.applyBuyGet) {
    if (!view.config.buyGet)
      throw new AppError('PROMOTION_NOT_SET', 'เจ้าของยังไม่ตั้งโปรโมชั่น', 409);
    const expected = Math.floor(purchased / view.config.buyGet.buy) * view.config.buyGet.get;
    if (free !== expected)
      throw new AppError(
        'FREE_ALLOCATION_MISMATCH',
        `จัดของแถมลงรายการและไซซ์ให้รวม ${expected} ตัว (ตอนนี้ ${free})`,
        400,
      );
  }
  for (const line of data.lines) {
    if (line.group !== data.quote.group || line.currency !== data.quote.currency)
      throw new AppError(
        'MIXED_CONTEXT',
        'ทุกรายการต้องใช้กลุ่มลูกค้าและสกุลเงินเดียวกับร่าง',
        400,
      );
    if (line.percent || line.fixed || line.applyBuyGet)
      throw new AppError(
        'LINE_PROMOTION',
        'ส่วนลดและโปรโมชั่นต้องกำหนดที่ยอดรวมร่างเพียงครั้งเดียว',
        400,
      );
    const result = await pricing.quote(actor, line, sql);
    if (result.revision !== view.revision)
      throw new AppError('PRICE_CHANGED', 'ราคาเปลี่ยนระหว่างคำนวณ กรุณาลองอีกครั้ง', 409);
    linePricing.push(result);
  }
  const first = linePricing[0],
    missing = linePricing.flatMap((l, i) => l.missing.map((m) => `รายการ ${i + 1}: ${m}`));
  const subtotal = linePricing.some((l) => l.subtotal === null)
    ? null
    : linePricing.reduce((n, l) => n + l.subtotal!, 0);
  const total =
    subtotal === null ? null : discountedTotal(subtotal, data.quote.percent, data.quote.fixed);
  const exchangeRate = first.exchangeRate;
  return {
    ...first,
    unit: null,
    subtotal,
    total,
    ready: missing.length === 0,
    missing,
    quantity: purchased,
    freeQuantity: free,
    productionQuantity: purchased + free,
    percent: data.quote.percent,
    fixed: data.quote.fixed,
    automaticFreeQuantity: data.quote.applyBuyGet ? free : 0,
    convertedTotal:
      total === null || exchangeRate === null
        ? null
        : data.quote.currency === 'LAK'
          ? String(total)
          : convertLak(total, exchangeRate),
    linePricing,
  };
}
