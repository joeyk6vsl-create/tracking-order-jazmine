import type { z } from 'zod';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  customerRequestSchema,
  reviewRequestSchema,
  requestQuerySchema,
} from '../../../../packages/contracts/src/tracking';
import { Database } from '../database';
import { AppError } from '../errors';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { TrackingLinkService } from './link-service';
import { TrackingCommands, hash, requestView } from './commands';
import { assertOrderOperational, restoreForActivity } from '../orders/order-lifecycle-guard';
export class CustomerRequestService {
  private links: TrackingLinkService;
  private commands: TrackingCommands;
  private auth = new ActorAuthorization();
  constructor(private db: Database) {
    this.links = new TrackingLinkService(db);
    this.commands = new TrackingCommands(db);
  }
  submit(
    session: string | undefined,
    token: string | undefined,
    input: z.infer<typeof customerRequestSchema>,
  ) {
    return this.db.transaction(async (sql) => {
      const order = await this.links.authorized(sql, session, token, true);
      // ล็อกออเดอร์เพื่อให้การส่งพร้อมกันไม่ข้ามจำนวนคำขอที่อนุญาต
      await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [order.id]);
      const fingerprint = hash(JSON.stringify({ orderId: order.id, ...input })),
        old = (
          await sql.query('SELECT * FROM customer_requests WHERE id=$1', [input.requestId])
        )[0];
      if (old) {
        if (old.request_hash !== fingerprint)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າຕ່າງກັນ', 409);
        return { ok: true, id: input.requestId };
      }
      if (input.kind !== 'GENERAL') await assertOrderOperational(sql, order.id);
      const count = (
        await sql.query(
          "SELECT count(*)::int AS n FROM customer_requests WHERE order_id=$1 AND submitted_at>now()-interval '30 minutes'",
          [order.id],
        )
      )[0];
      if (Number(count.n) >= 10)
        throw new AppError('REQUEST_LIMIT', 'ສົ່ງຄຳຂໍຫຼາຍແລ້ວ ກະລຸນາລໍຖ້າ / Please wait', 429);
      await sql.query(
        'INSERT INTO customer_requests(id,order_id,kind,message,request_hash) VALUES($1,$2,$3,$4,$5)',
        [input.requestId, order.id, input.kind, input.message, fingerprint],
      );
      await recordAudit(sql, null, 'CUSTOMER_REQUEST_SUBMITTED', order.id, undefined, {
        requestId: input.requestId,
        kind: input.kind,
      });
      await restoreForActivity(
        sql,
        { id: null, displayName: 'Customer request' },
        order.id,
        'ມີຄຳຂໍລູກຄ້າໃໝ່ / New customer request',
      );
      return { ok: true, id: input.requestId };
    });
  }
  async list(actor: UserView, query: z.infer<typeof requestQuerySchema>) {
    await this.auth.require(this.db, actor, 'orders.manage');
    const rows = await this.db.query(
      "SELECT r.*,o.order_number FROM customer_requests r JOIN orders o ON o.id=r.order_id WHERE ($1='ALL' OR r.state=$1) ORDER BY r.submitted_at DESC,r.id DESC LIMIT 26 OFFSET $2",
      [query.state, (query.page - 1) * 25],
    );
    return {
      requests: rows.slice(0, 25).map((r) => ({
        ...requestView(r),
        orderId: String(r.order_id),
        orderNumber: String(r.order_number),
      })),
      hasMore: rows.length > 25,
    };
  }
  async review(actor: UserView, id: string, input: z.infer<typeof reviewRequestSchema>) {
    await this.auth.require(this.db, actor, 'orders.manage');
    const row = (
      await this.db.query('SELECT order_id FROM customer_requests WHERE id=$1', [id])
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບຄຳຂໍ', 404);
    return this.commands.run(
      actor,
      String(row.order_id),
      'review:' + id,
      input,
      async (sql, fresh) => {
        const current = (
          await sql.query('SELECT * FROM customer_requests WHERE id=$1 FOR UPDATE', [id])
        )[0];
        if (Number(current.row_version) !== input.rowVersion)
          throw new AppError('STALE_STATE', 'ຄຳຂໍປ່ຽນແລ້ວ ກະລຸນາ Refresh', 409);
        if (
          (input.action === 'START_REVIEW' && current.state !== 'SUBMITTED') ||
          (input.action === 'RESOLVE' && current.state !== 'UNDER_REVIEW')
        )
          throw new AppError('REQUEST_STATE', 'ສະຖານະຄຳຂໍບໍ່ຖືກຕ້ອງ', 409);
        const state = input.action === 'START_REVIEW' ? 'UNDER_REVIEW' : 'RESOLVED';
        await sql.query(
          'UPDATE customer_requests SET state=$2,outcome=$3,response=$4,row_version=row_version+1,reviewed_at=now(),reviewed_by=$5 WHERE id=$1',
          [id, state, state === 'RESOLVED' ? input.outcome : null, input.response, fresh.id],
        );
        await recordAudit(
          sql,
          fresh.id,
          'CUSTOMER_REQUEST_REVIEWED',
          String(row.order_id),
          input.reason,
          { requestId: id, state, outcome: input.outcome ?? null, response: input.response },
        );
        return { ok: true, id };
      },
    );
  }
}
