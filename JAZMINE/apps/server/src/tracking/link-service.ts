import { randomBytes, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';
import type { UserView } from '../../../../packages/contracts/src/identity';
import { normalizePhone } from '../../../../packages/contracts/src/customers';
import type {
  issueLinkSchema,
  trackingCommandSchema,
  verifyTrackingSchema,
  LinkView,
  InvoiceTrackingLink,
} from '../../../../packages/contracts/src/tracking';
import { Database, type Sql } from '../database';
import { AppError } from '../errors';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { readOrder } from '../settlements/ledger';
import { TrackingCommands, hash } from './commands';
export class TrackingLinkService {
  private commands: TrackingCommands;
  private auth = new ActorAuthorization();
  constructor(private db: Database) {
    this.commands = new TrackingCommands(db);
  }
  async status(actor: UserView, orderId: string): Promise<{ link: LinkView }> {
    await this.auth.require(this.db, actor, 'orders.manage');
    const row = (
      await this.db.query(
        'SELECT id,expires_at,revoked_at FROM tracking_links WHERE order_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
        [orderId],
      )
    )[0];
    return {
      link: row
        ? {
            id: String(row.id),
            expiresAt: new Date(row.expires_at as string).toISOString(),
            revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null,
          }
        : null,
    };
  }
  async invoice(actor: UserView, orderId: string, token: string): Promise<InvoiceTrackingLink> {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.auth.require(sql, actor, 'orders.manage');
      await readOrder(sql, orderId);
      const link = (
        await sql.query(
          'SELECT id,expires_at FROM tracking_links WHERE order_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>now()',
          [orderId, hash(token)],
        )
      )[0];
      if (!link)
        throw new AppError(
          'INVOICE_TRACKING_UNAVAILABLE',
          'ລິງບໍ່ກົງອໍເດີ ໝົດອາຍຸ ຫຼືປິດແລ້ວ / Link does not match this order, has expired or was revoked',
          409,
        );
      return { id: String(link.id), expiresAt: new Date(link.expires_at as string).toISOString() };
    });
  }
  issue(actor: UserView, orderId: string, input: z.infer<typeof issueLinkSchema>) {
    return this.commands.run(actor, orderId, 'issue', input, async (sql, fresh) => {
      const token = randomBytes(32).toString('base64url'),
        id = uuidv7();
      await sql.query(
        'UPDATE tracking_links SET revoked_at=now() WHERE order_id=$1 AND revoked_at IS NULL',
        [orderId],
      );
      const row = (
        await sql.query(
          "INSERT INTO tracking_links(id,order_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+($4::int * interval '1 day'),$5) RETURNING expires_at",
          [id, orderId, hash(token), input.days, fresh.id],
        )
      )[0];
      await recordAudit(sql, fresh.id, 'TRACKING_LINK_ISSUED', orderId, input.reason, {
        linkId: id,
        days: input.days,
      });
      return { id, token, expiresAt: new Date(row.expires_at as string).toISOString() };
    });
  }
  revoke(actor: UserView, orderId: string, input: z.infer<typeof trackingCommandSchema>) {
    return this.commands.run(actor, orderId, 'revoke', input, async (sql, fresh) => {
      await sql.query(
        'UPDATE tracking_links SET revoked_at=now() WHERE order_id=$1 AND revoked_at IS NULL',
        [orderId],
      );
      await recordAudit(sql, fresh.id, 'TRACKING_LINK_REVOKED', orderId, input.reason);
      return { ok: true };
    });
  }
  async verify(input: z.infer<typeof verifyTrackingSchema>, ip: string) {
    const result = await this.db.transaction(async (sql) => {
      const buckets = [
        hash('tracking-ip:' + ip),
        hash('tracking-token:' + ip + ':' + hash(input.token)),
      ];
      for (const [index, bucket] of buckets.entries()) {
        await sql.query(
          "INSERT INTO tracking_attempts(bucket,failures,reset_at) VALUES($1,0,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET failures=CASE WHEN tracking_attempts.reset_at<now() THEN 0 ELSE tracking_attempts.failures END,reset_at=CASE WHEN tracking_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE tracking_attempts.reset_at END",
          [bucket],
        );
        const r = (
          await sql.query('SELECT failures FROM tracking_attempts WHERE bucket=$1 FOR UPDATE', [
            bucket,
          ])
        )[0];
        if (Number(r.failures) >= (index ? 5 : 20)) return { limited: true };
      }
      const link = (
        await sql.query(
          'SELECT * FROM tracking_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',
          [hash(input.token)],
        )
      )[0];
      const order = link ? await readOrder(sql, String(link.order_id)) : null;
      const expected = Buffer.from(order ? normalizePhone(order.snapshot.input.phone) : 'invalid'),
        sent = Buffer.from(normalizePhone(input.phone));
      if (!link || !order || sent.length !== expected.length || !timingSafeEqual(expected, sent)) {
        await sql.query(
          'UPDATE tracking_attempts SET failures=failures+1 WHERE bucket=ANY($1::text[])',
          [buckets],
        );
        return { invalid: true };
      }
      const session = randomBytes(32).toString('base64url');
      await sql.query(
        "INSERT INTO tracking_sessions(session_hash,link_id,order_revision,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
        [hash(session), link.id, order.latest_revision],
      );
      return { session };
    });
    if ('limited' in result)
      throw new AppError(
        'TRACKING_RATE_LIMIT',
        'ລອງຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ 15 ນາທີ / Please wait 15 minutes',
        429,
      );
    if (!result.session)
      throw new AppError(
        'TRACKING_UNAVAILABLE',
        'ລິງ ຫຼື ເບີໂທບໍ່ຖືກຕ້ອງ / Link or phone not valid',
        403,
      );
    return result.session;
  }
  async authorized(sql: Sql, session?: string, token?: string, write = false) {
    if (!session || !/^[\w-]{43}$/.test(session) || !token || !/^[\w-]{43}$/.test(token))
      throw new AppError('TRACKING_UNAVAILABLE', 'ກະລຸນາຢືນຢັນເບີໂທໃໝ່ / Verify again', 403);
    const candidate = (
      await sql.query(
        'SELECT l.order_id FROM tracking_sessions s JOIN tracking_links l ON l.id=s.link_id WHERE s.session_hash=$1',
        [hash(session)],
      )
    )[0];
    if (candidate)
      await sql.query(
        write
          ? 'SELECT id FROM orders WHERE id=$1 FOR UPDATE'
          : 'SELECT id FROM orders WHERE id=$1 FOR SHARE',
        [candidate.order_id],
      );
    const row = (
      await sql.query(
        'SELECT l.order_id,s.order_revision FROM tracking_sessions s JOIN tracking_links l ON l.id=s.link_id WHERE s.session_hash=$1 AND l.token_hash=$2 AND s.expires_at>now() AND l.expires_at>now() AND l.revoked_at IS NULL FOR SHARE OF l',
        [hash(session), hash(token)],
      )
    )[0];
    if (!row)
      throw new AppError('TRACKING_UNAVAILABLE', 'ກະລຸນາຢືນຢັນເບີໂທໃໝ່ / Verify again', 403);
    const order = await readOrder(sql, String(row.order_id));
    if (Number(order.latest_revision) !== Number(row.order_revision))
      throw new AppError('TRACKING_UNAVAILABLE', 'ກະລຸນາຢືນຢັນເບີໂທໃໝ່ / Verify again', 403);
    return order;
  }
}
