import { z } from 'zod';
import { WORK_STAGES } from './production-work';
import type { ResolutionHistory } from './issue-corrections';
export const ISSUE_CATEGORIES = ['DAMAGE', 'MATERIAL', 'ARTWORK', 'MACHINE', 'OTHER'] as const;
export const ISSUE_LABELS = {
  DAMAGE: 'ເສຍຫາຍ / Damage',
  MATERIAL: 'ວັດຖຸດິບ / Material',
  ARTWORK: 'ແບບງານ / Artwork',
  MACHINE: 'ເຄື່ອງຈັກ / Machine',
  OTHER: 'ອື່ນໆ / Other',
};
const quantity = z.number().int().min(0).max(300000);
const lineIndex = z.number().int().min(0).max(29);
const allocation = z.object({ lineIndex, quantity: quantity.min(1) }).strict();
const unique = (rows: { lineIndex: number }[]) =>
  new Set(rows.map((r) => r.lineIndex)).size === rows.length;
export const issueReportSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().positive(),
    sheetRowVersion: z.number().int().positive(),
    department: z.enum(WORK_STAGES),
    category: z.enum(ISSUE_CATEGORIES),
    mode: z.enum(['CONTINUE', 'STOP']),
    description: z.string().trim().min(1).max(2000),
    affected: z.array(allocation).max(30).refine(unique, 'ລາຍການຊ້ຳ'),
  })
  .strict()
  .refine(
    (input) => input.category !== 'DAMAGE' || input.affected.length > 0,
    'ປັນຫາເສຍຫາຍຕ້ອງລະບຸ Size ແລະຈຳນວນ',
  );
export const resolutionRowSchema = z
  .object({
    lineIndex,
    usableQty: quantity,
    scrapQty: quantity,
    releaseQty: quantity,
    ignoredQty: quantity,
    replacementQty: quantity,
  })
  .strict();
export const issueResolveSchema = z
  .object({
    requestId: z.uuid(),
    rowVersion: z.number().int().positive(),
    sheetRowVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
    rows: z.array(resolutionRowSchema).max(30).refine(unique, 'ລາຍການຊ້ຳ'),
  })
  .strict();
export const replacementSchema = z
  .object({
    requestId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
    allocations: z.array(allocation).min(1).max(30).refine(unique, 'ລາຍການຊ້ຳ'),
  })
  .strict();
export type IssueReport = z.infer<typeof issueReportSchema>;
export type IssueResolve = z.infer<typeof issueResolveSchema>;
export type ReplacementInput = z.infer<typeof replacementSchema>;
export type IssueView = {
  resolutionHistory?: ResolutionHistory[];
  replacementUsage?: { lineIndex: number; quantity: number }[];
  id: string;
  sheetVersion: number;
  department: (typeof WORK_STAGES)[number];
  category: (typeof ISSUE_CATEGORIES)[number];
  mode: 'CONTINUE' | 'STOP';
  description: string;
  affected: { lineIndex: number; quantity: number }[];
  state: 'OPEN' | 'RESOLVED';
  rowVersion: number;
  reporterName: string;
  reportedAt: string;
  resolverName: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  resolutionRows: IssueResolve['rows'] | null;
  replacements: {
    id: string;
    sheetNumber: string | null;
    state: string;
    allocations: { lineIndex: number; quantity: number }[];
  }[];
};
export type Readiness = {
  orderId: string;
  orderNumber: string;
  revision: number;
  status: 'NOT_READY' | 'PARTIALLY_READY' | 'READY_TO_SHIP';
  quantity: number;
  readyQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
  lines: {
    lineIndex: number;
    size: string;
    quantity: number;
    allocated: number;
    ready: number;
    scrap: number;
    released: number;
  }[];
};
export type ExceptionDetail = {
  canResolve: boolean;
  issues: IssueView[];
  readiness: Readiness | null;
  losses: { lineIndex: number; scrap: number; released: number }[];
};
