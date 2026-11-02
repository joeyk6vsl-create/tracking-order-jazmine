import { uuidv7 } from 'uuidv7';
import {
  normalizePhone,
  type CustomerInput,
  type CustomerQuery,
  type CustomerUpdate,
  type CustomerView,
  type CustomerList,
} from '../../../../../packages/contracts/src/customers';
import type { Sql } from '../../database';

type Row = Record<string, unknown> & {
  id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  customer_group: CustomerView['group'];
  branding_type: CustomerView['brandingType'];
  customer_since: string | Date;
  notes: string;
  status: CustomerView['status'];
  row_version: string | number;
  created_at: string | Date;
  updated_at: string | Date;
};
function view(row: Row): CustomerView {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    group: row.customer_group,
    brandingType: row.branding_type,
    customerSince:
      row.customer_since instanceof Date
        ? row.customer_since.toISOString().slice(0, 10)
        : row.customer_since,
    notes: row.notes,
    status: row.status,
    rowVersion: String(row.row_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function prefix(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&') + '%';
}
export class CustomerRepository {
  async byId(sql: Sql, id: string, lock = false): Promise<CustomerView | null> {
    const rows = await sql.query<Row>(
      'SELECT * FROM customers WHERE id=$1' + (lock ? ' FOR UPDATE' : ''),
      [id],
    );
    return rows[0] ? view(rows[0]) : null;
  }
  async list(sql: Sql, query: CustomerQuery): Promise<CustomerList> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.status !== 'ALL') {
      params.push(query.status);
      clauses.push('status=$' + params.length);
    }
    if (query.search) {
      params.push(prefix(query.search.toLowerCase()));
      const nameIndex = params.length;
      const phoneSearch = /^[+0-9໐-໙\s().-]+$/.test(query.search)
        ? normalizePhone(query.search)
        : '';
      params.push(phoneSearch ? prefix(phoneSearch) : 'NO_PHONE_MATCH');
      clauses.push(
        '(lower(name) LIKE $' + nameIndex + ' OR normalized_phone LIKE $' + params.length + ')',
      );
    }
    if (query.after) {
      params.push(query.after);
      clauses.push('id>$' + params.length + '::uuid');
    }
    params.push(query.limit + 1);
    const rows = await sql.query<Row>(
      'SELECT * FROM customers' +
        (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') +
        ' ORDER BY id LIMIT $' +
        params.length,
      params,
    );
    const customers = rows.slice(0, query.limit).map(view);
    return {
      customers,
      nextCursor: rows.length > query.limit ? customers[customers.length - 1].id : null,
    };
  }
  async phoneMatches(sql: Sql, phone: string, excludeId?: string): Promise<CustomerView[]> {
    return (
      await sql.query<Row>(
        'SELECT * FROM customers WHERE normalized_phone=$1 AND ($2::uuid IS NULL OR id<>$2::uuid) ORDER BY id LIMIT 5',
        [normalizePhone(phone), excludeId ?? null],
      )
    ).map(view);
  }
  async insert(sql: Sql, actorId: string, data: CustomerInput): Promise<CustomerView> {
    const id = uuidv7();
    const rows = await sql.query<Row>(
      'INSERT INTO customers(id,name,phone,normalized_phone,customer_group,branding_type,customer_since,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *',
      [
        id,
        data.name,
        data.phone,
        normalizePhone(data.phone),
        data.group,
        data.brandingType,
        data.customerSince,
        data.notes,
        actorId,
      ],
    );
    return view(rows[0]);
  }
  async update(sql: Sql, actorId: string, id: string, data: CustomerUpdate): Promise<CustomerView> {
    const rows = await sql.query<Row>(
      'UPDATE customers SET name=$2,phone=$3,normalized_phone=$4,customer_group=$5,branding_type=$6,customer_since=$7,notes=$8,status=$9,updated_by=$10,row_version=row_version+1,updated_at=now() WHERE id=$1 RETURNING *',
      [
        id,
        data.name,
        data.phone,
        normalizePhone(data.phone),
        data.group,
        data.brandingType,
        data.customerSince,
        data.notes,
        data.status,
        actorId,
      ],
    );
    return view(rows[0]);
  }
}
