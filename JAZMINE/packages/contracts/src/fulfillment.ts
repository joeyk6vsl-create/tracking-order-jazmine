import type { OrderSnapshot } from './confirmation';
export type GoodsLine = {
  productId: string;
  fabricId: string;
  size: string;
  parts: { componentId: string; fabricId?: string }[];
};
export function goodsKey(line: GoodsLine) {
  return JSON.stringify([
    line.productId,
    line.fabricId,
    line.size,
    [...line.parts]
      .map((p) => [p.componentId, p.fabricId ?? ''])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
export function fulfillmentLines(snapshot: OrderSnapshot) {
  const lines = snapshot.input.lines.length ? snapshot.input.lines : [snapshot.input.quote];
  return lines.map((line, lineIndex) => ({
    ...line,
    lineIndex,
    key: goodsKey(line),
    quantity:
      line.quantity +
      (snapshot.input.lines.length ? line.freeQuantity : snapshot.pricing.freeQuantity),
  }));
}
export function distribute(
  lines: { key: string; quantity: number }[],
  totals: Map<string, number>,
) {
  const left = new Map(totals);
  return lines.map((line) => {
    const count = Math.max(0, Math.min(line.quantity, left.get(line.key) ?? 0));
    left.set(line.key, (left.get(line.key) ?? 0) - count);
    return count;
  });
}
