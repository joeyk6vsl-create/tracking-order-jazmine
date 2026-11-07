import { z } from 'zod';
export const ASSET_KINDS = ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const;
export const ASSET_LABELS = { NECK_LABEL: 'ป้ายคอ', NECK_TAPE: 'เทปคอ', MOCKUP: 'แบบตัวอย่าง' };
export const BRAND_ASSET_KINDS = ['NECK_LABEL', 'NECK_TAPE'] as const;
const assetFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^/\\]+$/, 'ชื่อไฟล์ไม่ถูกต้อง')
  .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32), 'ชื่อไฟล์มีอักขระที่ใช้ไม่ได้');
const assetBase64Schema = z.string().min(4).max(2800000);
export const uploadAssetSchema = z
  .object({
    draftId: z.uuid(),
    kind: z.enum(ASSET_KINDS),
    filename: assetFilenameSchema,
    base64: assetBase64Schema,
  })
  .strict();
export const uploadBrandAssetSchema = z
  .object({
    kind: z.enum(BRAND_ASSET_KINDS),
    filename: assetFilenameSchema,
    base64: assetBase64Schema,
  })
  .strict();
export const reviewAssetSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(1, 'ใส่เหตุผลการตรวจไฟล์').max(500),
  })
  .strict();
export type UploadAsset = z.infer<typeof uploadAssetSchema>;
export type UploadBrandAsset = z.infer<typeof uploadBrandAssetSchema>;
export type AssetView = {
  id: string;
  kind: (typeof ASSET_KINDS)[number];
  revision: number;
  filename: string;
  mime: string;
  byteSize: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewReason: string | null;
  draftVersion: number | null;
  scopeKey: string;
  stale?: boolean;
};
export type AssetChecklist = {
  assets: AssetView[];
  missing: string[];
  ready: boolean;
  draftVersion: number;
  labelSource: 'JAZMINE' | 'CUSTOMER' | 'DRAFT' | 'UNSET';
};
export type BrandAssetLibraryView = {
  assets: AssetView[];
  missing: string[];
  ready: boolean;
};
export type GraphicQueueItem = {
  id: string;
  rowVersion: number;
  customerName: string;
  brandingType: string | null;
};
