import { z } from 'zod';
import type { DraftInput, DraftView } from './orders';
export const quotationCheckSchema = z
  .object({
    draftVersion: z.number().int().positive(),
    validUntil: z.iso.date(),
    notes: z.string().trim().max(2000).default(''),
  })
  .strict();
export const quotationIssueSchema = quotationCheckSchema.extend({
  requestId: z.uuid(),
  checkToken: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(1000),
});
export const quotationQuerySchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type QuotationCheckInput = z.infer<typeof quotationCheckSchema>;
export type QuotationIssueInput = z.infer<typeof quotationIssueSchema>;
export type QuotationSnapshot = {
  input: DraftInput;
  pricing: DraftView['pricing'];
  selections: {
    id: string;
    name: string;
    kind: string;
    availability: string;
    row_version: number;
  }[];
  businessDate: string;
  validUntil: string;
  notes: string;
  templateVersion: 'quotation-v1';
};
export type QuotationCheck = {
  ready: boolean;
  missing: string[];
  warnings: string[];
  checkToken: string;
  snapshot: QuotationSnapshot | null;
};
export type QuotationSummary = {
  id: string;
  quotationId: string;
  draftId: string;
  number: string;
  revision: number;
  latestRevision: number;
  draftVersion: number;
  issuedAt: string;
  actorName: string;
  reason: string;
  customerName: string;
  total: string;
  validUntil: string;
};
export type QuotationView = QuotationSummary & {
  snapshot: QuotationSnapshot;
  currentDraftVersion: number;
  linkedOrderId: string | null;
};
export type QuotationHistory = {
  revisions: QuotationSummary[];
  hasMore: boolean;
  linkedOrderId: string | null;
  currentDraftVersion: number;
};
