import type { OrderSnapshot } from '../../../../packages/contracts/src/confirmation';
import type {
  SheetInput,
  ProductionContext,
  PartFile,
} from '../../../../packages/contracts/src/production';
export function iso(value: unknown) {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}
export function context(row: Record<string, unknown>): ProductionContext {
  const snap = row.snapshot as OrderSnapshot,
    lines = snap.input.lines.length ? snap.input.lines : [snap.input.quote];
  return {
    orderId: String(row.id),
    orderNumber: String(row.order_number),
    revision: Number(row.revision),
    customerName: snap.input.customerName,
    dueDate: snap.dueDate,
    confirmedAt: row.confirmed_at ? iso(row.confirmed_at) : undefined,
    brandingType: snap.input.brandingType,
    assets: snap.assets,
    selections: snap.selections.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      source_key: i.source_key,
    })),
    lines: lines.map((line, i) => ({
      lineIndex: i,
      productId: line.productId,
      fabricId: line.fabricId,
      size: line.size,
      quantity:
        line.quantity + (snap.input.lines.length ? line.freeQuantity : snap.pricing.freeQuantity),
      parts: line.parts,
    })),
  };
}
export function required(ctx: ProductionContext, allocations: SheetInput['allocations']) {
  const result = new Set<PartFile['part']>(['BODY', 'BODY_BACK', 'COLLAR']);
  for (const line of ctx.lines.filter((l) => allocations.some((a) => a.lineIndex === l.lineIndex)))
    for (const part of line.parts) {
      const item = ctx.selections.find((i) => i.id === part.componentId),
        source = item?.source_key ?? item?.name ?? '';
      if (source.includes('/ແຂນ') || source.startsWith('ແຂນ')) {
        result.add('SLEEVE_LEFT');
        result.add('SLEEVE_RIGHT');
      }
      if (source.includes('ປາຍແຂນ')) {
        result.add('CUFF_LEFT');
        result.add('CUFF_RIGHT');
      }
      if (source.includes('ບ່າ')) result.add('SHOULDER');
    }
  return [...result];
}
