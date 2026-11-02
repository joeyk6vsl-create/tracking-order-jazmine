import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { createApplication } from '../../apps/server/src/app';
import { Database } from '../../apps/server/src/database';
import {
  permissionsFor,
  canWorkDepartment,
} from '../../apps/server/src/identity/domain/permissions';
import { processEvents } from '../../apps/worker/src/worker';
import type { UserView } from '../../packages/contracts/src/identity';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../apps/server/src/identity/application/user-service';

let db: Database;
let app: NestFastifyApplication;
let http: FastifyInstance;
const origin = 'http://localhost:5173';
const password = 'Owner-test-password-123';
class Client {
  cookies = new Map<string, string>();
  csrf = '';
  async send(
    method: HTTPMethods,
    url: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await http.inject({
      method,
      url: '/api/v1' + url,
      headers: {
        cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
        origin,
        'x-csrf-token': this.csrf,
        ...headers,
      },
      ...(data === undefined ? {} : { payload: data as object }),
    });
    for (const cookie of response.cookies) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }
  async session() {
    const response = await this.send('GET', '/auth/session');
    this.csrf = response.json().csrfToken;
    return response.json();
  }
  async login(username: string, value = password) {
    await this.session();
    return this.send('POST', '/auth/login', { username, password: value });
  }
}
const owner = new Client();
let ownerView: UserView;
before(async () => {
  db = await Database.open({ dataDir: ':memory:' });
  await db.migrate();
  app = await createApplication(
    { production: false, port: 3100, origin, dataDir: ':memory:' },
    db,
    false,
  );
  http = app.getHttpAdapter().getInstance();
});
after(async () => {
  await app?.close();
  await db?.close();
});

