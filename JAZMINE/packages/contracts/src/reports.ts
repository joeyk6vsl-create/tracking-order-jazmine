import { z } from 'zod';
export const reportQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine(
    (q) => q.from <= q.to && (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 365,
    'ເລືອກຊ່ວງວັນບໍ່ເກີນ 366 ວັນ / Up to 366 days',
  );
export type ReportRow = {
  cancelled: boolean;
  decisionRequired: boolean;
  agreedTotal: string | null;
  id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  total: string;
  received: string;
  refunded: string;
  netPaid: string;
  due: string;
  overpaid: string;
  quantity: number;
};
export type ReportView = {
  pendingCancellations: number;
  historicalPendingCancellations: number;
  from: string;
  to: string;
  orders: number;
  quantity: number;
  sales: string;
  received: string;
  refunded: string;
  netCash: string;
  cohortOutstanding: string;
  outstanding: string;
  historicalOutstanding: string;
  overpaid: string;
  profit: null;
  costStatus: 'INCOMPLETE';
  trend: { date: string; sales: string; received: string; refunded: string }[];
  rows: ReportRow[];
  hasMore: boolean;
};
