import { z } from 'zod';
import type { SheetSnapshot } from './production';
export const WORK_STAGES = [
  'PRINTING',
  'HEAT_TRANSFER',
  'LASER',
  'SIZE_SORTING',
  'SEWING',
  'QC_PACKING',
] as const;
export type WorkStage = (typeof WORK_STAGES)[number];
export const WORK_STAGE_LABELS: Record<WorkStage, string> = {
  PRINTING: 'ພິມ / Printing',
  HEAT_TRANSFER: 'ຮີດ / Heat transfer',
  LASER: 'ເລເຊີ / Laser',
  SIZE_SORTING: 'ແຍກໄຊສ໌ / Size sorting',
  SEWING: 'ຫຍິບ / Sewing',
  QC_PACKING: 'ກວດຄຸນນະພາບ / QC & Packing',
};
export const WORK_STATE_LABELS = {
  NOT_STARTED: 'ຍັງບໍ່ເລີ່ມ / Not started',
  IN_PROGRESS: 'ກຳລັງເຮັດ / In progress',
  COMPLETED: 'ສຳເລັດ / Completed',
};
export type WorkState = keyof typeof WORK_STATE_LABELS;
export const workQuerySchema = z
  .object({
    department: z.enum(WORK_STAGES).optional(),
    state: z.enum(['ACTIVE', 'COMPLETED', 'ALL']).default('ACTIVE'),
    search: z.string().trim().max(100).default(''),
  })
  .strict();
export const workActionSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().positive(),
    sheetRowVersion: z.number().int().positive(),
    stageRowVersion: z.number().int().min(0),
    action: z.enum(['start', 'complete']),
    reason: z.string().trim().max(500).default(''),
  })
  .strict();
export type WorkAction = z.infer<typeof workActionSchema>;
export type WorkStageView = {
  department: WorkStage;
  state: WorkState;
  rowVersion: number;
  blocked?: string;
  startedAt: string | null;
  completedAt: string | null;
  previous: { department: WorkStage; state: WorkState } | null;
};
export type WorkJob = {
  carriedFrom?: { sheetId: string; number: string; version: number; orderRevision: number } | null;
  id: string;
  sheetNumber: string;
  version: number;
  sheetRowVersion: number;
  orderNumber: string;
  customerName: string;
  dueDate: string;
  priority: string;
  quantity: number;
  blocked: string | null;
  previousWork: boolean;
  openIssues: number;
  stages: WorkStageView[];
};
export type WorkQueue = {
  pendingReviews?: { sourceNumber: string; targetSheetId: string }[];
  overview: boolean;
  department: WorkStage | null;
  jobs: WorkJob[];
  hasMore: boolean;
};
export type WorkDetail = {
  job: WorkJob;
  snapshot: SheetSnapshot;
  versions: number[];
  events: {
    id: string;
    department: WorkStage;
    fromState: WorkState;
    toState: WorkState;
    reason: string;
    actorName: string;
    at: string;
  }[];
};
