import { createHash } from 'node:crypto';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { z } from 'zod';
import type {
  trackingCommandSchema,
  CustomerRequest,
} from '../../../../packages/contracts/src/tracking';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function requestView(r: Record<string, unknown>): CustomerRequest {
  return {
    id: String(r.id),
    kind: r.kind as CustomerRequest['kind'],
    message: String(r.message),
    state: r.state as CustomerRequest['state'],
    outcome: r.outcome as CustomerRequest['outcome'],
    response: String(r.response),
    rowVersion: Number(r.row_version),
    submittedAt: new Date(r.submitted_at as string).toISOString(),
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
  };
}
export class TrackingCommands {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async run(
    actor: UserView,
    orderId: string,
    operation: string,
    input: z.infer<typeof trackingCommandSchema>,
    run: (sql: Sql, actor: UserView) => Promise<Record<string, unknown>>,
  ) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'orders.manage', true);
      if (!(await sql.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [orderId])).length)
        throw new AppError('NOT_FOUND', 'ບໍ່ພົບ Order', 404);
      const requestHash = hash(JSON.stringify({ actor: fresh.id, orderId, operation, input }));
      const prior = (
        await sql.query('SELECT * FROM tracking_commands WHERE id=$1', [input.requestId])
      )[0];
      if (prior) {
        if (prior.request_hash !== requestHash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າມີຂໍ້ມູນຕ່າງກັນ', 409);
        return { ...(prior.result as Record<string, unknown>), replayed: true };
      }
      const result = await run(sql, fresh);
      // ลิงก์ลับคืนให้หน้าจอครั้งเดียว ไม่เก็บ token ในคำตอบที่บันทึกเพื่อ replay
      const { token: _token, ...saved } = result;
      void _token;
      await sql.query(
        'INSERT INTO tracking_commands(id,actor_id,operation,request_hash,result) VALUES($1,$2,$3,$4,$5)',
        [input.requestId, fresh.id, operation, requestHash, JSON.stringify(saved)],
      );
      return result;
    });
  }
}
