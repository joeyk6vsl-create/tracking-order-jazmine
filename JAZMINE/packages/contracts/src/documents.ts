import { z } from 'zod';
import type { QuotationView } from './quotations';
import type { ConfirmedOrder } from './confirmation';
import type { PaymentEntry } from './settlement';
import type { SheetSnapshot } from './production';
import type { PaymentQrReference } from './payment-qr';
export const documentKindSchema = z.enum(['QUOTATION', 'INVOICE', 'RECEIPT', 'PRODUCTION']);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export type DocumentCurrentStatus = {
  checkedAt: string;
  primary: 'CURRENT' | 'CANCELLED' | 'VOIDED' | 'SUPERSEDED' | 'UNDER_REVIEW';
  flags: (
    | 'ORDER_CANCELLED'
    | 'ARCHIVED'
    | 'ORDER_REVISION_CHANGED'
    | 'EXPIRED'
    | 'PAYMENT_DETAILS_CHANGED'
  )[];
  reason: string | null;
  latestVersion: number;
};
export const documentRetrySchema = z
  .object({ requestId: z.uuid(), reason: z.string().trim().min(1).max(500) })
  .strict();
export type DocumentSource =
  | { kind: 'QUOTATION'; document: Pick<QuotationView, 'id' | 'number' | 'revision' | 'snapshot'> }
  | {
      kind: 'INVOICE';
      paymentQrs?: PaymentQrReference[];
      document: Pick<
        ConfirmedOrder,
        'id' | 'orderNumber' | 'invoiceNumber' | 'revision' | 'confirmedAt' | 'snapshot'
      >;
    }
  | { kind: 'RECEIPT'; document: PaymentEntry; orderId: string }
  | { kind: 'PRODUCTION'; document: SheetSnapshot; sheetId: string };
export type DocumentRenderPayload = {
  source: DocumentSource;
  origin: string;
  assets: Record<string, { mime: string; base64: string }>;
  templateVersion: 'archive-v1';
};
export type StoredDocument = {
  id: string | null;
  state: 'NOT_PREPARED' | 'RENDER_PENDING' | 'PREPARING' | 'FAILED' | 'ISSUED';
  number: string;
  version: number;
  attempts: number;
  error: string | null;
  sha256: string | null;
  pageCount: number | null;
  byteLength: number | null;
  renderedAt: string | null;
  templateVersion: string;
  language: string;
  notice: string;
};
