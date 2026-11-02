import { z } from 'zod';
export const ASSET_KINDS = ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const;
export const ASSET_LABELS = { NECK_LABEL: 'ป้ายคอ', NECK_TAPE: 'เทปคอ', MOCKUP: 'แบบตัวอย่าง' };
export const uploadAssetSchema = z
  .object({
    draftId: z.uuid(),
    kind: z.enum(ASSET_KINDS),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^/\\]+$/, 'ชื่อไฟล์ไม่ถูกต้อง')
      .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32), 'ชื่อไฟล์มีอักขระที่ใช้ไม่ได้'),
    base64: z.string().min(4).max(2800000),
  })
  .strict();
export const reviewAssetSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(1, 'ใส่เหตุผลการตรวจไฟล์').max(500),
  })
  .strict();
export type UploadAsset = z.infer<typeof uploadAssetSchema>;
export type AssetView = {
  id: string;
  kind: (typeof ASSET_KINDS)[number];
  revision: number;
  filename: string;
  mime: string;
  byteSize: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewReason: string | null;
  draftVersion: number;
  scopeKey: string;
  stale?: boolean;
};
export type AssetChecklist = {
  assets: AssetView[];
  missing: string[];
  ready: boolean;
  draftVersion: number;
};
export type GraphicQueueItem = {
  id: string;
  rowVersion: number;
  customerName: string;
  brandingType: string | null;
};
