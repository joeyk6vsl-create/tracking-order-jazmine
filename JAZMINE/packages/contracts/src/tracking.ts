import { z } from 'zod';
import type { WorkStage } from './production-work';
export const requestKinds = ['GENERAL', 'DELIVERY', 'EXPEDITE'] as const;
export const requestLabels = {
  GENERAL: 'ສອບຖາມ / General',
  DELIVERY: 'ຂໍຈັດສົ່ງ / Delivery',
  EXPEDITE: 'ຂໍເລັ່ງວຽກ / Expedite',
};
export const trackingCommandSchema = z
  .object({ requestId: z.uuid(), reason: z.string().trim().min(1).max(1000) })
  .strict();
export const issueLinkSchema = trackingCommandSchema.extend({
  days: z.number().int().min(1).max(90),
});
export const verifyTrackingSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    phone: z.string().trim().min(1).max(40),
  })
  .strict();
export const invoiceTrackingSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export type InvoiceTrackingLink = { id: string; expiresAt: string };
// รับลิงก์ที่คัดลอกไว้ ไม่ดึงเว็บภายนอกหรือรับลิงก์ของระบบอื่นมาพิมพ์
export function parseCustomerTrackingUrl(raw: string, origin: string) {
  const invalid = () =>
    new Error('ລິງຕ້ອງເປັນຂອງເວັບນີ້ / Paste a customer tracking link from this website');
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw invalid();
  }
  if (
    u.origin !== new URL(origin).origin ||
    u.pathname !== '/' ||
    u.search ||
    u.username ||
    u.password ||
    !/^#track=[A-Za-z0-9_-]{43}$/.test(u.hash)
  )
    throw invalid();
  return { token: u.hash.slice(7), url: u.origin + '/' + u.hash };
}
export const customerRequestSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(requestKinds),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();
export const reviewRequestSchema = trackingCommandSchema
  .extend({
    rowVersion: z.number().int().positive(),
    action: z.enum(['START_REVIEW', 'RESOLVE']),
    outcome: z.enum(['APPROVED', 'REJECTED', 'NO_ACTION']).optional(),
    response: z.string().trim().max(2000),
  })
  .superRefine((v, c) => {
    if (v.action === 'RESOLVE' && (!v.outcome || !v.response))
      c.addIssue({ code: 'custom', message: 'ກະລຸນາລະບຸຜົນ ແລະ ຄຳຕອບລູກຄ້າ' });
  });
export const requestQuerySchema = z
  .object({
    state: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'ALL']).default('SUBMITTED'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type CustomerRequest = {
  id: string;
  kind: (typeof requestKinds)[number];
  message: string;
  state: 'SUBMITTED' | 'UNDER_REVIEW' | 'RESOLVED';
  outcome: 'APPROVED' | 'REJECTED' | 'NO_ACTION' | null;
  response: string;
  rowVersion: number;
  submittedAt: string;
  reviewedAt: string | null;
};
export type LinkView = { id: string; expiresAt: string; revokedAt: string | null } | null;
export type TrackingView = {
  orderState: 'ACTIVE' | 'CANCELLED';
  orderNumber: string;
  customerName: string;
  dueDate: string;
  items: { name: string; size: string; quantity: number }[];
  quantity: number;
  readyQuantity: number;
  confirmedQuantity: number;
  payment: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REVIEW_REQUIRED';
  production: { stage: WorkStage; state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' }[];
  deliveries: {
    method: 'CUSTOMER_PICKUP' | 'SHOP_DELIVERY';
    carrier: string;
    tracking: string;
    confirmedInAdvance: boolean;
    quantity: number;
  }[];
  hasMockup: boolean;
  requests: Omit<CustomerRequest, 'rowVersion'>[];
};
