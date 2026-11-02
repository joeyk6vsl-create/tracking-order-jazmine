import { z } from 'zod';
export const searchQuerySchema = z
  .object({ q: z.string().trim().min(2).max(100), cursor: z.string().max(300).optional() })
  .strict();
export type SearchResult = {
  id: string;
  kind:
    | 'CUSTOMER'
    | 'ORDER'
    | 'INVOICE'
    | 'PRODUCTION'
    | 'RECEIPT'
    | 'REFUND'
    | 'SHIPMENT'
    | 'QUOTATION';
  reference: string;
  label: string;
  href: string;
};
export type SearchView = { results: SearchResult[]; nextCursor: string | null };
