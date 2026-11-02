import { z } from 'zod';

export const CUSTOMER_GROUPS = [
  'RETAIL',
  'AGENT_LEVEL_1',
  'AGENT_LEVEL_2',
  'AGENT_LEVEL_3',
  'AGENT_LEVEL_4',
  'AGENT_LEVEL_5',
] as const;
export const BRANDING_TYPES = ['JAZMINE_STANDARD', 'CUSTOM_AGENT'] as const;
export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export function normalizePhone(value: string): string {
  return value
    .replace(/[໐-໙]/g, (digit) => String(digit.charCodeAt(0) - 0x0ed0))
    .replace(/\D/g, '');
}
export function businessDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
const phoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[+0-9໐-໙\s().-]+$/, 'กรุณากรอกเบอร์โทรที่ถูกต้อง')
  .refine(
    (value) => normalizePhone(value).length >= 6 && normalizePhone(value).length <= 20,
    'เบอร์โทรต้องมีตัวเลข 6–20 หลัก',
  );
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'วันที่ไม่ถูกต้อง');
export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    phone: phoneSchema,
    group: z.enum(CUSTOMER_GROUPS),
    brandingType: z.enum(BRANDING_TYPES),
    customerSince: dateSchema,
    notes: z.string().trim().max(2000).default(''),
  })
  .strict();
export const updateCustomerSchema = createCustomerSchema.extend({
  status: z.enum(CUSTOMER_STATUSES),
  rowVersion: z.string().regex(/^\d+$/),
});
export const customerListSchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const phoneMatchesSchema = z
  .object({ phone: phoneSchema, excludeId: z.uuid().optional() })
  .strict();
export interface CustomerView {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  group: (typeof CUSTOMER_GROUPS)[number];
  brandingType: (typeof BRANDING_TYPES)[number];
  customerSince: string;
  notes: string;
  status: (typeof CUSTOMER_STATUSES)[number];
  rowVersion: string;
  createdAt: string;
  updatedAt: string;
}
export interface CustomerList {
  customers: CustomerView[];
  nextCursor: string | null;
}
export type CustomerInput = z.infer<typeof createCustomerSchema>;
export type CustomerUpdate = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerListSchema>;
export interface CustomerResult {
  customer: CustomerView;
  phoneMatches: CustomerView[];
}
