import { z } from 'zod';
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const backupPasswordSchema = z
  .string()
  .min(12, 'ລະຫັດສຳຮອງຢ່າງໜ້ອຍ 12 ຕົວ / At least 12 characters')
  .max(128);
export const backupSchema = z
  .object({ password: backupPasswordSchema, reason: z.string().trim().min(1).max(1000) })
  .strict();
export type TableInventory = { table: string; rows: string; sha256: string };
export type RecoveryReport = {
  id: string;
  createdAt: string;
  backupCreatedAt: string;
  archiveSha256: string;
  operatorId: string;
  reason: string;
  folder: string;
  verifiedTables: TableInventory[];
  invalidatedSessions: number;
  revokedLinks: number;
  appliedMigrations: string[];
  state: 'VERIFIED_COPY';
};
export type BackupStatus = {
  available: boolean;
  maxFileBytes: number;
  busy: boolean;
  mode: 'LOCAL' | 'EXTERNAL_DATABASE';
  history: {
    action: string;
    at: string;
    reason: string;
    detail: { filename?: string; sha256?: string; recoveryId?: string };
  }[];
};
