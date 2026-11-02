import type { Sql } from '../database';
import type { SheetInput } from '../../../../packages/contracts/src/production';
import type { CorrectionRow } from '../../../../packages/contracts/src/issue-corrections';
import { productionStock } from './quantities';
import { replacementUsage } from './issue-resolution-ledger';
import { AppError } from '../errors';
export function correctionRows(rows: Partial<CorrectionRow>[]) {
  return rows
    .map((r) => ({
      lineIndex: Number(r.lineIndex),
      usableQty: Number(r.usableQty ?? 0),
      scrapQty: Number(r.scrapQty ?? 0),
      releaseQty: Number(r.releaseQty ?? 0),
      ignoredQty: Number(r.ignoredQty ?? 0),
    }))
    .filter((r) => r.usableQty + r.scrapQty + r.releaseQty + r.ignoredQty > 0)
    .sort((a, b) => a.lineIndex - b.lineIndex);
}
export async function validateReplacementAllowance(
  sql: Sql,
  issueId: string,
  rows: CorrectionRow[],
) {
  const usage = await replacementUsage(sql, issueId);
  for (const used of usage) {
    const row = rows.find((r) => r.lineIndex === used.lineIndex);
    if (used.quantity > (row?.scrapQty ?? 0) + (row?.releaseQty ?? 0))
      throw new AppError(
        'REPLACEMENT_COMMITTED',
        'ຈຳນວນທົດແທນຜູກກັບວຽກແລ້ວ ໃຫ້ກວດຮ່າງ/ວຽກທົດແທນກ່ອນ / Review committed replacement quantities first',
        409,
      );
  }
}
export async function assertCurrentOrderCapacity(sql: Sql, orderId: string) {
  const stock = await productionStock(sql, orderId),
    wanted = new Map<string, number>(),
    used = new Map<string, number>(),
    ids = new Set(stock.sheets.map((s) => s.id));
  for (const line of stock.lines) {
    wanted.set(line.key, (wanted.get(line.key) ?? 0) + line.quantity);
    used.set(line.key, (used.get(line.key) ?? 0) + (stock.allocated[line.lineIndex] ?? 0));
  }
  for (const sent of stock.shipped.filter((s) => !ids.has(s.sheet_id)))
    used.set(sent.goods_key, (used.get(sent.goods_key) ?? 0) + sent.quantity);
  if ([...used].some(([key, count]) => wanted.has(key) && count > wanted.get(key)!))
    throw new AppError(
      'CORRECTION_OVER_ALLOCATION',
      'ຈຳນວນຫຼັງແກ້ລວມກັບວຽກອື່ນເກີນ Order / Corrected quantities exceed the current order',
      409,
    );
}
export function validDraftNames(
  details: SheetInput['printDetails'],
  allocations: SheetInput['allocations'],
) {
  return details.names.every(
    (n) =>
      details.names.filter((x) => x.lineIndex === n.lineIndex).length <=
      (allocations.find((a) => a.lineIndex === n.lineIndex)?.quantity ?? 0),
  );
}
