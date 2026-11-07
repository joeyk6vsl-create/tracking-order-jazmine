import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { Database } = require('../../dist/apps/server/src/database.js');
const { AuthService } = require('../../dist/apps/server/src/identity/application/auth-service.js');
const { importAttachedCatalog } = require('../../dist/apps/server/src/catalog/import-catalog.js');
const { seedPricing } = require('../../dist/apps/server/src/pricing/seed-pricing.js');
const { AssetService } = require('../../dist/apps/server/src/assets/asset-service.js');
const { fixtureBankInput } = require('../../dist/tests/integration/helpers/payment-qr-fixture.js');
const { businessDate } = require('../../dist/packages/contracts/src/customers.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const port = 5193,
  apiPort = 3117,
  base = `http://127.0.0.1:${port}`;
const db = await Database.open({ dataDir: ':memory:' });
let app, vite, browser, page;
try {
  await db.migrate();
  const auth = new AuthService(db, true),
    password = 'Fresh-catalog-test-only-123';
  await auth.bootstrap({ username: 'fresh.owner', displayName: 'TEST OWNER', password });
  const login = await auth.login('fresh.owner', password, '127.0.0.1');
  await importAttachedCatalog(db);
  await seedPricing(db);
  assert.equal((await db.query('SELECT * FROM catalog_item_sizes')).length, 0);
  app = await createApplication(
    { production: false, origin: `http://localhost:${port}`, port: apiPort, dataDir: ':memory:' },
    db,
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
    const timer = setTimeout(() => reject(new Error('Vite timeout')), 20000);
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vite.once('exit', (c) => {
      clearTimeout(timer);
      reject(new Error('Vite stopped ' + c));
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('test-results', { recursive: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const nav = (name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
  // Create with an original imported image larger than the old 128 KB upload ceiling.
  await nav('สินค้าและชนิดผ้า');
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click();
  await page.getByLabel('Catalog name', { exact: true }).fill('TEST NEW SHIRT');
  const original = await readFile('database/catalog-import/image-1-1.png');
  assert(original.length > 128 * 1024);
  await page
    .getByLabel('Catalog image', { exact: true })
    .setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: original });
  await page.getByAltText('Selected item preview', { exact: true }).waitFor();
  // Simulate a lost response after commit: same new item ID must not create duplicates.
  let dropped = false;
  await page.route('**/api/v1/catalog/*', async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: /Save item/ }).click();
  await page.getByRole('button', { name: 'Retry same item request', exact: true }).click();
  await page.getByRole('heading', { name: 'ไซซ์และผ้าที่ใช้ได้', exact: true }).waitFor();
  assert.equal(
    (await db.query("SELECT * FROM catalog_items WHERE name='TEST NEW SHIRT'")).length,
    1,
  );
  const product = (await db.query("SELECT * FROM catalog_items WHERE name='TEST NEW SHIRT'"))[0];
  assert(Buffer.from(product.image_data.split(',')[1], 'base64').length <= 128 * 1024);
  const choices = page.locator('.choices-panel');
  await choices.getByRole('button', { name: 'Select all standard sizes', exact: true }).click();
  const fabric = (
    await db.query(
      "SELECT id,name FROM catalog_items WHERE kind='FABRIC' ORDER BY display_group,display_order,id LIMIT 1",
    )
  )[0];
  const partFabric = (
    await db.query(
      "SELECT id,name FROM catalog_items WHERE kind='FABRIC' AND id<>$1 ORDER BY display_order,id LIMIT 1",
      [fabric.id],
    )
  )[0];
  await choices.getByLabel(fabric.name, { exact: true }).check();
  await choices.getByRole('button', { name: 'บันทึกไซซ์และผ้า', exact: true }).click();
  await page.getByRole('button', { name: 'TEST NEW SHIRT', exact: true }).waitFor();
  // A no-image product must remain a compact name card, without placeholder text/box.
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click();
  await page.getByLabel('Catalog name', { exact: true }).fill('TEST NAME ONLY');
  await page.getByRole('button', { name: /Save item/ }).click();
  await page.getByRole('button', { name: /Back to catalog/ }).click();
  const plain = page.getByRole('button', { name: 'TEST NAME ONLY', exact: true });
  await plain.waitFor();
  assert.equal(await plain.locator('img,.catalog-placeholder').count(), 0);
  await page.screenshot({ path: 'test-results/catalog-entry-fixed.png', fullPage: true });
  // Owner sets the price explicitly; no free price is silently assigned.
  await nav('ราคาและส่วนลด');
  await page.getByText('ກຸ່ມລາຄາແຕ່ລະແບບ / Product price groups', { exact: true }).click();
  await page.getByLabel('Price group TEST NEW SHIRT', { exact: true }).selectOption('A');
  await page.getByText('ราคาเพิ่มของผ้า — ยังไม่มีราคาในเอกสาร', { exact: true }).click();
  await page.getByLabel('เพิ่มผ้า ' + fabric.name, { exact: true }).fill('0');
  const parts = await db.query(
    "SELECT id,name FROM catalog_items WHERE name IN ('ແຂນສັ້ນ','ບ່າທຳມະດາ','ປາຍແຂນປ່ອຍ')",
  );
  await page.getByText('ราคาเพิ่มส่วนประกอบเสื้อ', { exact: true }).click();
  for (const part of parts)
    await page.getByLabel('เพิ่มส่วนประกอบ ' + part.name, { exact: true }).fill('0');
  await page.getByText('คิดเพิ่มค่าผ้าของแต่ละส่วนประกอบ', { exact: true }).click();
  for (const part of parts)
    await page.getByLabel('ค่าผ้าส่วนประกอบ ' + part.name, { exact: true }).selectOption('OFF');
  await page
    .getByLabel('เหตุผลที่เปลี่ยนราคา', { exact: true })
    .fill('TEST ONLY: explicit price setup');
  const savedPrice = page.waitForResponse(
    (r) => r.url().endsWith('/pricing') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'บันทึกเป็นราคาฉบับใหม่', exact: true }).click();
  assert.equal((await savedPrice).status(), 200);
  await nav('ร่างออเดอร์');
  // Fresh imported collar lacks setup: owner can now configure it right here.
  const firstCollar = (
    await db.query(
      "SELECT id,name FROM catalog_items WHERE section='COLLAR' ORDER BY display_group,display_order LIMIT 1",
    )
  )[0];
  await page.getByLabel('แบบเสื้อ', { exact: true }).selectOption(firstCollar.id);
  await page.getByText('ຕັ້ງຄ່າແບບນີ້ / Set up this product', { exact: true }).waitFor();
  await page.getByText('ຕັ້ງຄ່າແບບນີ້ / Set up this product', { exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Product setup overflow',
  );
  await page.locator('.choices-panel').getByRole('button', { name: 'M', exact: true }).click();
  await page.locator('.choices-panel').getByLabel(fabric.name, { exact: true }).check();
  await page
    .locator('.choices-panel')
    .getByRole('button', { name: 'บันทึกไซซ์และผ้า', exact: true })
    .click();
  await page.getByLabel('Quantity M', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'TEST NEW SHIRT', exact: true }).click();
  await page
    .locator('.product-options')
    .getByRole('button', { name: fabric.name, exact: true })
    .click();
  await page.getByRole('button', { name: /Add selected sizes/ }).click();
  await page
    .getByRole('alert')
    .getByText(/Enter at least one size quantity/)
    .waitFor();
  await page.getByText(/To select a size, enter its quantity in the table/).waitFor();
  assert.equal(await page.locator('.draft-line').count(), 0);
  for (const [label, prefix] of [
    ['แขนเสื้อ', 'ແຂນ'],
    ['ปลายแขน', 'ປາຍແຂນ'],
    ['บ่าเสื้อ', 'ບ່າ'],
  ]) {
    await page
      .getByLabel(label, { exact: true })
      .selectOption(parts.find((p) => p.name.startsWith(prefix)).id);
    await page.getByRole('button', { name: 'Set fabrics: ' + label, exact: true }).click();
    await page.locator('.choices-panel').getByLabel(partFabric.name, { exact: true }).check();
    await page
      .locator('.choices-panel')
      .getByRole('button', { name: 'บันทึกไซซ์และผ้า', exact: true })
      .click();
    await page.getByLabel('ผ้าสำหรับ ' + label, { exact: true }).selectOption(partFabric.id);
  }
  await page.getByRole('button', { name: 'Increase M', exact: true }).click();
  await page.getByRole('button', { name: 'Increase M', exact: true }).click();
  await page.getByRole('button', { name: 'Decrease M', exact: true }).click();
  assert.equal(await page.getByLabel('Quantity M', { exact: true }).inputValue(), '1');
  await page.getByLabel('Quantity M', { exact: true }).fill('2');
  await page.getByLabel('Quantity L', { exact: true }).fill('3');
  assert.equal(await page.locator('.size-row-selected').count(), 2);
  await page.getByLabel('Quantity M', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: /Add selected sizes/ }).click();
  await page
    .getByRole('alert')
    .getByText(/Quantities must be whole numbers/)
    .waitFor();
  assert.equal(await page.locator('.draft-line').count(), 0);
  await page.getByLabel('Quantity M', { exact: true }).fill('2');
  await page.getByText('ຂອງແຖມແຍກຕາມ Size / Gifts by size', { exact: true }).click();
  await page.getByLabel('Gift quantity XL', { exact: true }).fill('1');
  await page.getByRole('button', { name: /Check selected prices/ }).click();
  await page
    .locator('.size-quantity-table')
    .getByText('110,000', { exact: true })
    .first()
    .waitFor();
  await page.setViewportSize({ width: 320, height: 900 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page
    .locator('.size-quantity-panel')
    .screenshot({ path: 'test-results/order-size-table-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let quoteRequestsDuringAdd = 0;
  await page.route('**/api/v1/pricing/quote', async (route) => {
    quoteRequestsDuringAdd++;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: /Add selected sizes/ }).click();
  assert.equal(await page.locator('.draft-line').count(), 3);
  assert.equal(
    quoteRequestsDuringAdd,
    0,
    'Adding selected sizes should not depend on a price request',
  );
  await page.unroute('**/api/v1/pricing/quote');
  await page.getByLabel('ชื่อลูกค้าของร่าง', { exact: true }).fill('TEST CUSTOMER ONLY');
  await page.getByLabel('เบอร์ลูกค้าของร่าง', { exact: true }).fill('02055551234');
  await page.getByLabel('แบรนด์ของร่าง', { exact: true }).selectOption('JAZMINE_STANDARD');
  await page
    .getByLabel('Customer artwork', { exact: true })
    .setInputFiles({ name: 'customer-shirt.png', mimeType: 'image/png', buffer: original });
  await page.getByAltText('Customer artwork preview', { exact: true }).waitFor();
  await page.getByLabel('เบอร์ลูกค้าของร่าง', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page
    .getByRole('alert')
    .getByText(/at least 6 digits/)
    .waitFor();
  assert.equal((await db.query('SELECT id FROM order_drafts')).length, 0);
  await page.getByLabel('เบอร์ลูกค้าของร่าง', { exact: true }).fill('02055551234');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Order overflow ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/order-entry-fixed-mobile.png', fullPage: true });
  // Drop responses after each commit: retry must preserve both draft version and artwork ID.
  let droppedDraft = false,
    droppedArtwork = false;
  await page.route('**/api/v1/order-drafts/*', async (route) => {
    if (route.request().method() === 'PUT' && !droppedDraft) {
      droppedDraft = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.route('**/api/v1/graphic-assets/*', async (route) => {
    if (route.request().method() === 'PUT' && !droppedArtwork) {
      droppedArtwork = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page.getByRole('button', { name: /Retry draft and artwork/ }).click();
  await page.getByText(/Draft saved; artwork upload is not yet confirmed/).waitFor();
  await page.getByRole('button', { name: /Retry draft and artwork/ }).click();
  await page.getByRole('heading', { name: 'บันทึกร่างแล้ว', exact: true }).waitFor();
  const draft = (
    await db.query('SELECT id,row_version,input_json,quote_json FROM order_drafts')
  )[0];
  assert.equal(Number(draft.row_version), 1);
  assert.equal(draft.input_json.lines.length, 3);
  assert.deepEqual(
    draft.input_json.lines.map((l) => [l.size, l.quantity, l.freeQuantity]),
    [
      ['M', 2, 0],
      ['L', 3, 0],
      ['XL', 0, 1],
    ],
  );
  assert(
    draft.input_json.lines.every(
      (l) => l.parts.length === 3 && l.parts.every((p) => p.fabricId === partFabric.id),
    ),
  );
  assert.equal(draft.quote_json.productionQuantity, 6);
  const uploaded = await db.query("SELECT id,status FROM graphic_assets WHERE kind='MOCKUP'");
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].status, 'APPROVED');
  assert.equal((await db.query('SELECT * FROM customers')).length, 0);
  // Required artwork/availability are set in the isolated fixture only; confirmation still checks them.
  await db.query("UPDATE catalog_items SET availability='AVAILABLE' WHERE id=ANY($1::uuid[])", [
    [fabric.id, partFabric.id],
  ]);
  const assets = new AssetService(db),
    png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
  for (const kind of ['NECK_LABEL', 'NECK_TAPE']) {
    const id = randomUUID();
    await assets.uploadLibrary(login.user, id, null, {
      kind,
      filename: kind + '.png',
      base64: png.toString('base64'),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('กำหนดส่งสินค้า', { exact: true }).fill(businessDate());
  await page.getByRole('button', { name: 'ตรวจความพร้อมก่อนยืนยัน', exact: true }).click();
  await page.getByLabel('เหตุผลการยืนยัน', { exact: true }).fill('TEST ONLY: new manual product');
  await page.getByRole('button', { name: 'ยืนยันออเดอร์', exact: true }).click();
  await page.getByText(/ยืนยันสำเร็จ ·/).waitFor();
  assert.equal((await db.query('SELECT * FROM orders')).length, 1);
  // Upload-only path: valid QR is checked automatically; missing steps explain disabled Save.
  await nav('QR ຮັບເງິນ / Shop payment QR');
  const bank = await fixtureBankInput('LAK');
  await page
    .getByLabel('Bank QR image', { exact: true })
    .setInputFiles({ name: bank.input.filename, mimeType: 'image/png', buffer: bank.bytes });
  await page.getByAltText('Bank QR preview to verify in bank app', { exact: true }).waitFor();
  await page.getByLabel('Payment QR bank name').fill(bank.input.bankName);
  await page.getByLabel('Payment QR recipient name').fill(bank.input.receiverName);
  await page.getByLabel('Payment QR account reference').fill(bank.input.accountReference);
  await page.getByLabel('Enable payment QR on new invoices').check();
  await page.getByLabel('Payment QR change reason').fill('TEST ONLY');
  await page.getByRole('button', { name: /Save payment QR/ }).click();
  await page
    .getByRole('alert')
    .getByText(/Complete these steps to save/)
    .waitFor();
  assert.equal((await db.query('SELECT * FROM payment_qr_versions')).length, 0);
  await page
    .getByLabel('Payment QR steps')
    .getByText(/Check the preview in the bank app/)
    .waitFor();
  await page.getByLabel('Verified payment QR in bank app').check();
  assert(!(await page.getByRole('button', { name: /Save payment QR/ }).isDisabled()));
  await page.getByRole('button', { name: /Save payment QR/ }).click();
  await page.getByRole('heading', { name: /LAK.*v1/ }).waitFor();
  await page
    .getByRole('status')
    .getByText(/Payment QR saved \(LAK\)/)
    .waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'QR overflow ' + width,
    );
  }
  await page.screenshot({
    path: 'test-results/payment-qr-upload-fixed-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: fresh catalog -> explicit sizes/fabrics/prices -> multi-size quantity table and part fabrics -> staged customer artwork -> draft/upload lost-response retries without duplicates -> confirmed order; invalid quantities/phone rejected; QR actionable validation and saved feedback; 320/390 px; isolated test data only.',
  );
} catch (e) {
  if (page) {
    await page
      .screenshot({ path: 'test-results/catalog-order-entry-failure.png', fullPage: true })
      .catch(() => {});
    console.error(
      (
        await page
          .locator('main')
          .innerText()
          .catch(() => '')
      ).slice(-3500),
    );
  }
  throw e;
} finally {
  await browser?.close();
  if (vite && vite.exitCode === null) {
    const done = new Promise((resolve) => vite.once('exit', resolve));
    vite.kill();
    await done;
  }
  await app?.close();
  await db.close();
}
