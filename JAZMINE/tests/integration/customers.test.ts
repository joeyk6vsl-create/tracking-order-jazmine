import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { createApplication } from '../../apps/server/src/app';
import { Database } from '../../apps/server/src/database';
import { normalizePhone } from '../../packages/contracts/src/customers';
import type { CustomerView } from '../../packages/contracts/src/customers';

let db: Database, app: NestFastifyApplication, http: FastifyInstance;
const password = 'Customers-test-password-123';
const origin = 'http://localhost:5173';
class Client {
  cookies = new Map<string, string>();
  csrf = '';
  async request(method: HTTPMethods, path: string, payload?: unknown, key?: string) {
    const response = await http.inject({
      method,
      url: '/api/v1' + path,
      headers: {
        origin,
        cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
        'x-csrf-token': this.csrf,
        ...(key ? { 'idempotency-key': key } : {}),
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    for (const cookie of response.cookies) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }
  async session() {
    const response = await this.request('GET', '/auth/session');
    this.csrf = response.json().csrfToken;
    return response.json();
  }
  async login(username: string, value = password) {
    await this.session();
    const result = await this.request('POST', '/auth/login', { username, password: value });
    assert.equal(result.statusCode, 201);
    await this.session();
  }
}
const owner = new Client(),
  admin = new Client(),
  printing = new Client();
const customerInput = {
  name: 'ทีมประจำตัวอย่าง',
  phone: '020 5555 0001',
  group: 'RETAIL',
  brandingType: 'JAZMINE_STANDARD',
  customerSince: '2026-10-31',
  notes: 'เก็บไว้สำหรับใช้ซ้ำ',
};
let first: CustomerView;
let ownerId: string, adminId: string;
before(async () => {
  db = await Database.open({ dataDir: ':memory:' });
  await db.migrate();
  app = await createApplication(
    { production: false, port: 3100, origin, dataDir: ':memory:' },
    db,
    false,
  );
  http = app.getHttpAdapter().getInstance();
  await owner.session();
  assert.equal(
    (
      await owner.request('POST', '/auth/setup', {
        username: 'owner',
        displayName: 'เจ้าของ',
        password,
      })
    ).statusCode,
    201,
  );
  await owner.login('owner');
  ownerId = (await owner.session()).user.id;
  for (const [client, username, department] of [
    [admin, 'admin', 'ADMIN'],
    [printing, 'printing', 'PRINTING'],
  ] as const) {
    const created = await owner.request('POST', '/users', {
      username,
      displayName: username,
      password,
      role: 'STAFF',
      department,
    });
    assert.equal(created.statusCode, 201);
    if (username === 'admin') adminId = created.json().user.id;
    await client.login(username);
    assert.equal(
      (
        await client.request('POST', '/auth/change-password', {
          currentPassword: password,
          newPassword: password + '-new',
        })
      ).statusCode,
      201,
    );
    await client.login(username, password + '-new');
  }
});
after(async () => {
  await app?.close();
  await db?.close();
});

test('customer migration upgrades an existing identity schema without changing existing users', async () => {
  const upgraded = await Database.open({ dataDir: ':memory:' });
  try {
    const oldSchema = await readFile(resolve('database/migrations/0001_identity.sql'), 'utf8');
    for (const statement of oldSchema
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean))
      await upgraded.query(statement);
    await upgraded.query(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await upgraded.query("INSERT INTO schema_migrations(name) VALUES('0001_identity.sql')");
    const oldAuth = new AuthService(upgraded, true);
    await oldAuth.bootstrap({
      username: 'existing.owner',
      displayName: 'เจ้าของก่อนเพิ่มระบบลูกค้า',
      password,
    });
    const existing = await upgraded.query('SELECT id,display_name,row_version FROM users');
    await upgraded.migrate();
    assert.deepEqual(
      await upgraded.query('SELECT id,display_name,row_version FROM users'),
      existing,
    );
    assert.equal((await oldAuth.login('existing.owner', password, 'test')).user.id, existing[0].id);
    assert.equal(
      Number((await upgraded.query('SELECT count(*) AS count FROM customers'))[0].count),
      0,
    );
  } finally {
    await upgraded.close();
  }
  await db.migrate();
  assert.equal(Number((await db.query('SELECT count(*) AS count FROM users'))[0].count), 3);
  assert.deepEqual(
    (await db.query('SELECT name FROM schema_migrations ORDER BY name')).map((row) => row.name),
    [
      '0001_identity.sql',
      '0002_regular_customers.sql',
      '0003_catalog.sql',
      '0004_catalog_import.sql',
      '0005_catalog_choices.sql',
      '0006_pricing.sql',
      '0007_order_drafts.sql',
      '0008_graphic_assets.sql',
      '0009_confirmed_orders.sql',
      '0010_production_sheets.sql',
      '0011_production_print.sql',
      '0012_production_work.sql',
      '0013_production_exceptions.sql',
      '0014_payments_shipments.sql',
      '0015_customer_tracking.sql',
      '0016_search_indexes.sql',
      '0017_production_revision_review.sql',
      '0018_production_issue_corrections.sql',
      '0019_order_lifecycle.sql',
      '0020_quotations.sql',
      '0021_document_files.sql',
      '0022_payment_qr.sql',
      '0023_production_review_reversal.sql',
      '0024_archive_automation.sql',
      '0025_reusable_brand_assets.sql',
    ],
  );
});
test('anonymous and production staff cannot read or mutate customer information', async () => {
  const anon = new Client();
  assert.equal((await anon.request('GET', '/customers')).statusCode, 401);
  assert.equal((await printing.request('GET', '/customers')).statusCode, 403);
  assert.equal(
    (await printing.request('POST', '/customers', customerInput, randomUUID())).statusCode,
    403,
  );
});
test('owner and STAFF ADMIN can intentionally create regular customers', async () => {
  const response = await owner.request('POST', '/customers', customerInput, randomUUID());
  assert.equal(response.statusCode, 201);
  first = response.json().customer;
  assert.equal(first.normalizedPhone, '02055550001');
  assert.equal(first.rowVersion, '1');
  assert.deepEqual(response.json().phoneMatches, []);
  assert.equal((await admin.request('GET', '/customers/' + first.id)).statusCode, 200);
});
test('duplicate phone warns but remains a separate customer and brand', async () => {
  const response = await admin.request(
    'POST',
    '/customers',
    { ...customerInput, name: 'อีกแบรนด์', phone: '020-5555-0001', brandingType: 'CUSTOM_AGENT' },
    randomUUID(),
  );
  assert.equal(response.statusCode, 201);
  assert.notEqual(response.json().customer.id, first.id);
  assert.equal(response.json().phoneMatches[0].id, first.id);
  const matches = await admin.request(
    'GET',
    '/customers/phone-matches?phone=02055550001&excludeId=' + first.id,
  );
  assert.equal(matches.json().customers.length, 1);
  assert.equal(normalizePhone('໐໒໐ ໕໕໕໕ ໐໐໐໑'), '02055550001');
});
test('double click and retry return the same committed result with one customer and audit row', async () => {
  const key = randomUUID();
  const data = { ...customerInput, name: 'ไม่ซ้ำจากการกดสองครั้ง', phone: '02055550002' };
  const responses = await Promise.all([
    admin.request('POST', '/customers', data, key),
    admin.request('POST', '/customers', data, key),
  ]);
  assert(responses.every((response) => response.statusCode === 201));
  assert.deepEqual(responses[0].json(), responses[1].json());
  assert.equal(
    Number(
      (await db.query('SELECT count(*) AS count FROM customers WHERE name=$1', [data.name]))[0]
        .count,
    ),
    1,
  );
  const id = responses[0].json().customer.id;
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS count FROM audit_events WHERE action='CUSTOMER_CREATED' AND entity_id=$1",
          [id],
        )
      )[0].count,
    ),
    1,
  );
  assert.equal(
    (await admin.request('POST', '/customers', { ...data, name: 'ข้อมูลต่างกัน' }, key)).statusCode,
    409,
  );
});
test('validation rejects malformed dates, phone, group and missing idempotency key', async () => {
  for (const data of [
    { ...customerInput, customerSince: '2026-02-30' },
    { ...customerInput, phone: 'not-a-phone' },
    { ...customerInput, group: 'VIP_FREE' },
  ])
    assert.equal((await owner.request('POST', '/customers', data, randomUUID())).statusCode, 400);
  assert.equal((await owner.request('POST', '/customers', customerInput)).statusCode, 400);
});
test('updates preserve identity, increment version and refuse stale writes', async () => {
  const input = {
    ...customerInput,
    name: 'ทีมประจำฉบับใหม่',
    group: 'AGENT_LEVEL_2',
    status: 'ACTIVE',
    rowVersion: first.rowVersion,
  };
  const response = await admin.request('PATCH', '/customers/' + first.id, input);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().customer.id, first.id);
  assert.equal(response.json().customer.rowVersion, '2');
  assert.equal((await owner.request('PATCH', '/customers/' + first.id, input)).statusCode, 409);
  first = response.json().customer;
  const audit = (
    await db.query(
      "SELECT detail FROM audit_events WHERE action='CUSTOMER_UPDATED' AND entity_id=$1",
      [first.id],
    )
  )[0].detail as { before: { name: string }; after: { name: string } };
  assert.equal(audit.before.name, customerInput.name);
  assert.equal(audit.after.name, first.name);
});
test('only owner changes active status; there is no destructive delete route', async () => {
  const input = {
    ...customerInput,
    name: first.name,
    group: first.group,
    rowVersion: first.rowVersion,
    status: 'INACTIVE',
  };
  assert.equal((await admin.request('PATCH', '/customers/' + first.id, input)).statusCode, 403);
  const response = await owner.request('PATCH', '/customers/' + first.id, input);
  assert.equal(response.statusCode, 200);
  first = response.json().customer;
  const active = (await owner.request('GET', '/customers')).json().customers;
  assert(!active.some((item: CustomerView) => item.id === first.id));
  assert(
    (await owner.request('GET', '/customers?status=INACTIVE'))
      .json()
      .customers.some((item: CustomerView) => item.id === first.id),
  );
  assert.equal((await owner.request('DELETE', '/customers/' + first.id)).statusCode, 404);
});
test('cursor pagination and literal search do not duplicate records or interpret SQL wildcards', async () => {
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await owner.request(
          'POST',
          '/customers',
          { ...customerInput, name: 'Page ' + i, phone: '0205555100' + i },
          randomUUID(),
        )
      ).statusCode,
      201,
    );
  const page1 = (await owner.request('GET', '/customers?search=Page&limit=2')).json();
  const page2 = (
    await owner.request('GET', '/customers?search=Page&limit=2&after=' + page1.nextCursor)
  ).json();
  assert.equal(page1.customers.length, 2);
  assert.equal(page2.customers.length, 2);
  assert.equal(page2.nextCursor, null);
  assert.equal(
    new Set([...page1.customers, ...page2.customers].map((item: CustomerView) => item.id)).size,
    4,
  );
  assert.equal((await owner.request('GET', '/customers?search=%25')).json().customers.length, 0);
  assert.equal(
    (await owner.request('GET', '/customers?search=Page%200')).json().customers.length,
    1,
  );
  assert.equal(
    (await owner.request('GET', '/customers?search=0205555100')).json().customers.length,
    4,
  );
});
test('customer retry returns original snapshot even if that customer is later edited', async () => {
  const data = { ...customerInput, name: 'Snapshot original' };
  const key = randomUUID(),
    created = await owner.request('POST', '/customers', data, key);
  const current = created.json().customer;
  await owner.request('PATCH', '/customers/' + current.id, {
    ...data,
    name: 'Snapshot changed',
    status: 'ACTIVE',
    rowVersion: current.rowVersion,
  });
  const replay = await owner.request('POST', '/customers', data, key);
  assert.deepEqual(replay.json(), created.json());
});
test('authority revocation blocks further customer work without touching customer records', async () => {
  const before = Number((await db.query('SELECT count(*) AS count FROM customers'))[0].count);
  const users = (await owner.request('GET', '/users')).json().users;
  const employee = users.find((user: { id: string }) => user.id === adminId);
  const response = await owner.request('PATCH', '/users/' + adminId, {
    displayName: employee.displayName,
    role: 'STAFF',
    department: 'GRAPHIC',
    status: 'ACTIVE',
    rowVersion: employee.rowVersion,
    reason: 'ย้ายหน้าที่',
  });
  assert.equal(response.statusCode, 200);
  assert.equal((await admin.request('GET', '/customers')).statusCode, 401);
  assert.equal(
    Number((await db.query('SELECT count(*) AS count FROM customers'))[0].count),
    before,
  );
  assert.notEqual(ownerId, adminId);
});
