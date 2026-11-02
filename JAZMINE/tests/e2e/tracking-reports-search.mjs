import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const { PaymentService } = require('../../dist/apps/server/src/settlements/payment-service.js');
const {
  SettlementService,
} = require('../../dist/apps/server/src/settlements/settlement-service.js');
const f = await productionFixture();
const port = 5175,
  apiPort = 3102,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  await f.finish(f.id);
  const settlement = new SettlementService(f.db),
    initial = await settlement.detail(f.owner, f.order.id);
  await new PaymentService(f.db).receipt(f.owner, f.order.id, {
    requestId: randomUUID(),
    expectedVersion: 0,
    orderRevision: 1,
    reason: 'รับมัดจำทดสอบรายงาน',
    purpose: 'DEPOSIT',
    currency: 'LAK',
    amount: '100000',
    method: 'TRANSFER',
    reference: '',
    occurredAt: new Date().toISOString(),
    rateRevision: initial.rates.revision,
  });
  app = await createApplication(
    { production: false, origin: `http://localhost:${port}`, port: apiPort, dataDir: ':memory:' },
    f.db,
    false,
  );
  await app.listen(apiPort, '127.0.0.1');
  vite = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      'apps/web/vite.config.mts',
      '--port',
      String(port),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JAZMINE_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 20000);
    vite.stdout.on('data', (data) => {
      if (data.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vite.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Vite exited ' + code));
    });
  });
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE }
      : existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  const auth = await f.auth.login('fixture.owner', 'Fixture-production-password-123', '127.0.0.1');
  await owner.addCookies([
    { name: 'jazmine_session', value: auth.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await owner.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/?settlementOrder=' + f.order.id);
  await page.getByLabel('Tracking link reason', { exact: true }).fill('เปิดลิงก์ให้ลูกค้าตรวจงาน');
  await page
    .getByRole('button', { name: 'ສ້າງ/ປ່ຽນລິງ / Create replacement link', exact: true })
    .click();
  await page.getByLabel('Customer tracking link', { exact: true }).waitFor();
  const url = await page.getByLabel('Customer tracking link', { exact: true }).inputValue();
  await page.getByRole('img', { name: 'Customer tracking QR', exact: true }).waitFor();
  const customer = await browser.newContext({ viewport: { width: 1000, height: 900 } }),
    publicPage = await customer.newPage();
  publicPage.on('pageerror', (e) => errors.push(e.message));
  await publicPage.goto(url);
  await publicPage.getByLabel('Tracking phone', { exact: true }).fill('02000000000');
  await publicPage.getByRole('button', { name: 'ຢືນຢັນ / Verify', exact: true }).click();
  await publicPage.getByRole('alert').filter({ hasText: 'Link or phone not valid' }).waitFor();
  await publicPage.getByLabel('Tracking phone', { exact: true }).fill(f.input.phone);
  await publicPage.getByRole('button', { name: 'ຢືນຢັນ / Verify', exact: true }).click();
  await publicPage.getByRole('heading', { name: f.order.orderNumber, exact: true }).waitFor();
  await publicPage.getByRole('img', { name: 'Approved mockup', exact: true }).waitFor();
  const publicBody = await publicPage.locator('body').innerText();
  assert.equal(publicBody.includes(f.order.invoiceNumber), false);
  assert.equal(
    publicBody.includes((await f.production.detail(f.owner, f.id)).sheet.sheetNumber),
    false,
  );
  assert.equal(publicBody.includes('100,000'), false);
  await publicPage.getByLabel('Customer request type', { exact: true }).selectOption('EXPEDITE');
  await publicPage
    .getByLabel('Customer request message', { exact: true })
    .fill('ขอเร่งงานสำหรับวันแข่ง');
  let lostRequest = false;
  await publicPage.route('**/public-tracking/requests', async (route) => {
    if (!lostRequest) {
      lostRequest = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await publicPage.getByRole('button', { name: 'ສົ່ງຄຳຂໍ / Send request', exact: true }).click();
  await publicPage.getByRole('button', { name: 'ລອງຄຳຂໍເດີມ / Retry', exact: true }).click();
  await publicPage.getByText('ສົ່ງຄຳຂໍແລ້ວ / Request sent', { exact: true }).waitFor();
  assert.equal((await f.db.query('SELECT id FROM customer_requests')).length, 1);
  await page
    .locator('nav')
    .getByRole('button', { name: 'ຄຳຂໍລູກຄ້າ / Customer requests', exact: true })
    .click();
  await page
    .getByLabel('Request review reason', { exact: true })
    .fill('SECRET_INTERNAL_DO_NOT_EXPOSE');
  await page.getByRole('button', { name: 'ຮັບເລື່ອງ / Start review', exact: true }).click();
  await page.getByText('No requests', { exact: true }).waitFor();
  await page.getByLabel('Request filter', { exact: true }).selectOption('UNDER_REVIEW');
  await page
    .getByLabel('Public request reply', { exact: true })
    .fill('รับเรื่องแล้ว ร้านจะติดต่อกลับเรื่องกำหนดส่ง');
  await page
    .getByLabel('Request review reason', { exact: true })
    .fill('SECRET_INTERNAL_DO_NOT_EXPOSE');
  await page.getByRole('button', { name: 'ບັນທຶກຜົນ / Resolve request', exact: true }).click();
  await page.getByText('No requests', { exact: true }).waitFor();
  await publicPage.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await publicPage
    .getByText('APPROVED · รับเรื่องแล้ว ร้านจะติดต่อกลับเรื่องกำหนดส่ง', { exact: true })
    .waitFor();
  assert.equal((await publicPage.locator('body').innerText()).includes('SECRET_INTERNAL'), false);
  assert.equal((await f.db.query('SELECT id FROM shipments')).length, 0);
  assert.equal((await f.db.query('SELECT id FROM production_stage_events')).length, 12);
  const trackingCookie = (await customer.cookies(base + '/api/v1/public-tracking/view')).find(
    (c) => c.name === 'jazmine_tracking',
  );
  assert(trackingCookie?.httpOnly);
  assert.equal(trackingCookie.path, '/api/v1/public-tracking');
  assert.equal(await publicPage.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await mkdir('test-results', { recursive: true });
  await publicPage.screenshot({
    path: 'test-results/customer-tracking-desktop.png',
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await publicPage.setViewportSize({ width, height: 900 });
    assert.equal(
      await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Public tracking overflow ' + width,
    );
  }
  await publicPage.screenshot({
    path: 'test-results/customer-tracking-mobile.png',
    fullPage: true,
  });
  await page
    .locator('nav')
    .getByRole('button', { name: 'ລາຍງານເຈົ້າຂອງ / Reports', exact: true })
    .click();
  await page.getByText('ກຳໄລຍັງຄຳນວນບໍ່ຄົບ / Profit incomplete', { exact: true }).waitFor();
  assert(
    (await page.locator('body').innerText()).includes(
      new Intl.NumberFormat('en-US').format(BigInt(initial.money.total)) + ' LAK',
    ),
  );
  await page.screenshot({ path: 'test-results/owner-reports-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Report overflow ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/owner-reports-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: 'ຄົ້ນຫາ / Search', exact: true }).click();
  await page.getByLabel('Global search query', { exact: true }).fill(f.order.orderNumber);
  await page.getByRole('button', { name: 'ຄົ້ນຫາ / Search all', exact: true }).click();
  await page.locator('.search-results a').filter({ hasText: 'ORDER' }).click();
  await page.locator('.invoice-print').waitFor();
  const worker = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    workerAuth = await f.auth.login(
      'fixture.printing',
      'Fixture-production-password-123new',
      '127.0.0.1',
    );
  await worker.addCookies([
    {
      name: 'jazmine_session',
      value: workerAuth.token,
      url: base,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const workerPage = await worker.newPage();
  workerPage.on('pageerror', (e) => errors.push(e.message));
  await workerPage.goto(base);
  await workerPage
    .locator('nav')
    .getByRole('button', { name: 'ຄົ້ນຫາ / Search', exact: true })
    .click();
  assert.equal(
    await workerPage
      .locator('nav')
      .getByRole('button', { name: 'ລາຍງານເຈົ້າຂອງ / Reports', exact: true })
      .count(),
    0,
  );
  assert.equal(
    await workerPage.evaluate(
      async () => (await fetch('/api/v1/reports/summary?from=2026-11-01&to=2026-11-01')).status,
    ),
    403,
  );
  await workerPage.getByLabel('Global search query', { exact: true }).fill(f.order.orderNumber);
  await workerPage.getByRole('button', { name: 'ຄົ້ນຫາ / Search all', exact: true }).click();
  await workerPage.locator('.search-results a').waitFor();
  assert.equal(await workerPage.locator('.search-results a').count(), 1);
  assert((await workerPage.locator('.search-results').innerText()).includes('PRODUCTION'));
  await page.goto(base + '/?settlementOrder=' + f.order.id);
  await page.getByLabel('Tracking link reason', { exact: true }).fill('ทดสอบปิดสิทธิ์ลิงก์ลูกค้า');
  await page.getByRole('button', { name: 'ປິດລິງ / Revoke link', exact: true }).click();
  await page.getByText('ປິດລິງແລ້ວ / Link revoked', { exact: true }).waitFor();
  await publicPage.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await publicPage.getByLabel('Tracking phone', { exact: true }).waitFor();
  assert.equal(
    await publicPage.getByRole('heading', { name: f.order.orderNumber, exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: customer link/phone/QR, scoped mockup, request retry/review without business mutations, owner-only reports, scoped search/deep links, revocation, 320/390px layouts.',
  );
} finally {
  await browser?.close();
  vite?.kill();
  await app?.close();
  await f.db.close();
}
