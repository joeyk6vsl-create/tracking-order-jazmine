import { z } from 'zod';
export const lifecycleCommandSchema = z
  .object({
    requestId: z.uuid(),
    checkToken: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(1).max(1000),
    reviewed: z.literal(true),
  })
  .strict();
export const cancellationAgreementSchema = lifecycleCommandSchema.extend({
  agreedTotal: z
    .string()
    .regex(/^(0|[1-9]\d{0,15})$/)
    .refine((v) => /^(0|[1-9]\d{0,15})$/.test(v) && BigInt(v) <= 9000000000000000n),
});
export type LifecycleCommand = z.infer<typeof lifecycleCommandSchema>;
export type CancellationAgreement = z.infer<typeof cancellationAgreementSchema>;
export type LifecycleState = {
  business: 'ACTIVE' | 'CANCELLED';
  storage: 'ACTIVE' | 'ARCHIVED';
  version: number;
  cancelledAt: string | null;
  agreedTotal: string | null;
};
export type LifecycleView = {
  state: LifecycleState;
  checkToken: string;
  canManageArchive: boolean;
  canResolveFinance: boolean;
  originalTotal: string;
  netPaid: string;
  refundDue: string | null;
  additionalDue: string | null;
  finance: 'NOT_REQUIRED' | 'DECISION_REQUIRED' | 'ACTION_REQUIRED' | 'CLEAR';
  effects: {
    sheets: number;
    inProgress: number;
    completedStages: number;
    openIssues: number;
    openRequests: number;
    preparedShipments: number;
    confirmedShipments: number;
    shippedQuantity: number;
  };
  productionSheets: { id: string; number: string; state: string; unfinished: boolean }[];
  archive: {
    eligible: boolean;
    reasons: string[];
    eligibleAfter: string | null;
    baseEligible: boolean;
    activityToken: string;
  };
  history: {
    kind: string;
    actorName: string;
    reason: string;
    at: string;
    detail: Record<string, unknown>;
  }[];
};
export const archiveSettingsSchema = z
  .object({
    requestId: z.uuid(),
    rowVersion: z.number().int().min(0),
    enabled: z.boolean(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export type ArchiveSettingsView = {
  enabled: boolean;
  rowVersion: number;
  actorName: string;
  reason: string;
  updatedAt: string;
  lastRunAt: string | null;
  waiting: number;
};
