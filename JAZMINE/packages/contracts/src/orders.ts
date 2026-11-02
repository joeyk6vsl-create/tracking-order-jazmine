import { z } from 'zod';
import { quoteSchema, quoteFieldsSchema, type QuoteResult, type PricingQuote } from './pricing';
import { normalizePhone } from './customers';
export const draftSchema = z
  .object({
    rowVersion: z.number().int().min(0),
    reason: z.string().trim().min(1).max(500),
    customerId: z.uuid().nullable().default(null),
    customerName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .min(6)
      .max(40)
      .refine((p) => normalizePhone(p).length >= 6, 'กรอกเบอร์อย่างน้อย 6 หลัก'),
    quote: quoteFieldsSchema,
    lines: z.array(quoteSchema).max(30).default([]),
    brandingType: z.enum(['JAZMINE_STANDARD', 'CUSTOM_AGENT']).nullable().default(null),
    assetNotes: z.string().trim().max(2000).default(''),
  })
  .strict()
  .refine(
    (d) => d.lines.length > 0 || d.quote.quantity + d.quote.freeQuantity > 0,
    'ອໍເດີຕ້ອງມີສິນຄ້າ / Order must contain purchased or gift units',
  );
export type DraftInput = z.infer<typeof draftSchema>;
export type DraftView = {
  id: string;
  rowVersion: number;
  input: DraftInput;
  pricing: QuoteResult & { linePricing?: QuoteResult[] };
  selections: { id: string; name: string; kind: string }[];
};
export type DraftQuote = PricingQuote;
