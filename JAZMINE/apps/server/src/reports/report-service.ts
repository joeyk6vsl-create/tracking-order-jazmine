import type { z } from 'zod';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  reportQuerySchema,
  ReportView,
  ReportRow,
} from '../../../../packages/contracts/src/reports';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { currentReportSql, historicalOutstandingSql } from '../settlements/reporting';
type CurrentReport = {
  totals: { orders: number; sales: string; quantity: string; due: string };
  all_totals: { due: string; overpaid: string; pending: number };
  sales: { date: string; sales: string }[];
  rows: {
    id: string;
    order_number: string;
    customer_name: string;
    date: string;
    total: string;
    received: string;
    refunded: string;
    net_paid: string;
    due: string;
    overpaid: string;
    quantity: number;
    business_state: string;
    decision_required: boolean;
    cancel_agreed_lak: string | null;
  }[];
};
export class ReportService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async read(actor: UserView, q: z.infer<typeof reportQuerySchema>): Promise<ReportView> {
    await this.auth.require(this.db, actor, 'reports.view');
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.auth.require(sql, actor, 'reports.view');
      const current = (
        await sql.query<CurrentReport>(currentReportSql, [q.from, q.to, (q.page - 1) * 25])
      )[0];
      const { totals, all_totals: all, sales, rows } = current;
      const cash = await sql.query(
        "SELECT (occurred_at AT TIME ZONE 'Asia/Vientiane')::date::text AS date,COALESCE(sum(lak_amount) FILTER(WHERE kind='RECEIPT'),0)::text AS received,COALESCE(sum(lak_amount) FILTER(WHERE kind='REFUND'),0)::text AS refunded FROM payment_entries WHERE state='ACTIVE' AND occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Vientiane') AND occurred_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Vientiane') GROUP BY 1 ORDER BY 1",
        [q.from, q.to],
      );
      const historical = (await sql.query(historicalOutstandingSql, [q.to]))[0];
      const dates = [...new Set([...cash, ...sales].map((r) => String(r.date)))].sort();
      const received = cash.reduce((n, r) => n + BigInt(String(r.received)), 0n),
        refunded = cash.reduce((n, r) => n + BigInt(String(r.refunded)), 0n);
      return {
        pendingCancellations: Number(all.pending),
        historicalPendingCancellations: Number(historical.pending),
        from: q.from,
        to: q.to,
        orders: Number(totals.orders),
        quantity: Number(totals.quantity),
        sales: String(totals.sales),
        received: String(received),
        refunded: String(refunded),
        netCash: String(received - refunded),
        cohortOutstanding: String(totals.due),
        outstanding: String(all.due),
        historicalOutstanding: String(historical.due),
        overpaid: String(all.overpaid),
        profit: null,
        costStatus: 'INCOMPLETE',
        trend: dates.map((date) => ({
          date,
          sales: String(sales.find((r) => r.date === date)?.sales ?? '0'),
          received: String(cash.find((r) => r.date === date)?.received ?? '0'),
          refunded: String(cash.find((r) => r.date === date)?.refunded ?? '0'),
        })),
        rows: rows.slice(0, 25).map(
          (r) =>
            ({
              cancelled: r.business_state === 'CANCELLED',
              decisionRequired: r.decision_required,
              agreedTotal: r.cancel_agreed_lak,
              id: String(r.id),
              orderNumber: String(r.order_number),
              customerName: String(r.customer_name),
              date: String(r.date),
              total: String(r.total),
              received: String(r.received),
              refunded: String(r.refunded),
              netPaid: String(r.net_paid),
              due: String(r.due),
              overpaid: String(r.overpaid),
              quantity: Number(r.quantity),
            }) satisfies ReportRow,
        ),
        hasMore: rows.length > 25,
      };
    });
  }
}
