import { z } from 'zod';
import type { ProductionContext } from './production';
import type { WorkStage, WorkState } from './production-work';
const row = z
  .object({
    sourceLineIndex: z.number().int().min(0).max(29),
    targetLineIndex: z.number().int().min(0).max(29),
    quantity: z.number().int().min(1).max(300000),
  })
  .strict();
export const revisionReviewSchema = z
  .object({
    requestId: z.uuid(),
    orderRevision: z.number().int().positive(),
    checkToken: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(1).max(1000),
    reviewedFiles: z.literal(true),
    reviewedRemainder: z.literal(true),
    decisions: z
      .array(
        z
          .object({
            sheetId: z.uuid(),
            nameIndexes: z
              .array(z.number().int().min(0).max(2999))
              .max(3000)
              .default([])
              .refine((v) => new Set(v).size === v.length, 'Duplicate name'),
            rows: z
              .array(row)
              .max(30)
              .refine(
                (rows) => new Set(rows.map((r) => r.sourceLineIndex)).size === rows.length,
                'Duplicate source line',
              ),
          })
          .strict(),
      )
      .max(100)
      .refine(
        (rows) => new Set(rows.map((r) => r.sheetId)).size === rows.length,
        'Duplicate sheet',
      ),
  })
  .strict();
export type RevisionReviewInput = z.infer<typeof revisionReviewSchema>;
export const revisionReversalSchema = z
  .object({
    requestId: z.uuid(),
    checkToken: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(1).max(1000),
    reviewedEffects: z.literal(true),
  })
  .strict();
export type RevisionReversalInput = z.infer<typeof revisionReversalSchema>;
export type RevisionReversalResult = {
  ok: true;
  reviewId: string;
  reversalId: string;
  restoredSheetIds: string[];
  cancelledSheetIds: string[];
};
export type RevisionReversalView = {
  reviewId: string;
  orderId: string;
  revision: number;
  checkToken: string;
  canReverse: boolean;
  blockers: string[];
  sheets: {
    sourceSheetId: string;
    sourceNumber: string;
    sourceState: string | null;
    targetSheetId: string | null;
    targetNumber: string | null;
    targetState: string | null;
  }[];
  reversal: { actorName: string; reason: string; at: string } | null;
};
export type RevisionSource = {
  id: string;
  number: string;
  orderRevision: number;
  state: string;
  blockers: string[];
  stages: { department: WorkStage; state: WorkState }[];
  names: { index: number; sourceLineIndex: number; name: string; number: string }[];
  lines: {
    sourceLineIndex: number;
    size: string;
    allocated: number;
    scrap: number;
    released: number;
    shipped: number;
    reusable: number;
    targets: { lineIndex: number; size: string }[];
  }[];
};
export type RevisionReviewView = {
  context: ProductionContext;
  canReview: boolean;
  checkToken: string;
  sources: RevisionSource[];
  history: {
    id: string;
    revision: number;
    actorName: string;
    reason: string;
    at: string;
    result: RevisionReviewResult;
    reversal: { actorName: string; reason: string; at: string } | null;
  }[];
};
export type RevisionReviewResult = {
  ok: true;
  reviewId: string;
  revision: number;
  sheets: {
    sourceSheetId: string;
    targetSheetId: string | null;
    number: string | null;
    reused: number;
    notReused: number;
  }[];
};
