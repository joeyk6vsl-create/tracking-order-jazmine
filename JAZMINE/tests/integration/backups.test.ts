import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { productionFixture } from './helpers/production-fixture';
import { BackupService } from '../../apps/server/src/backups/backup-service';
import { decryptArchive, unpackDump } from '../../apps/server/src/backups/archive';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import { TrackingLinkService } from '../../apps/server/src/tracking/link-service';
import { PublicTrackingService } from '../../apps/server/src/tracking/public-service';
import { CustomerRequestService } from '../../apps/server/src/tracking/request-service';
import {
  receiptSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { AppError } from '../../apps/server/src/errors';
import { createApplication } from '../../apps/server/src/app';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { RecoveryFiles } from '../../apps/server/src/backups/recovery-files';
import { QuotationService } from '../../apps/server/src/orders/quotation-service';
import { DocumentProcessor } from '../../apps/server/src/documents/document-processor';
import { DocumentService } from '../../apps/server/src/documents/document-service';
import { syntheticPdf } from './helpers/document-pdf';
import { fixtureBankInput } from './helpers/payment-qr-fixture';
import { PaymentQrService } from '../../apps/server/src/payment-qr/payment-qr-service';
import { businessDate } from '../../packages/contracts/src/customers';
const password = 'Backup-Only-Password-12345',
  code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
const reason = 'ทดสอบสำรองและกู้คืนโดยไม่ทับข้อมูลเดิม';
async function temp() {
  return mkdtemp(join(tmpdir(), 'jazmine-backup-'));
}
async function clean(root: string) {
  assert.equal(dirname(root), tmpdir());
  assert(basename(root).startsWith('jazmine-backup-'));
  await rm(root, { recursive: true, force: true });
}
test('encrypted backup restores every table/file, money and production after restart; source stays current and old sessions/links stay revoked in the copy', async () => {
  const f = await productionFixture(),
    root = await temp(),
    service = new BackupService(f.db, {
      production: false,
      origin: 'http://localhost:5173',
      port: 3100,
      dataDir: ':memory:',
      localRecoveryRoot: root,
    });
  let recovered: Database | undefined;
  try {
    const quotationDraft = randomUUID(),
      quotations = new QuotationService(f.db),
      terms = { draftVersion: 1, validUntil: businessDate(), notes: 'สำรองใบเสนอราคา' };
    const bankSample = await fixtureBankInput();
    await new PaymentQrService(f.db).save(f.owner, 'LAK', bankSample.input);
    const bankImage = await new PaymentQrService(f.db).image(f.owner, 'LAK', 1);
    await f.drafts.save(f.owner, quotationDraft, f.input);
    const checked = await quotations.check(f.owner, quotationDraft, terms),
      issued = await quotations.issue(f.owner, quotationDraft, {
        ...terms,
        requestId: randomUUID(),
        checkToken: checked.checkToken,
        reason: 'ตรวจการกู้คืน',
      }),
      quotation = await quotations.detail(f.owner, issued.revisionId);
    await f.finish(f.id);
    const settlement = new SettlementService(f.db),
      payments = new PaymentService(f.db),
      ships = new ShipmentService(f.db),
      links = new TrackingLinkService(f.db);
    const base = async () => {
      const view = await settlement.detail(f.owner, f.order.id);
      return {
        requestId: randomUUID(),
        reason,
        expectedVersion: view.version,
        orderRevision: view.revision,
      };
    };
    const receive = async (amount: string) =>
      payments.receipt(
        f.owner,
        f.order.id,
        receiptSchema.parse({
          ...(await base()),
          purpose: 'DEPOSIT',
          currency: 'LAK',
          amount,
          method: 'TRANSFER',
          reference: 'proof',
          occurredAt: new Date().toISOString(),
          rateRevision: (await settlement.detail(f.owner, f.order.id)).rates.revision,
        }),
      );
    await receive('100000');
    const prepared = (await ships.prepare(
      f.owner,
      f.order.id,
      shipmentPrepareSchema.parse({
        ...(await base()),
        method: 'CUSTOMER_PICKUP',
        recipient: 'ผู้รับทดสอบ',
        phone: '',
        address: '',
        carrier: '',
        tracking: '',
        notes: '',
        items: [{ lineIndex: 0, quantity: 3 }],
      }),
    )) as { shipmentId: string };
    await ships.confirm(
      f.owner,
      f.order.id,
      prepared.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    const link = await links.issue(f.owner, f.order.id, {
        requestId: randomUUID(),
        reason,
        days: 30,
      }),
      token = String(link.token),
      customerSession = await links.verify({ token, phone: f.input.phone }, 'backup-test');
    await new CustomerRequestService(f.db).submit(customerSession, token, {
      requestId: randomUUID(),
      kind: 'GENERAL',
      message: 'เก็บคำขอลูกค้าด้วย',
    });
    const login = await f.auth.login(
      'fixture.owner',
      'Fixture-production-password-123',
      '127.0.0.1',
    );
    const processor = new DocumentProcessor(f.db, 'http://localhost:5173', syntheticPdf);
    while (await processor.processOne()) {
      /* เก็บไฟล์จำลองก่อนตรวจสำรอง */
    }
    const archivedInvoice = await new DocumentService(f.db).file(f.owner, 'INVOICE', f.order.id, 1);
    const original = await settlement.detail(f.owner, f.order.id),
      file = await service.create(f.owner, { password, reason });
    assert(file.filename.endsWith('.jazbackup'));
    assert(file.bytes.length > 1000);
    assert.equal(file.bytes.includes(Buffer.from(password)), false);
    const decoded = await decryptArchive(file.bytes, password);
    assert(decoded.manifest.tables.length >= 30);
    await receive('1000');
    const id = randomUUID(),
      report = await service.restore(f.owner, id, file.bytes, { password, reason });
    assert.equal(report.state, 'VERIFIED_COPY');
    assert(report.invalidatedSessions > 0);
    assert.equal(report.revokedLinks, 1);
    assert.deepEqual(report.verifiedTables, decoded.manifest.tables);
    assert.deepEqual(await service.restore(f.owner, id, file.bytes, { password, reason }), report);
    assert.equal(
      (await f.db.query("SELECT id FROM audit_events WHERE action='RECOVERY_COPY_VERIFIED'"))
        .length,
      1,
    );
    assert(await f.auth.authenticate(login.token));
    assert.equal((await settlement.detail(f.owner, f.order.id)).money.netPaid, '101000');
    assert.equal(
      (await new PublicTrackingService(f.db).view(customerSession, token)).orderNumber,
      f.order.orderNumber,
    );
    const folder = join(report.folder, 'postgres');
    recovered = await Database.open({ dataDir: folder });
    assert.equal((await recovered.query('SELECT token_hash FROM auth_sessions')).length, 0);
    assert.equal((await recovered.query('SELECT session_hash FROM tracking_sessions')).length, 0);
    const auth = new AuthService(recovered, true);
    assert.equal(await auth.authenticate(login.token), null);
    const owner = (
      await auth.login('fixture.owner', 'Fixture-production-password-123', '127.0.0.1')
    ).user;
    const restored = await new SettlementService(recovered).detail(owner, f.order.id);
    assert.deepEqual(await new PaymentQrService(recovered).image(owner, 'LAK', 1), bankImage);
    assert.deepEqual(
      (await new DocumentService(recovered).file(owner, 'INVOICE', f.order.id, 1)).bytes,
      archivedInvoice.bytes,
    );
    assert.deepEqual(
      (await new QuotationService(recovered).detail(owner, issued.revisionId)).snapshot,
      quotation.snapshot,
    );
    assert.equal(
      (await new QuotationService(recovered).detail(owner, issued.revisionId)).number,
      quotation.number,
    );
    assert.equal(restored.money.netPaid, '100000');
    assert.deepEqual(restored.delivery, original.delivery);
    assert.equal(restored.delivery.shippedQuantity, 3);
    assert.equal(restored.delivery.readyQuantity, 8);
    assert.equal((await recovered.query('SELECT id FROM customer_requests')).length, 1);
    assert(
      (await recovered.query('SELECT id FROM catalog_items WHERE image_data IS NOT NULL')).length >
        0,
    );
    for (const table of ['graphic_assets', 'production_part_files'])
      for (const row of await recovered.query(`SELECT sha256,file_data FROM ${table}`))
        assert.equal(
          createHash('sha256')
            .update(Buffer.from(row.file_data as Uint8Array))
            .digest('hex'),
          row.sha256,
        );
    await assert.rejects(
      new PublicTrackingService(recovered).view(customerSession, token),
      code('TRACKING_UNAVAILABLE'),
    );
    await recovered.close();
    recovered = undefined;
    recovered = await Database.open({ dataDir: folder });
    assert.equal(
      (await recovered.query('SELECT order_number FROM orders'))[0].order_number,
      f.order.orderNumber,
    );
    assert(
      (await readFile(join(report.folder, 'START_RECOVERED_JAZMINE.ps1'), 'utf8')).includes(
        "JAZMINE_RECOVERY_MODE = '1'",
      ),
    );
    assert((await stat(join(report.folder, 'RECOVERY_REPORT.json'))).size > 0);
  } finally {
    await recovered?.close();
    await f.db.close();
    await clean(root);
  }
});
test('backup refuses wrong password, corruption, duplicate paths and unprivileged staff without changing source', async () => {
  const f = await productionFixture(),
    root = await temp(),
    config = {
      production: false,
      origin: 'http://localhost:5173',
      port: 3100,
      dataDir: ':memory:',
      localRecoveryRoot: root,
    },
    service = new BackupService(f.db, config);
  try {
    await assert.rejects(service.status(f.actors.ADMIN), code('PERMISSION_DENIED'));
    await assert.rejects(
      service.create(f.actors.ADMIN, { password, reason }),
      code('PERMISSION_DENIED'),
    );
    assert.equal(
      (await new BackupService(f.db, { ...config, production: true }).status(f.owner)).available,
      false,
    );
    await assert.rejects(
      new BackupService(f.db, { ...config, production: true }).create(f.owner, {
        password,
        reason,
      }),
      code('LOCAL_BACKUP_ONLY'),
    );
    const file = await service.create(f.owner, { password, reason });
    await assert.rejects(
      service.restore(f.owner, randomUUID(), file.bytes, {
        password: 'Wrong-backup-password-123',
        reason,
      }),
      code('INVALID_BACKUP'),
    );
    const broken = Buffer.from(file.bytes);
    broken[broken.length - 1] ^= 1;
    await assert.rejects(
      service.restore(f.owner, randomUUID(), broken, { password, reason }),
      code('INVALID_BACKUP'),
    );
    const id = randomUUID();
    await service.restore(f.owner, id, file.bytes, { password, reason });
    await assert.rejects(
      service.restore(f.owner, id, file.bytes, { password, reason: 'คำขอเดิมแต่เปลี่ยนเหตุผล' }),
      code('REQUEST_CONFLICT'),
    );
    assert.equal((await f.db.query('SELECT id FROM orders')).length, 1);
    assert.equal((await service.status(f.owner)).busy, false);
  } finally {
    await f.db.close();
    await clean(root);
  }
});
test('one disk database has one owner; restore cannot overwrite an existing folder', async () => {
  const root = await temp(),
    dir = join(root, 'database');
  let db: Database | undefined;
  try {
    db = await Database.open({ dataDir: dir });
    await db.migrate();
    await assert.rejects(
      new RecoveryFiles(dir, process.cwd(), dir).target(randomUUID()),
      code('RECOVERY_PATH'),
    );
    await assert.rejects(Database.open({ dataDir: dir }), /ฐานข้อมูลนี้กำลังเปิดอยู่/);
    const dump = new Uint8Array(await (await db.localSnapshot()).arrayBuffer());
    await assert.rejects(Database.restoreSnapshot(dump, dir));
    await db.close();
    db = undefined;
    db = await Database.open({ dataDir: dir });
    assert((await db.query('SELECT name FROM schema_migrations')).length >= 16);
  } finally {
    await db?.close();
    await clean(root);
  }
});
test('startup refuses an occupied API port before opening or creating a database', async () => {
  const root = await temp(),
    guard = createServer();
  await new Promise<void>((resolve) => guard.listen(0, '127.0.0.1', resolve));
  try {
    const address = guard.address();
    assert(address && typeof address === 'object');
    const child = spawn(process.execPath, ['dist/apps/server/src/main.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: '',
        NODE_ENV: 'development',
        PORT: String(address.port),
        LOCAL_DATA_DIR: join(root, 'must-not-create'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exit = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Startup did not stop'));
      }, 15000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.once('error', reject);
    });
    assert.equal(exit, 1);
    await assert.rejects(stat(join(root, 'must-not-create')));
  } finally {
    await new Promise<void>((resolve, reject) => guard.close((e) => (e ? reject(e) : resolve())));
    await clean(root);
  }
});
test(
  'Windows launcher shutdown closes the disk database so it can reopen without a stale owner file',
  { timeout: 45000 },
  async () => {
    const root = await temp(),
      guard = createServer();
    await new Promise<void>((resolve) => guard.listen(0, '127.0.0.1', resolve));
    const port = (guard.address() as { port: number }).port;
    await new Promise<void>((resolve) => guard.close(() => resolve()));
    const dataDir = join(root, 'postgres');
    const child = spawn(process.execPath, ['dist/apps/server/src/main.js'], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL: '',
        LOCAL_DATA_DIR: dataDir,
        JAZMINE_RECOVERY_MODE: '1',
      },
    });
    let output = '';
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Startup timeout: ' + output)), 30000);
        child.stdout!.on('data', (data) => {
          output += data.toString();
          if (output.includes('JAZMINE API ready')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.stderr!.on('data', (data) => {
          output += data.toString();
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error('Startup exited ' + code + ': ' + output));
        });
      });
      child.send('jazmine:shutdown');
      assert.equal(await exited, 0);
      await assert.rejects(stat(dataDir + '.jazmine-owner'), { code: 'ENOENT' });
      const reopened = await Database.open({ dataDir });
      try {
        assert((await reopened.query('SELECT name FROM schema_migrations')).length > 0);
      } finally {
        await reopened.close();
      }
    } finally {
      if (child.exitCode === null) child.kill();
      await exited;
      await clean(root);
    }
  },
);
test('snapshot waits for a complete transaction and never restores only half a business change', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  let restored: Database | undefined,
    release = () => {},
    entered = () => {};
  try {
    await db.query('CREATE TABLE backup_atomic_test(id integer PRIMARY KEY,value text NOT NULL)');
    const ready = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const write = db.transaction(async (sql) => {
      await sql.query("INSERT INTO backup_atomic_test VALUES(1,'first half')");
      entered();
      await gate;
      await sql.query("INSERT INTO backup_atomic_test VALUES(2,'second half')");
    });
    await ready;
    let finished = false;
    const capture = db.localSnapshot().then((blob) => {
      finished = true;
      return blob;
    });
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(finished, false);
    release();
    await write;
    const tar = await unpackDump(new Uint8Array(await (await capture).arrayBuffer()));
    restored = await Database.restoreSnapshot(tar);
    assert.equal((await restored.query('SELECT id FROM backup_atomic_test')).length, 2);
  } finally {
    release();
    await restored?.close();
    await db.close();
  }
});
test('backup HTTP checks owner and CSRF before upload; recovery login cookies are isolated', async () => {
  const f = await productionFixture(),
    root = await temp(),
    config = {
      production: false,
      origin: 'http://localhost:5173',
      port: 3100,
      dataDir: ':memory:',
      localRecoveryRoot: root,
    };
  const app = await createApplication(config, f.db, false);
  try {
    const owner = await f.auth.login(
        'fixture.owner',
        'Fixture-production-password-123',
        '127.0.0.1',
      ),
      admin = await f.auth.login(
        'fixture.admin',
        'Fixture-production-password-123new',
        '127.0.0.1',
      );
    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session' }),
      csrf = session.json().csrfToken;
    const headers = {
      origin: config.origin,
      'x-csrf-token': csrf,
      cookie: `jazmine_csrf=${csrf}; jazmine_session=${owner.token}`,
    };
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/backups/status' })).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/backups/create',
          headers: { cookie: `jazmine_session=${owner.token}` },
          payload: { password, reason },
        })
      ).statusCode,
      403,
    );
    const refused = await app.inject({
      method: 'POST',
      url: '/api/v1/backups/restore',
      headers: {
        ...headers,
        cookie: `jazmine_csrf=${csrf}; jazmine_session=${admin.token}`,
        'content-type': 'application/octet-stream',
      },
      payload: Buffer.alloc(4 * 1024 * 1024),
    });
    assert.equal(refused.statusCode, 403);
    const file = await app.inject({
      method: 'POST',
      url: '/api/v1/backups/create',
      headers,
      payload: { password, reason },
    });
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers['content-type'], 'application/octet-stream');
    const restored = await app.inject({
      method: 'POST',
      url: '/api/v1/backups/restore',
      headers: {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-backup-password': Buffer.from(password).toString('base64'),
        'x-recovery-reason': Buffer.from(reason).toString('base64'),
        'x-recovery-request': randomUUID(),
      },
      payload: file.rawPayload,
    });
    assert.equal(restored.statusCode, 201);
    assert.equal(restored.json().state, 'VERIFIED_COPY');
    const recovered = await createApplication({ ...config, recoveryMode: true }, f.db, false);
    try {
      const response = await recovered.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: `jazmine_session=${owner.token}` },
      });
      assert.equal(response.json().user, null);
      assert.equal(response.json().recoveryMode, true);
      assert(response.cookies.some((c) => c.name === 'jazmine_recovery_csrf'));
    } finally {
      await recovered.close();
    }
  } finally {
    await app.close();
    await f.db.close();
    await clean(root);
  }
});