test('health and repeatable migrations', async () => {
  await db.migrate();
  const response = await http.inject('/api/v1/health');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().database, 'ready');
});
test('CSRF and Origin reject mutation before a password is processed', async () => {
  assert.equal(
    (await http.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: {} })).statusCode,
    403,
  );
  await owner.session();
  const response = await owner.send('POST', '/auth/setup', {}, { origin: 'https://evil.example' });
  assert.equal(response.statusCode, 403);
  const loopbackAlias = await owner.send(
    'POST',
    '/auth/setup',
    {},
    { origin: 'http://127.0.0.1:5173' },
  );
  assert.equal(loopbackAlias.statusCode, 400);
});
test('only one initial owner can be bootstrapped concurrently', async () => {
  const responses = await Promise.all([
    owner.send('POST', '/auth/setup', { username: 'owner', displayName: 'เจ้าของทดสอบ', password }),
    owner.send('POST', '/auth/setup', { username: 'other', displayName: 'อีกคน', password }),
  ]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
  const credentials = await db.query('SELECT username,password_hash FROM auth_credentials');
  assert.equal(credentials.length, 1);
  assert.match(String(credentials[0].password_hash), /^\$argon2id\$/);
  assert.notEqual(credentials[0].password_hash, password);
  const username = String(credentials[0].username);
  assert.equal((await owner.login(username)).statusCode, 201);
  ownerView = (await owner.session()).user;
});
test('session cookie is opaque HttpOnly, user view never leaks password hash', async () => {
  const user = (await owner.session()).user;
  assert.equal(user.role, 'ADMIN_PROMAX');
  assert.equal(user.password_hash, undefined);
  assert.equal(user.passwordHash, undefined);
  const stored = await db.query('SELECT token_hash FROM auth_sessions');
  assert.notEqual(stored[0].token_hash, owner.cookies.get('jazmine_session'));
  const login = await owner.login(user.username);
  assert.equal(login.cookies.find((c) => c.name === 'jazmine_session')?.httpOnly, true);
  assert.equal(login.cookies.find((c) => c.name === 'jazmine_session')?.sameSite, 'Lax');
});
test('cannot disable or demote the last active owner', async () => {
  const response = await owner.send('PATCH', '/users/' + ownerView.id, {
    displayName: ownerView.displayName,
    role: 'STAFF',
    department: 'ADMIN',
    status: 'ACTIVE',
    rowVersion: ownerView.rowVersion,
    reason: 'ทดสอบป้องกันเจ้าของคนสุดท้าย',
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'LAST_OWNER');
});
let staffView: UserView;
const staff = new Client();
const staffPassword = 'Temporary-staff-123';
const changed = 'Changed-staff-password-123';
test('owner creates staff; username unique and credentials are not returned', async () => {
  const data = {
    username: 'printing.staff',
    displayName: 'ฝ่ายพิมพ์',
    password: staffPassword,
    role: 'STAFF',
    department: 'PRINTING',
  };
  const response = await owner.send('POST', '/users', data);
  assert.equal(response.statusCode, 201);
  staffView = response.json().user;
  assert.equal(staffView.mustChangePassword, true);
  assert(!response.body.includes('password_hash'));
  assert.equal((await owner.send('POST', '/users', data)).statusCode, 409);
  assert.equal(
    (await owner.send('POST', '/users', { ...data, username: 'invalid', department: 'MONEY' }))
      .statusCode,
    400,
  );
});
test('temporary password restricts use and must change before accessing work', async () => {
  assert.equal((await staff.login(staffView.username, staffPassword)).statusCode, 201);
  assert.deepEqual((await staff.session()).permissions, []);
  const denied = await staff.send('GET', '/users');
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal(
    (
      await staff.send('POST', '/auth/change-password', {
        currentPassword: staffPassword,
        newPassword: changed,
      })
    ).statusCode,
    201,
  );
  assert.equal((await staff.session()).user, null);
  assert.equal((await staff.login(staffView.username, staffPassword)).statusCode, 401);
  assert.equal((await staff.login(staffView.username, changed)).statusCode, 201);
  const session = await staff.session();
  staffView = session.user;
  assert.deepEqual(session.permissions, ['production.own']);
  assert.equal((await staff.send('GET', '/users')).statusCode, 403);
  assert.equal(
    (
      await staff.send('POST', '/users', {
        username: 'hacker',
        displayName: 'test',
        password,
        role: 'ADMIN_PROMAX',
        department: 'ADMIN',
      })
    ).statusCode,
    403,
  );
});
test('optimistic concurrency rejects stale edits and authority changes revoke existing sessions', async () => {
  const first = {
    displayName: staffView.displayName,
    role: 'STAFF',
    department: 'GRAPHIC',
    status: 'ACTIVE',
    rowVersion: staffView.rowVersion,
    reason: 'ย้ายไปแผนกกราฟิก',
  };
  const response = await owner.send('PATCH', '/users/' + staffView.id, first);
  assert.equal(response.statusCode, 200);
  staffView = response.json().user;
  assert.equal((await staff.session()).user, null);
  const stale = await owner.send('PATCH', '/users/' + staffView.id, first);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'STALE_STATE');
  await staff.login(staffView.username, changed);
  assert.deepEqual((await staff.session()).permissions, ['production.own', 'graphic.approve']);
});
test('reset password revokes all sessions and forces a new password', async () => {
  const secondSession = new Client();
  await secondSession.login(staffView.username, changed);
  const temporaryPassword = 'Reset-password-staff-123';
  assert.equal(
    (
      await owner.send('POST', '/users/' + staffView.id + '/reset-password', {
        temporaryPassword,
        rowVersion: staffView.rowVersion,
        reason: 'พนักงานลืมรหัส',
      })
    ).statusCode,
    201,
  );
  assert.equal((await staff.session()).user, null);
  assert.equal((await secondSession.session()).user, null);
  await staff.login(staffView.username, temporaryPassword);
  const session = await staff.session();
  assert.equal(session.user.mustChangePassword, true);
});
test('department restriction and ADMIN permission matrix do not grant refunds or reports', () => {
  const admin: UserView = {
    ...ownerView,
    role: 'STAFF',
    department: 'ADMIN',
    mustChangePassword: false,
  };
  assert(permissionsFor(admin).includes('orders.manage'));
  assert(!permissionsFor(admin).includes('payments.refund'));
  assert(!permissionsFor(admin).includes('reports.view'));
  assert(!permissionsFor(admin).includes('rates.manage'));
  assert(!canWorkDepartment(admin, 'PRINTING'));
  assert(canWorkDepartment(ownerView, 'PRINTING'));
});
test('failed-login throttling persists and audit never contains credentials', async () => {
  const client = new Client();
  for (let i = 0; i < 10; i++)
    assert.equal((await client.login('unknown-account', 'wrong')).statusCode, 401);
  assert.equal((await client.login('unknown-account', 'wrong')).statusCode, 429);
  const audit = JSON.stringify(await db.query('SELECT action,reason,detail FROM audit_events'));
  assert(!audit.includes(password));
  assert(!audit.includes(staffPassword));
  assert(!audit.includes(changed));
  assert(!audit.includes('$argon2'));
});
test('worker consumes foundation events exactly once, including retry', async () => {
  const count = await processEvents(db);
  assert(count >= 2);
  const before = (await db.query('SELECT count(*) AS count FROM worker_receipts'))[0].count;
  assert.equal(await processEvents(db), 0);
  await db.query('UPDATE outbox_events SET processed_at=NULL');
  await processEvents(db);
  assert.equal((await db.query('SELECT count(*) AS count FROM worker_receipts'))[0].count, before);
});
test('disabling staff invalidates login, logout invalidates its single session', async () => {
  const list = await owner.send('GET', '/users');
  const staff = list.json().users.find((u: UserView) => u.id === staffView.id);
  assert.equal(
    (
      await owner.send('PATCH', '/users/' + staff.id, {
        ...{ displayName: staff.displayName, role: staff.role, department: staff.department },
        status: 'DISABLED',
        rowVersion: staff.rowVersion,
        reason: 'ปิดบัญชีทดสอบ',
      })
    ).statusCode,
    200,
  );
  const client = new Client();
  assert.equal((await client.login(staff.username, 'Reset-password-staff-123')).statusCode, 401);
  await owner.send('POST', '/auth/logout');
  assert.equal((await owner.session()).user, null);
});
test('local PostgreSQL data survives closing and reopening the database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jazmine-persistence-'));
  assert.equal(dirname(dir), tmpdir());
  assert(basename(dir).startsWith('jazmine-persistence-'));
  let disk: Database | undefined;
  try {
    disk = await Database.open({ dataDir: dir });
    await disk.migrate();
    await disk.query(
      "INSERT INTO users(id,display_name,role,department,status) VALUES('01900000-0000-7000-8000-000000000001','เก็บหลังปิดโปรแกรม','STAFF','ADMIN','ACTIVE')",
    );
    await disk.close();
    disk = undefined;
    disk = await Database.open({ dataDir: dir });
    await disk.migrate();
    assert.equal(
      (await disk.query('SELECT display_name FROM users'))[0].display_name,
      'เก็บหลังปิดโปรแกรม',
    );
  } finally {
    await disk?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('two owners cannot concurrently remove the last owner through separate changes', async () => {
  const isolated = await Database.open({ dataDir: ':memory:' });
  try {
    await isolated.migrate();
    const auth = new AuthService(isolated, true);
    const users = new UserService(isolated, auth);
    await auth.bootstrap({ username: 'first', displayName: 'เจ้าของหนึ่ง', password });
    const first = (await auth.login('first', password, 'test')).user;
    let second = await users.create(first, {
      username: 'second',
      displayName: 'เจ้าของสอง',
      password,
      role: 'ADMIN_PROMAX',
      department: 'ADMIN',
    });
    await auth.changePassword(second, {
      currentPassword: password,
      newPassword: 'Second-owner-password-123',
    });
    second = (await auth.login('second', 'Second-owner-password-123', 'test')).user;
    const result = await Promise.allSettled(
      [first, second].map((actor) =>
        users.update(actor, actor.id, {
          displayName: actor.displayName,
          role: 'STAFF',
          department: 'ADMIN',
          status: 'ACTIVE',
          rowVersion: actor.rowVersion,
          reason: 'ทดสอบทำพร้อมกัน',
        }),
      ),
    );
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      Number(
        (
          await isolated.query(
            "SELECT count(*) AS count FROM users WHERE role='ADMIN_PROMAX' AND status='ACTIVE'",
          )
        )[0].count,
      ),
      1,
    );
  } finally {
    await isolated.close();
  }
});
