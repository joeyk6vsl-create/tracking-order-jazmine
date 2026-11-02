import { z } from 'zod';
export const CURRENCIES = ['LAK', 'THB', 'USD'] as const;
export const MONEY_METHODS = ['CASH', 'TRANSFER'] as const;
export const MONEY_LABELS = { CASH: 'ເງິນສົດ / Cash', TRANSFER: 'ເງິນໂອນ / Transfer' };
const amount = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, 'ກອກເງິນເປັນຕົວເລກ ບໍ່ເກີນ 2 ຕຳແໜ່ງ')
  .refine((s) => /[1-9]/.test(s), 'ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0');
export const settlementActionSchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.number().int().min(0),
    orderRevision: z.number().int().positive(),
    reason: z.string().trim().min(1, 'ກະລຸນາໃສ່ເຫດຜົນ').max(1000),
  })
  .strict();
export const receiptSchema = settlementActionSchema
  .extend({
    purpose: z.enum(['DEPOSIT', 'PAYMENT']),
    currency: z.enum(CURRENCIES),
    amount,
    method: z.enum(MONEY_METHODS),
    reference: z.string().trim().max(200),
    occurredAt: z.iso.datetime({ offset: true }),
    rateRevision: z.number().int().positive(),
    replaceReceiptId: z.uuid().optional(),
  })
  .refine(
    (r) => r.currency !== 'LAK' || !r.amount.includes('.') || /^0*$/.test(r.amount.split('.')[1]),
    'LAK ໃຊ້ຈຳນວນເຕັມກີບ',
  );
export const refundSchema = settlementActionSchema.extend({
  receiptId: z.uuid(),
  amount,
  method: z.enum(MONEY_METHODS),
  reference: z.string().trim().max(200),
  occurredAt: z.iso.datetime({ offset: true }),
});
export const shipmentPrepareSchema = settlementActionSchema.extend({
  method: z.enum(['CUSTOMER_PICKUP', 'SHOP_DELIVERY']),
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(1000),
  carrier: z.string().trim().max(120),
  tracking: z.string().trim().max(200),
  notes: z.string().trim().max(1000),
  items: z
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
    .refine((a) => new Set(a.map((r) => r.lineIndex)).size === a.length, 'ລາຍການຊ້ຳ'),
});
export const shipmentConfirmSchema = settlementActionSchema.extend({ confirmedEarly: z.boolean() });
export const shipmentMetadataSchema = settlementActionSchema.extend({
  carrier: z.string().trim().max(120),
  tracking: z.string().trim().max(200),
  notes: z.string().trim().max(1000),
});
export type SettlementAction = z.infer<typeof settlementActionSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type ShipmentInput = z.infer<typeof shipmentPrepareSchema>;
export type ShipmentConfirm = z.infer<typeof shipmentConfirmSchema>;
export type ShipmentMetadata = z.infer<typeof shipmentMetadataSchema>;
export type PaymentEntry = {
  id: string;
  number: string;
  kind: 'RECEIPT' | 'REFUND';
  purpose: 'DEPOSIT' | 'PAYMENT' | 'REFUND';
  state: 'ACTIVE' | 'VOIDED';
  receiptId: string | null;
  correctsId: string | null;
  currency: (typeof CURRENCIES)[number];
  amount: string;
  lakAmount: string;
  exchangeRate: string;
  method: (typeof MONEY_METHODS)[number];
  reference: string;
  occurredAt: string;
  recordedAt: string;
  actorName: string;
  reason: string;
  voidReason: string | null;
  refundable: string;
  snapshot: {
    orderNumber: string;
    invoiceNumber: string;
    customerName: string;
    phone: string;
    orderRevision: number;
  };
};
export type MoneySummary = {
  total: string;
  received: string;
  refunded: string;
  netPaid: string;
  due: string;
  overpaid: string;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';
  resolutionRequired: boolean;
};
export type DeliveryLine = {
  lineIndex: number;
  key: string;
  name: string;
  size: string;
  quantity: number;
  shipped: number;
  prepared: number;
  ready: number;
  available: number;
  prepareAvailable: number;
};
export type ShipmentView = {
  updates: {
    at: string;
    actorName: string;
    reason: string;
    before: { carrier: string; tracking: string; notes: string };
    after: { carrier: string; tracking: string; notes: string };
  }[];
  id: string;
  number: string;
  orderRevision: number;
  state: 'PREPARED' | 'CONFIRMED' | 'CANCELLED';
  method: 'CUSTOMER_PICKUP' | 'SHOP_DELIVERY';
  recipient: string;
  phone: string;
  address: string;
  carrier: string;
  tracking: string;
  notes: string;
  preparedName: string;
  preparedAt: string;
  confirmedName: string | null;
  confirmedAt: string | null;
  confirmedEarly: boolean | null;
  cancelReason: string | null;
  items: { lineIndex: number; quantity: number; name: string; size: string }[];
};
export type SettlementView = {
  lifecycle: import('./order-lifecycle').LifecycleState;
  orderId: string;
  orderNumber: string;
  invoiceNumber: string;
  customerName: string;
  phone: string;
  revision: number;
  version: number;
  canRefund: boolean;
  rates: { revision: number; THB: string | null; USD: string | null };
  money: MoneySummary;
  payments: PaymentEntry[];
  shipments: ShipmentView[];
  delivery: {
    status: 'NOT_SHIPPED' | 'PARTIALLY_SHIPPED' | 'COMPLETED';
    orderStatus: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    reviewRequired: boolean;
    unmatchedQuantity: number;
    excessQuantity: number;
    readyQuantity: number;
    shippedQuantity: number;
    lines: DeliveryLine[];
  };
};
