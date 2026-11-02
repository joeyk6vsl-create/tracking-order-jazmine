import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { SettlementService } = require('../../dist/apps/server/src/settlements/settlement-service.js'),
  { PaymentService } = require('../../dist/apps/server/src/settlements/payment-service.js'),
  { ShipmentService } = require('../../dist/apps/server/src/settlements/shipment-service.js'),
  {
    OrderLifecycleService,
  } = require('../../dist/apps/server/src/orders/order-lifecycle-service.js');
const f = await productionFixture(),
  port = 5185,
  apiPort = 3109,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  await f.finish(f.id);
  const views = new SettlementService(f.db);
  async function settlementBase() {
    const v = await views.detail(f.owner, f.order.id);
    return {
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'เตรียมข้อมูลจำลองก่อนตรวจหน้าจอ',
    };
  }
  await new PaymentService(f.db).receipt(f.actors.ADMIN, f.order.id, {
    ...(await settlementBase()),
    purpose: 'DEPOSIT',
    currency: 'LAK',
    amount: '800000',
    method: 'CASH',
    reference: '',
    occurredAt: new Date().toISOString(),
    rateRevision: 2,
  });
  await new ShipmentService(f.db).prepare(f.actors.ADMIN, f.order.id, {
    ...(await settlementBase()),
    method: 'CUSTOMER_PICKUP',
    recipient: 'ลูกค้าทดสอบ',
    phone: '',
    address: '',
    carrier: '',
    tracking: '',
    notes: '',
    items: [{ lineIndex: 0, quantity: 2 }],
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
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JAZMINE_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 20000);
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vite.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Vite stopped ' + code));
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
  async function login(username) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      r = await f.auth.login(
        username,
        username === 'fixture.owner'
          ? 'Fixture-production-password-123'
          : 'Fixture-production-password-123new',
        '127.0.0.1',
      );
    await context.addCookies([
      { name: 'jazmine_session', value: r.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    return page;
  }
  const page = await login('fixture.admin'),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?settlementOrder=' + f.order.id);
  const panel = page.getByRole('region', { name: 'Order cancellation and archive' });
  await panel.getByRole('button', { name: /Review order effects/ }).click();
  const form = panel.getByRole('form', { name: 'Order lifecycle form' });
  await form.getByLabel('Reviewed order effects').check();
  await form
    .getByLabel('Order lifecycle reason')
    .fill('ลูกค้ายกเลิก ตรวจเงินและงานผลิตแล้ว แจ้งทุกฝ่ายแล้ว');
  await mkdir('test-results', { recursive: true });
  await panel.screenshot({ path: 'test-results/order-cancellation-desktop.png' });
  let lost = false;
  await page.route('**/api/v1/order-lifecycle/*/cancel', async (route) => {
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201, await response.text());
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await form.getByRole('button', { name: /Confirm cancel/ }).click();
  await panel.getByRole('button', { name: /Retry/ }).click();
  await panel.getByText(/Owner decision required. Cancellation/).waitFor();
  assert.equal(
    (await f.db.query("SELECT id FROM order_lifecycle_events WHERE kind='CANCEL'")).length,
    1,
  );
  assert.equal((await views.detail(f.owner, f.order.id)).shipments[0].state, 'CANCELLED');
  assert.equal(await panel.getByRole('form').count(), 0);
  const owner = await login('fixture.owner');
  owner.on('pageerror', (e) => errors.push(e.message));
  await owner.goto(base + '?settlementOrder=' + f.order.id);
  const ownerPanel = owner.getByRole('region', { name: 'Order cancellation and archive' });
  await ownerPanel.getByRole('button', { name: /Review order effects/ }).click();
  const ownerForm = ownerPanel.getByRole('form', { name: 'Order lifecycle form' });
  await ownerForm.getByLabel('Cancellation agreed total').fill('300000');
  await ownerForm.getByLabel('Reviewed order effects').check();
  await ownerForm
    .getByLabel('Order lifecycle reason')
    .fill('ตกลงให้ร้านรับสุทธิ 300000 กีบ คืนส่วนที่เหลือ');
  for (const width of [390, 320]) {
    await owner.setViewportSize({ width, height: 900 });
    assert(
      await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Lifecycle overflow ' + width,
    );
  }
  await ownerPanel.screenshot({ path: 'test-results/cancellation-agreement-mobile.png' });
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await ownerForm.getByRole('button', { name: /Confirm agreement/ }).click();
  await ownerPanel.getByText(/Record actual receipts or refunds below/).waitFor();
  await owner.getByRole('button', { name: 'ຄືນເງິນ / Refund', exact: true }).click();
  await owner.getByLabel('Refund amount', { exact: true }).fill('500000');
  await owner.getByLabel('Refund reason', { exact: true }).fill('คืนเงินตามยอดยกเลิกที่ตกลง');
  await owner.getByRole('button', { name: 'ບັນທຶກຄືນເງິນ / Refund', exact: true }).click();
  await ownerPanel.getByText(/Finances clear/).waitFor();
  await ownerForm.getByLabel('Order lifecycle action', { exact: true }).selectOption('archive');
  await ownerForm.getByLabel('Reviewed order effects').check();
  await ownerForm.getByLabel('Order lifecycle reason').fill('ปิดเงินและงานครบ เก็บประวัติ');
  await ownerForm.getByRole('button', { name: /Confirm archive/ }).click();
  await ownerForm.getByRole('button', { name: /Confirm restore/ }).waitFor();
  assert.equal((await views.list(f.owner, '')).orders.length, 0);
  await owner.getByLabel('Include archived orders').check();
  await owner
    .getByLabel('Settlement order')
    .getByRole('option', { name: /Archived/ })
    .waitFor({ state: 'attached' });
  await ownerPanel.getByText(/Order lifecycle history \(3\)/).click();
  await ownerPanel.screenshot({ path: 'test-results/order-archive-history.png' });
  await ownerForm.getByLabel('Reviewed order effects').check();
  await ownerForm.getByLabel('Order lifecycle reason').fill('เปิดมาดูประวัติเพิ่มเติม');
  await ownerForm.getByRole('button', { name: /Confirm restore/ }).click();
  await ownerForm.getByRole('button', { name: /Confirm agreement/ }).waitFor();
  const result = await new OrderLifecycleService(f.db).preview(f.owner, f.order.id);
  assert.equal(result.state.business, 'CANCELLED');
  assert.equal(result.state.storage, 'ACTIVE');
  assert.equal(result.netPaid, '300000');
  assert.equal(result.history.length, 4);
  const staff = await login('fixture.printing');
  await staff.goto(base + '?productionWork=' + f.id);
  await staff
    .getByText(/Order cancelled/)
    .first()
    .waitFor();
  assert.equal(
    await staff.evaluate(
      async (id) => (await fetch('/api/v1/order-lifecycle/' + id)).status,
      f.order.id,
    ),
    403,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: ADMIN cancellation, lost-response retry once, owner agreement, actual partial refund, archive/restore with searchable history, staff blocked work and 320/390px layouts',
  );
} finally {
  await browser?.close();
  if (vite) {
    const stopped = new Promise((r) => vite.once('exit', r));
    vite.kill();
    await stopped;
  }
  await app?.close();
  await f.db.close();
}
