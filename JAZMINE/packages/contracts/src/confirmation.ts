import { z } from 'zod';
import type { DraftInput } from './orders';
import type { QuoteResult } from './pricing';
import type { AssetView } from './assets';
export const readinessSchema = z
  .object({ draftId: z.uuid(), rowVersion: z.number().int().positive(), dueDate: z.iso.date() })
  .strict();
export const confirmSchema = readinessSchema.extend({
  checkToken: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1, 'ใส่เหตุผลการยืนยัน').max(500),
});
export type ReadinessInput = z.infer<typeof readinessSchema>;
export type OrderSnapshot = {
  input: DraftInput;
  pricing: QuoteResult & { linePricing?: QuoteResult[] };
  selections: {
    id: string;
    name: string;
    kind: string;
    availability: string;
    row_version: number;
    source_key: string | null;
  }[];
  assets: AssetView[];
  dueDate: string;
  businessDate: string;
};
export type OrderReadiness = {
  ready: boolean;
  missing: string[];
  warnings: string[];
  checkToken: string;
  snapshot: OrderSnapshot;
};
export type ConfirmedOrder = {
  businessState: 'ACTIVE' | 'CANCELLED';
  storageState: 'ACTIVE' | 'ARCHIVED';
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  revision: number;
  draftVersion: number;
  confirmedAt: string;
  snapshot: OrderSnapshot;
};
