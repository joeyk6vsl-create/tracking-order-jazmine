import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { fixturePng } = require('../../dist/tests/integration/helpers/revise-order.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { PricingService } = require('../../dist/apps/server/src/pricing/pricing-service.js'),
  {
    CatalogChoicesService,
  } = require('../../dist/apps/server/src/catalog/catalog-choices-service.js'),
  { AssetService } = require('../../dist/apps/server/src/assets/asset-service.js'),
  { SettlementService } = require('../../dist/apps/server/src/settlements/settlement-service.js'),
  { ShipmentService } = require('../../dist/apps/server/src/settlements/shipment-service.js'),
  { businessDate } = require('../../dist/packages/contracts/src/customers.js');
const f = await productionFixture(),
  port = 5186,
  apiPort = 3110,
  base = `http://127.0.0.1:${port}`,
  draftId = randomUUID();
let app, vite, browser;
try {
  const product = f.input.quote.productId,
    version = Number(
      (await f.db.query('SELECT row_version FROM catalog_items WHERE id=$1', [product]))[0]
        .row_version,
    );
  await new CatalogChoicesService(f.db).save(f.owner, product, {
    rowVersion: version,
    sizes: ['M', 'L'],
    fabricIds: [f.input.quote.fabricId],
  });
  const pricing = new PricingService(f.db),
    config = await pricing.current(f.owner);
  config.config.buyGet = { buy: 10, get: 1 };
  await pricing.save(f.owner, config.revision, config.config, 'กติกาทดสอบซื้อ 10 แถม 1');
  const first = { ...f.input.quote, size: 'L', quantity: 1, freeQuantity: 0 },
    paid = { ...f.input.quote, quantity: 10, freeQuantity: 0 };
  await f.drafts.save(f.actors.ADMIN, draftId, {
    ...f.input,
    customerName: 'ของแถมสำหรับทดสอบ',
    quote: first,
    lines: [first, paid],
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    login = await f.auth.login('fixture.admin', 'Fixture-production-password-123new', '127.0.0.1');
  await context.addCookies([
    { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  async function openDraft() {
    await page.goto(base);
    await page.locator('nav').getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
    await page.getByText('ร่างที่บันทึกไว้ล่าสุด (สูงสุด 50 รายการ)', { exact: true }).click();
    await page.getByRole('button', { name: /ของแถมสำหรับทดสอบ ·/ }).click();
  }
  await openDraft();
  await page.getByRole('button', { name: 'แก้ไขร่าง', exact: true }).click();
  await page.getByRole('button', { name: 'Make line 1 gift-only', exact: true }).click();
  assert.equal(await page.getByLabel('จำนวนซื้อรายการ 1', { exact: true }).inputValue(), '0');
  assert.equal(await page.getByLabel('แถมรายการ 1', { exact: true }).inputValue(), '1');
  await page.getByRole('button', { name: 'Make line 1 paid', exact: true }).click();
  assert.equal(await page.getByLabel('จำนวนซื้อรายการ 1', { exact: true }).inputValue(), '1');
  await page.getByRole('button', { name: 'Make line 1 gift-only', exact: true }).click();
  await page.getByLabel('ใช้ของแถมอัตโนมัติทั้งร่าง', { exact: true }).check();
  await page.getByRole('button', { name: 'Make line 1 paid', exact: true }).click();
  await page.getByRole('button', { name: 'Make line 2 gift-only', exact: true }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'จัดของแถมทั้งหมดให้รายการแรก', exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await page.getByLabel('แถมรายการ 2', { exact: true }).inputValue(), '10');
  await page.getByRole('button', { name: 'Make line 2 paid', exact: true }).click();
  await page.getByRole('button', { name: 'Make line 1 gift-only', exact: true }).click();
  await page.getByLabel('ลดเปอร์เซ็นต์ทั้งร่าง', { exact: true }).fill('10');
  await page.getByLabel('ลดเงินทั้งร่าง', { exact: true }).fill('50000');
  await page
    .getByLabel('เหตุผลที่แก้ร่าง', { exact: true })
    .fill('แถมไซซ์ L 1 ตัว แยกจากซื้อ M 10 ตัว');
  await page.getByLabel('แถมรายการ 1', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'ตรวจยอดรวมร่าง', exact: true }).click();
  await page
    .getByRole('alert')
    .getByText(/กรุณาตรวจชื่อ/)
    .waitFor();
  await page.getByLabel('แถมรายการ 1', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'ตรวจยอดรวมร่าง', exact: true }).click();
  await page.getByText('จำนวนซื้อรวม 10 · แถมรวม 1 · ผลิตรวม 11', { exact: true }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page
    .locator('.draft-line')
    .first()
    .screenshot({ path: 'test-results/gift-only-line-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Gift line overflow ' + width,
    );
  }
  await page
    .locator('.draft-line')
    .first()
    .screenshot({ path: 'test-results/gift-only-line-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let lost = false;
  await page.route('**/api/v1/order-drafts/' + draftId, async (route) => {
    if (!lost && route.request().method() === 'PUT') {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'เชื่อมต่อระบบไม่ได้' }).waitFor();
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page.getByRole('heading', { name: 'บันทึกร่างแล้ว', exact: true }).waitFor();
  const stored = (await f.db.query('SELECT * FROM order_drafts WHERE id=$1', [draftId]))[0];
  assert.equal(stored.row_version, 2);
  assert.equal(stored.input_json.quote.quantity, 0);
  assert.equal(stored.input_json.quote.freeQuantity, 0);
  assert.equal(stored.input_json.lines[0].freeQuantity, 1);
  assert.equal(stored.quote_json.productionQuantity, 11);
  const assets = new AssetService(f.db);
  for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP']) {
    const id = randomUUID();
    await assets.upload(f.actors.GRAPHIC, id, {
      draftId,
      kind,
      filename: kind + '.png',
      base64: fixturePng,
    });
    await assets.review(f.actors.GRAPHIC, id, 'APPROVED', 'ตรวจไฟล์ทดสอบของแถม');
  }
  await openDraft();
  await page.getByLabel('กำหนดส่งสินค้า', { exact: true }).fill(businessDate());
  await page.getByRole('button', { name: 'ตรวจความพร้อมก่อนยืนยัน', exact: true }).click();
  await page
    .getByLabel('เหตุผลการยืนยัน', { exact: true })
    .fill('ตรวจของแถม ไซซ์ ราคา และไฟล์ครบแล้ว');
  await page.getByRole('button', { name: 'ยืนยันออเดอร์', exact: true }).click();
  await page.getByText(/ยืนยันสำเร็จ ·/).waitFor();
  const order = (await f.db.query('SELECT id FROM orders WHERE draft_id=$1', [draftId]))[0],
    confirmed = (await f.orders.history(f.owner, order.id)).revisions[0];
  assert.equal(confirmed.snapshot.pricing.linePricing[0].total, 0);
  assert.equal(confirmed.snapshot.pricing.productionQuantity, 11);
  const cells = await page
    .locator('.invoice-print tbody tr')
    .first()
    .locator('td')
    .allTextContents();
  assert.deepEqual(cells.slice(1), ['L', '0', '1', '0']);
  await page.locator('.invoice-print').screenshot({ path: 'test-results/gift-only-invoice.png' });
  const sheetId = randomUUID();
  await f.production.save(f.actors.GRAPHIC, sheetId, {
    ...f.sheetInput,
    orderId: order.id,
    orderRevision: 1,
    allocations: [
      { lineIndex: 0, quantity: 1 },
      { lineIndex: 1, quantity: 10 },
    ],
  });
  await f.publish(sheetId);
  await f.finish(sheetId);
  const views = new SettlementService(f.db),
    ships = new ShipmentService(f.db);
  async function send(items) {
    let v = await views.detail(f.owner, order.id);
    const p = await ships.prepare(f.actors.ADMIN, order.id, {
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'ส่งจริงตามจำนวนรวมของแถม',
      method: 'CUSTOMER_PICKUP',
      recipient: 'ผู้รับ',
      phone: '',
      address: '',
      carrier: '',
      tracking: '',
      notes: '',
      items,
    });
    v = await views.detail(f.owner, order.id);
    await ships.confirm(f.actors.ADMIN, order.id, p.shipmentId, {
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'ยืนยันจำนวนจริง',
      confirmedEarly: false,
    });
  }
  await send([{ lineIndex: 1, quantity: 10 }]);
  assert.equal((await views.detail(f.owner, order.id)).delivery.orderStatus, 'CONFIRMED');
  await page.goto(base + '?settlementOrder=' + order.id);
  await page.getByText('1', { exact: true }).first().waitFor();
  await send([{ lineIndex: 0, quantity: 1 }]);
  await page.reload();
  await page.getByText('ສົ່ງຄົບ / Delivered in full', { exact: true }).waitFor();
  const done = await views.detail(f.owner, order.id);
  assert.equal(done.delivery.shippedQuantity, 11);
  assert.equal(done.payments.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: gift-first line conversion and reversal, empty-line rejection, buy/get with discounts, saved draft retry once, confirmation/invoice zero gift charge, QC and completion requiring gifts, 320/390px layouts',
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
