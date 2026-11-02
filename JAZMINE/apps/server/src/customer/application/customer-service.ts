import { createHash } from 'node:crypto';
import type {
  CustomerInput,
  CustomerQuery,
  CustomerResult,
  CustomerUpdate,
  CustomerView,
} from '../../../../../packages/contracts/src/customers';
import type { UserView } from '../../../../../packages/contracts/src/identity';
import { Database } from '../../database';
import { AppError } from '../../errors';
import { ActorAuthorization } from '../../identity/application/actor-authorization';
import { recordAudit } from '../../shared/audit';
import { CustomerRepository } from '../infrastructure/customer-repository';

export class CustomerService {
  private readonly repo = new CustomerRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: ActorAuthorization,
  ) {}
  async list(actor: UserView, query: CustomerQuery) {
    await this.authorization.require(this.db, actor, 'customers.manage');
    return this.repo.list(this.db, query);
  }
  async byId(actor: UserView, id: string): Promise<CustomerView> {
    await this.authorization.require(this.db, actor, 'customers.manage');
    const customer = await this.repo.byId(this.db, id);
    if (!customer) throw new AppError('NOT_FOUND', 'ไม่พบลูกค้า', 404);
    return customer;
  }
  async phoneMatches(actor: UserView, phone: string, excludeId?: string) {
    await this.authorization.require(this.db, actor, 'customers.manage');
    return this.repo.phoneMatches(this.db, phone, excludeId);
  }
  async create(actor: UserView, data: CustomerInput, requestKey: string): Promise<CustomerResult> {
    const payloadHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return this.db.transaction(async (sql) => {
      await this.authorization.require(sql, actor, 'customers.manage', true);
      await sql.query(
        'INSERT INTO customer_create_requests(actor_id,request_key,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [actor.id, requestKey, payloadHash],
      );
      const request = (
        await sql.query(
          'SELECT payload_hash,customer_id,result_json FROM customer_create_requests WHERE actor_id=$1 AND request_key=$2 FOR UPDATE',
          [actor.id, requestKey],
        )
      )[0];
      if (request.payload_hash !== payloadHash)
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'คำขอเดิมมีข้อมูลต่างกัน กรุณาตรวจรายการก่อนสร้างใหม่',
          409,
        );
      if (request.customer_id) return request.result_json as unknown as CustomerResult;
      const customer = await this.repo.insert(sql, actor.id, data);
      const result = {
        customer,
        phoneMatches: await this.repo.phoneMatches(sql, customer.phone, customer.id),
      };
      await sql.query(
        'UPDATE customer_create_requests SET customer_id=$3,result_json=$4 WHERE actor_id=$1 AND request_key=$2',
        [actor.id, requestKey, customer.id, JSON.stringify(result)],
      );
      await recordAudit(sql, actor.id, 'CUSTOMER_CREATED', customer.id, undefined, {
        group: customer.group,
        brandingType: customer.brandingType,
      });
      return result;
    });
  }
  async update(actor: UserView, id: string, data: CustomerUpdate): Promise<CustomerResult> {
    return this.db.transaction(async (sql) => {
      const fresh = await this.authorization.require(sql, actor, 'customers.manage', true);
      const before = await this.repo.byId(sql, id, true);
      if (!before) throw new AppError('NOT_FOUND', 'ไม่พบลูกค้า', 404);
      if (before.rowVersion !== data.rowVersion)
        throw new AppError(
          'STALE_STATE',
          'มีผู้แก้ข้อมูลลูกค้าไปแล้ว กรุณาเปิดข้อมูลล่าสุดก่อนบันทึก',
          409,
        );
      if (before.status !== data.status && fresh.role !== 'ADMIN_PROMAX')
        throw new AppError('PERMISSION_DENIED', 'เฉพาะเจ้าของเปลี่ยนสถานะลูกค้าได้', 403);
      const customer = await this.repo.update(sql, actor.id, id, data);
      await recordAudit(sql, actor.id, 'CUSTOMER_UPDATED', id, undefined, {
        before,
        after: customer,
      });
      return { customer, phoneMatches: await this.repo.phoneMatches(sql, customer.phone, id) };
    });
  }
}
