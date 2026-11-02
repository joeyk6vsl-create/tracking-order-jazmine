import { z } from 'zod';
import type { IssueResolve } from './production-exceptions';
const quantity = z.number().int().min(0).max(300000);
export const correctionRowSchema = z
  .object({
    lineIndex: z.number().int().min(0).max(29),
    usableQty: quantity,
    scrapQty: quantity,
    releaseQty: quantity,
    ignoredQty: quantity,
  })
  .strict()
  .refine(
    (r) => r.usableQty + r.scrapQty + r.releaseQty + r.ignoredQty <= 300000,
    'Review total exceeds limit',
  );
const uniqueLines = (r: { lineIndex: number }[]) =>
  new Set(r.map((x) => x.lineIndex)).size === r.length;
export const issueCorrectionSchema = z
  .object({
    requestId: z.uuid(),
    rowVersion: z.number().int().positive(),
    sheetRowVersion: z.number().int().positive(),
    checkToken: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(1).max(1000),
    verifiedStock: z.literal(true),
    rows: z.array(correctionRowSchema).max(30).refine(uniqueLines, 'Duplicate line'),
    replacementEdits: z
      .array(
        z
          .object({
            sheetId: z.uuid(),
            rowVersion: z.number().int().positive(),
            allocations: z
              .array(
                z
                  .object({ lineIndex: z.number().int().min(0).max(29), quantity: quantity.min(1) })
                  .strict(),
              )
              .max(30)
              .refine(uniqueLines, 'Duplicate replacement line'),
          })
          .strict(),
      )
      .max(100)
      .default([])
      .refine(
        (r) => new Set(r.map((x) => x.sheetId)).size === r.length,
        'Duplicate replacement sheet',
      ),
  })
  .strict();
export type CorrectionRow = z.infer<typeof correctionRowSchema>;
export type IssueCorrectionInput = z.infer<typeof issueCorrectionSchema>;
export type ResolutionHistory = {
  issueVersion: number;
  kind: 'INITIAL' | 'CORRECTION';
  rows: IssueResolve['rows'];
  actorName: string;
  reason: string;
  at: string;
  replacementChanges: {
    sheetId: string;
    before: { allocations: { lineIndex: number; quantity: number }[]; state: string };
    after: { allocations: { lineIndex: number; quantity: number }[]; state: string };
  }[];
};
export type CorrectionView = {
  issueId: string;
  sheetId: string;
  sheetNumber: string;
  rowVersion: number;
  sheetRowVersion: number;
  checkToken: string;
  currentRows: CorrectionRow[];
  history: ResolutionHistory[];
  lines: {
    lineIndex: number;
    size: string;
    allocated: number;
    reviewLimit: number;
    reported: number;
    otherLoss: number;
    shipped: number;
    carried: number;
  }[];
  replacements: {
    id: string;
    number: string;
    state: string;
    rowVersion: number;
    editable: boolean;
    allocations: { lineIndex: number; quantity: number }[];
  }[];
  replacementUsage: { lineIndex: number; quantity: number }[];
};
export type IssueCorrectionResult = { ok: true; issueId: string; issueVersion: number };
