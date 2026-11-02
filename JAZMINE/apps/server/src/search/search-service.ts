import { z } from 'zod';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  searchQuerySchema,
  SearchView,
  SearchResult,
} from '../../../../packages/contracts/src/search';
import { normalizePhone } from '../../../../packages/contracts/src/customers';
import { WORK_STAGES } from '../../../../packages/contracts/src/production-work';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
const cursorSchema = z.object({ rank: z.number().int().min(1).max(8), id: z.uuid() }).strict();
export class SearchService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async read(actor: UserView, q: z.infer<typeof searchQuerySchema>): Promise<SearchView> {
    const permission =
      actor.role === 'ADMIN_PROMAX' || actor.department === 'ADMIN'
        ? 'orders.manage'
        : actor.department === 'GRAPHIC'
          ? 'graphic.approve'
          : 'production.own';
    const fresh = await this.auth.require(this.db, actor, permission),
      commercial = permission === 'orders.manage',
      graphic = permission === 'graphic.approve';
    if (!commercial && !graphic && !(WORK_STAGES as readonly string[]).includes(fresh.department))
      throw new AppError('PERMISSION_DENIED', 'ບໍ່ມີສິດ / Access denied', 403);
    let after = { rank: 0, id: '00000000-0000-0000-0000-000000000000' };
    if (q.cursor) {
      try {
        after = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')));
      } catch {
        throw new AppError('INVALID_CURSOR', 'ກະລຸນາຄົ້ນຫາໃໝ່ / Search again', 400);
      }
    }
    const pattern = q.q.toLowerCase().replace(/[!%_]/g, (c) => '!' + c) + '%',
      phone = normalizePhone(q.q);
    const parts: string[] = [];
    if (commercial) {
      parts.push(
        "SELECT 8,r.id,'QUOTATION',q.number||' · Rev '||r.revision,r.snapshot->'input'->>'customerName',r.id FROM quotations q JOIN quotation_revisions r ON r.quotation_id=q.id AND r.revision=q.latest_revision WHERE lower(q.number) LIKE $1 ESCAPE '!' OR lower(r.snapshot->'input'->>'customerName') LIKE $1 ESCAPE '!' OR ($2<>'' AND regexp_replace(translate(r.snapshot->'input'->>'phone','໐໑໒໓໔໕໖໗໘໙','0123456789'),'[^0-9]','','g') LIKE $2||'%')",
      );
      parts.push(
        "SELECT 1 AS rank,c.id,'CUSTOMER' AS kind,c.name AS reference,c.name AS label,c.id AS target FROM customers c WHERE lower(c.name) LIKE $1 ESCAPE '!' OR ($2<>'' AND c.normalized_phone LIKE $2||'%')",
      );
      const match =
        "(lower(o.order_number) LIKE $1 ESCAPE '!' OR lower(r.snapshot->'input'->>'customerName') LIKE $1 ESCAPE '!' OR ($2<>'' AND regexp_replace(translate(r.snapshot->'input'->>'phone','໐໑໒໓໔໕໖໗໘໙','0123456789'),'[^0-9]','','g') LIKE $2||'%'))";
      parts.push(
        `SELECT 2,o.id,'ORDER',o.order_number,r.snapshot->'input'->>'customerName',o.id FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE ${match}`,
      );
      parts.push(
        "SELECT 3,o.id,'INVOICE',o.invoice_number,r.snapshot->'input'->>'customerName',o.id FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE lower(o.invoice_number) LIKE $1 ESCAPE '!'",
      );
      parts.push(
        "SELECT CASE WHEN p.kind='RECEIPT' THEN 5 ELSE 6 END,p.id,p.kind,p.number,p.state,p.order_id FROM payment_entries p WHERE lower(p.number) LIKE $1 ESCAPE '!'",
      );
      parts.push(
        "SELECT 7,s.id,'SHIPMENT',s.number,s.state||CASE WHEN s.tracking<>'' THEN ' · '||s.tracking ELSE '' END,s.order_id FROM shipments s WHERE lower(s.number) LIKE $1 ESCAPE '!' OR lower(s.tracking) LIKE $1 ESCAPE '!'",
      );
    }
    parts.push(
      `SELECT 4,s.id,'PRODUCTION',COALESCE(s.sheet_number,'Draft PS'),o.order_number,s.id FROM production_sheets s JOIN orders o ON o.id=s.order_id WHERE (lower(s.sheet_number) LIKE $1 ESCAPE '!' OR lower(o.order_number) LIKE $1 ESCAPE '!') ${commercial || graphic ? '' : "AND s.issued_version>0 AND (s.state<>'CANCELLED' OR EXISTS(SELECT 1 FROM production_issues i WHERE i.sheet_id=s.id AND i.department=$5 AND i.state='OPEN'))"}`,
    );
    // สร้างเฉพาะชนิดผลลัพธ์ที่ผู้ใช้มีสิทธิ์ ไม่ส่งยอดรวมของชนิดที่ถูกซ่อน
    const rows = await this.db.query(
      `WITH found(rank,id,kind,reference,label,target) AS (${parts.join(' UNION ALL ')}) SELECT * FROM found WHERE $2::text IS NOT NULL AND (rank>$3 OR (rank=$3 AND id>$4::uuid)) ORDER BY rank,id LIMIT 26`,
      commercial || graphic
        ? [pattern, phone, after.rank, after.id]
        : [pattern, phone, after.rank, after.id, fresh.department],
    );
    const visible = rows.slice(0, 25),
      last = visible.at(-1);
    return {
      results: visible.map((r) => {
        const kind = r.kind as SearchResult['kind'],
          target = String(r.target),
          id = String(r.id);
        const href =
          kind === 'QUOTATION'
            ? `?quotation=${target}`
            : kind === 'CUSTOMER'
              ? `?customerId=${target}`
              : kind === 'PRODUCTION'
                ? `${graphic || r.reference === 'Draft PS' ? '?prepareSheet=' : '?productionWork='}${target}`
                : kind === 'ORDER' || kind === 'INVOICE'
                  ? `?confirmedOrder=${target}`
                  : `?settlementOrder=${target}${kind === 'RECEIPT' ? '&paymentEntry=' + id : ''}`;
        return { id, kind, reference: String(r.reference), label: String(r.label), href };
      }),
      nextCursor:
        rows.length > 25 && last
          ? Buffer.from(JSON.stringify({ rank: Number(last.rank), id: last.id })).toString(
              'base64url',
            )
          : null,
    };
  }
}
