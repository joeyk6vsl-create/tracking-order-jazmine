import { z } from 'zod';
import { CUSTOMER_GROUPS } from './customers';
export const PRICE_GROUPS = ['A', 'B', 'C', 'D'] as const;
export const SIZES = [
  'JS',
  'JM',
  'JL',
  'JXL',
  'J2XL',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
  '7XL',
  '8XL',
  '9XL',
  '10XL',
] as const;
const amount = z.number().int().min(0).max(100_000_000);
export const pricingConfigSchema = z
  .object({
    base: z.record(z.enum(CUSTOMER_GROUPS), z.array(amount).length(4)),
    size: z.record(z.enum(CUSTOMER_GROUPS), z.record(z.enum(SIZES), amount)),
    collar: z.record(z.string(), z.enum(PRICE_GROUPS)),
    adjustments: z.record(z.uuid(), amount),
    buyGet: z
      .object({ buy: z.number().int().min(1).max(10000), get: z.number().int().min(1).max(10000) })
      .strict()
      .nullable()
      .default(null),
    components: z.record(z.uuid(), amount).default({}),
    partFabric: z
      .record(
        z.uuid(),
        z.object({ enabled: z.boolean(), rates: z.record(z.uuid(), amount) }).strict(),
      )
      .default({}),
    fx: z
      .record(
        z.enum(['THB', 'USD']),
        z
          .string()
          .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,10})?$/)
          .refine((s) => /[1-9]/.test(s), 'อัตราต้องมากกว่า 0')
          .nullable(),
      )
      .default({ THB: null, USD: null }),
  })
  .strict();
export type PricingConfig = z.infer<typeof pricingConfigSchema>;
export const pricingSaveSchema = z
  .object({
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
    config: pricingConfigSchema,
  })
  .strict();
// ส่วนหัวร่างใช้โครงสร้างนี้ร่วมกัน; ตรวจว่ามีสินค้าจริงที่รายการหรือร่างทั้งใบอีกชั้น
export const quoteFieldsSchema = z
  .object({
    productId: z.uuid(),
    fabricId: z.uuid(),
    size: z.enum(SIZES),
    group: z.enum(CUSTOMER_GROUPS),
    quantity: z.number().int().min(0).max(10000),
    freeQuantity: z.number().int().min(0).max(10000).default(0),
    applyBuyGet: z.boolean().default(false),
    percent: z
      .number()
      .min(0)
      .max(1000000)
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
        'กรอกเปอร์เซ็นต์ได้ไม่เกิน 2 ตำแหน่ง',
      )
      .default(0),
    fixed: amount.default(0),
    parts: z
      .array(z.object({ componentId: z.uuid(), fabricId: z.uuid().optional() }).strict())
      .max(10)
      .refine(
        (parts) => new Set(parts.map((p) => p.componentId)).size === parts.length,
        'ส่วนประกอบซ้ำกัน',
      )
      .default([]),
    currency: z.enum(['LAK', 'THB', 'USD']).default('LAK'),
  })
  .strict();
export const quoteSchema = quoteFieldsSchema.refine(
  (q) => q.quantity + q.freeQuantity > 0,
  'ຕ້ອງມີຈຳນວນຊື້ ຫຼືແຖມ / Enter a purchased or gift quantity',
);
export type PricingQuote = z.infer<typeof quoteSchema>;
export type PricingView = { revision: number; config: PricingConfig; source: string };
export type QuoteResult = {
  revision: number;
  ready: boolean;
  missing: string[];
  currency: 'LAK';
  base: number;
  sizeExtra: number;
  fabricExtra: number | null;
  unit: number | null;
  subtotal: number | null;
  total: number | null;
  quantity: number;
  freeQuantity: number;
  productionQuantity: number;
  percent: number;
  fixed: number;
  componentExtra: number | null;
  partFabricExtra: number | null;
  displayCurrency: 'LAK' | 'THB' | 'USD';
  convertedTotal: string | null;
  exchangeRate: string | null;
  automaticFreeQuantity: number;
};
