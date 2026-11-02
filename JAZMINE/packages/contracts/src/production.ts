import { z } from 'zod';
import type { AssetView } from './assets';
export const PARTS = [
  'BODY',
  'BODY_BACK',
  'COLLAR',
  'COLLAR_STAND',
  'COLLAR_PLACKET',
  'SLEEVE_LEFT',
  'SLEEVE_RIGHT',
  'CUFF_LEFT',
  'CUFF_RIGHT',
  'SHOULDER',
] as const;
export const PART_LABELS = {
  BODY: 'ตัวเสื้อด้านหน้า',
  BODY_BACK: 'ตัวเสื้อด้านหลัง',
  COLLAR: 'คอเสื้อ',
  COLLAR_STAND: 'คอน้อย (ถ้ามี)',
  COLLAR_PLACKET: 'สาบหรือลิ้น (ถ้ามี)',
  SLEEVE_LEFT: 'แขนซ้าย',
  SLEEVE_RIGHT: 'แขนขวา',
  CUFF_LEFT: 'ปลายแขนซ้าย',
  CUFF_RIGHT: 'ปลายแขนขวา',
  SHOULDER: 'บ่าเสื้อ',
};
export const OPTIONAL_PARTS = ['COLLAR_STAND', 'COLLAR_PLACKET'] as const;
export const printDetailsSchema = z
  .object({
    priority: z.enum(['UNSPECIFIED', 'NORMAL', 'URGENT']).default('UNSPECIFIED'),
    names: z
      .array(
        z
          .object({
            lineIndex: z.number().int().min(0).max(29),
            name: z.string().trim().max(80),
            number: z.string().trim().max(20),
          })
          .strict()
          .refine((r) => !!(r.name || r.number), 'ใส่ชื่อหรือเบอร์อย่างน้อยหนึ่งช่อง'),
      )
      .max(2000)
      .default([]),
  })
  .strict();
export const sheetSchema = z
  .object({
    orderId: z.uuid(),
    orderRevision: z.number().int().positive(),
    rowVersion: z.number().int().min(0),
    allocations: z
      .array(
        z
          .object({
            lineIndex: z.number().int().min(0).max(29),
            quantity: z.number().int().min(1).max(300000),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .refine((a) => new Set(a.map((x) => x.lineIndex)).size === a.length, 'รายการจัดจำนวนซ้ำกัน'),
    notes: z.string().trim().max(2000),
    printDetails: printDetailsSchema.default({ priority: 'UNSPECIFIED', names: [] }),
    reason: z.string().trim().min(1, 'ใส่เหตุผลก่อนบันทึก').max(500),
  })
  .strict();
export const partFileSchema = z
  .object({
    part: z.enum(PARTS),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^/\\]+$/)
      .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32)),
    base64: z.string().min(4).max(2800000),
  })
  .strict();
export const sheetActionSchema = z
  .object({ rowVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
  .strict();
export type SheetInput = z.infer<typeof sheetSchema>;
export type ProductionContext = {
  orderId: string;
  orderNumber: string;
  revision: number;
  customerName: string;
  dueDate: string;
  confirmedAt?: string;
  brandingType: string | null;
  assets: AssetView[];
  selections: { id: string; name: string; kind: string; source_key: string | null }[];
  lines: {
    lineIndex: number;
    productId: string;
    fabricId: string;
    size: string;
    quantity: number;
    parts: { componentId: string; fabricId?: string }[];
  }[];
};
export type SheetView = {
  id: string;
  orderId: string;
  orderRevision: number;
  sheetNumber: string | null;
  state: 'DRAFT' | 'READY' | 'CANCELLED';
  rowVersion: number;
  issuedVersion: number;
  allocations: SheetInput['allocations'];
  notes: string;
  printDetails: z.infer<typeof printDetailsSchema>;
};
export type PartFile = {
  id: string;
  part: (typeof PARTS)[number];
  revision: number;
  filename: string;
  mime: string;
};
export type SheetDetail = {
  pendingInheritance?: { sourceSheetId: string; sourceNumber: string; sourceVersion: number };
  hasWork?: boolean;
  sheet: SheetView;
  context: ProductionContext;
  files: PartFile[];
  requiredParts: (typeof PARTS)[number][];
  stale: boolean;
  versions: { version: number; issuedAt: string }[];
};
export type SheetSnapshot = {
  continuedFrom?: {
    sheetId: string;
    number: string;
    version: number;
    orderRevision: number;
    reviewId: string;
  };
  context: ProductionContext;
  allocations: SheetInput['allocations'];
  notes: string;
  printDetails?: z.infer<typeof printDetailsSchema>;
  files: PartFile[];
  sheetNumber?: string;
  version?: number;
  issuedAt?: string;
  createdBy?: string;
  createdAt?: string | null;
};
export type SheetHistory = {
  state: SheetView['state'];
  currentVersion: number;
  stale: boolean;
  versions: { version: number; issuedAt: string; snapshot: SheetSnapshot }[];
};
