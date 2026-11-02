import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { Database } = require('../../dist/apps/server/src/database.js'),
  { PaymentService } = require('../../dist/apps/server/src/settlements/payment-service.js'),
  { SettlementService } = require('../../dist/apps/server/src/settlements/settlement-service.js');
const f = await productionFixture(),
  root = await mkdtemp(join(tmpdir(), 'jazmine-backup-e2e-'));
const port = 5178,
  apiPort = 3105,
  recoveredPort = 5179,
  recoveredApiPort = 3106,
  base = `http://127.0.0.1:${port}`,
  recoveredBase = `http://127.0.0.1:${recoveredPort}`,
  password = 'ສຳຮອງ-Backup-123456';
let app, recoveredApp, recoveredDb, browser;
const vites = [];
async function web(port, apiPort) {
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      'apps/web/vite.config.mts',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JAZMINE_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  );
  vites.push(child);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 20000);
    child.stdout.on('data', (data) => {
      if (data.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Vite stopped ' + code));
    });
  });
}
try {
  await f.finish(f.id);
  const settlements = new SettlementService(f.db),
    payments = new PaymentService(f.db);
  async function receive(amount) {
    const v = await settlements.detail(f.owner, f.order.id);
    await payments.receipt(f.owner, f.order.id, {
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'ข้อมูลรับเงินสำหรับทดสอบกู้คืน',
      purpose: 'DEPOSIT',
      currency: 'LAK',
      amount,
      method: 'CASH',
      reference: '',
      occurredAt: new Date().toISOString(),
      rateRevision: v.rates.revision,
    });
  }
  await receive('100000');
  app = await createApplication(
    {
      production: false,
      origin: `http://localhost:${port}`,
      port: apiPort,
      dataDir: ':memory:',
      localRecoveryRoot: root,
    },
    f.db,
    false,
  );
  await app.listen(apiPort, '127.0.0.1');
  await web(port, apiPort);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE }
      : existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    owner = await f.auth.login('fixture.owner', 'Fixture-production-password-123', '127.0.0.1');
  await context.addCookies([
    { name: 'jazmine_session', value: owner.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .locator('nav')
    .getByRole('button', { name: 'ສຳຮອງ/ກູ້ຄືນ / Backup & recovery', exact: true })
    .click();
  await page.getByLabel('Backup password', { exact: true }).fill(password);
  await page.getByLabel('Confirm backup password', { exact: true }).fill(password);
  await page.getByLabel('Backup reason', { exact: true }).fill('สำรองก่อนทดลองกู้ข้อมูล');
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'ດາວໂຫຼດໄຟລ໌ສຳຮອງ / Download backup', exact: true })
    .click();
  const file = await downloading;
  await mkdir('test-results', { recursive: true });
  const path = resolve('test-results/backup-fixture.jazbackup');
  await file.saveAs(path);
  assert(file.suggestedFilename().endsWith('.jazbackup'));
  assert((await readFile(path)).length > 1000);
  await receive('1000');
  await page.getByLabel('Backup file', { exact: true }).setInputFiles(path);
  await page.getByLabel('Recovery password', { exact: true }).fill('Wrong-password-12345');
  await page.getByLabel('Recovery reason', { exact: true }).fill('ตรวจสำเนาและไฟล์ก่อนใช้ต่อ');
  await page
    .getByRole('button', { name: 'ກວດ ແລະ ສ້າງສຳເນົາ / Verify and restore copy', exact: true })
    .click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Incorrect password or invalid backup' })
    .waitFor();
  await page.getByLabel('Recovery password', { exact: true }).fill(password);
  let lost = false;
  await page.route('**/api/v1/backups/restore', async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch({ timeout: 60000 });
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'ກວດ ແລະ ສ້າງສຳເນົາ / Verify and restore copy', exact: true })
    .click();
  await page.getByRole('button', { name: 'ກວດຄຳຂໍເດີມ / Retry recovery', exact: true }).click();
  await page
    .getByRole('heading', { name: 'ກວດສຳເນົາຜ່ານແລ້ວ / Recovery copy verified', exact: true })
    .waitFor();
  const folder = await page.getByLabel('Recovery folder', { exact: true }).inputValue();
  assert.equal(
    (await f.db.query("SELECT id FROM audit_events WHERE action='RECOVERY_COPY_VERIFIED'")).length,
    1,
  );
  assert.equal((await settlements.detail(f.owner, f.order.id)).money.netPaid, '101000');
  assert.equal(await page.getByLabel('Backup password', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Recovery password', { exact: true }).inputValue(), '');
  await page.screenshot({ path: 'test-results/backup-recovery-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Backup overflow ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/backup-recovery-mobile.png', fullPage: true });
  recoveredDb = await Database.open({ dataDir: join(folder, 'postgres') });
  recoveredApp = await createApplication(
    {
      production: false,
      origin: `http://localhost:${recoveredPort}`,
      port: recoveredApiPort,
      dataDir: join(folder, 'postgres'),
      localRecoveryRoot: root,
      recoveryMode: true,
    },
    recoveredDb,
    false,
  );
  await recoveredApp.listen(recoveredApiPort, '127.0.0.1');
  await web(recoveredPort, recoveredApiPort);
  const restoredPage = await context.newPage();
  restoredPage.setDefaultTimeout(60000);
  restoredPage.on('pageerror', (e) => errors.push(e.message));
  await restoredPage.goto(recoveredBase);
  await restoredPage.locator('[name=username]').fill('fixture.owner');
  await restoredPage.locator('[name=password]').fill('Fixture-production-password-123');
  await restoredPage.getByRole('button', { name: 'ເຂົ້າສູ່ລະບົບ', exact: true }).click();
  await restoredPage
    .getByText('ພື້ນທີ່ກູ້ຄືນ / Recovery workspace · ແຍກຈາກຂໍ້ມູນເດີມ', { exact: true })
    .waitFor();
  await restoredPage.goto(recoveredBase + '/?settlementOrder=' + f.order.id);
  await restoredPage.getByLabel('Payment amount', { exact: true }).waitFor();
  const restored = await restoredPage.evaluate(
    async (id) => (await fetch('/api/v1/settlements/orders/' + id)).json(),
    f.order.id,
  );
  assert.equal(restored.money.netPaid, '100000');
  assert.equal(restored.delivery.readyQuantity, 11);
  const graphic = (await recoveredDb.query('SELECT id FROM graphic_assets LIMIT 1'))[0];
  assert.equal(
    await restoredPage.evaluate(
      async (id) => (await fetch('/api/v1/graphic-assets/' + id + '/content')).status,
      graphic.id,
    ),
    200,
  );
  assert.equal(
    (await page.evaluate(async () => (await fetch('/api/v1/auth/session')).json())).user.username,
    'fixture.owner',
  );
  const cookies = await context.cookies();
  assert(cookies.some((c) => c.name === 'jazmine_session'));
  assert(cookies.some((c) => c.name === 'jazmine_recovery_session'));
  await restoredPage.screenshot({ path: 'test-results/recovered-workspace.png', fullPage: true });
  const adminContext = await browser.newContext(),
    admin = await f.auth.login('fixture.admin', 'Fixture-production-password-123new', '127.0.0.1');
  await adminContext.addCookies([
    { name: 'jazmine_session', value: admin.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(base);
  await adminPage.getByRole('button', { name: 'ຄົ້ນຫາ / Search', exact: true }).waitFor();
  assert.equal(
    await adminPage
      .locator('nav')
      .getByRole('button', { name: 'ສຳຮອງ/ກູ້ຄືນ / Backup & recovery', exact: true })
      .count(),
    0,
  );
  assert.equal(
    await adminPage.evaluate(async () => (await fetch('/api/v1/backups/status')).status),
    403,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: encrypted browser download, Lao password, wrong-password rejection, retry without duplicate recovery, verified isolated restore, recovered login/files/money, original session preserved, owner permissions, 320/390px.',
  );
} finally {
  await browser?.close();
  for (const child of vites) child.kill();
  await recoveredApp?.close();
  await recoveredDb?.close();
  await app?.close();
  await f.db.close();
  assert.equal(dirname(root), tmpdir());
  assert(basename(root).startsWith('jazmine-backup-e2e-'));
  await rm(root, { recursive: true, force: true });
}
