import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { Database } = require('../../dist/apps/server/src/database.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const port = 5174;
const apiPort = 3101;
const db = await Database.open({ dataDir: ':memory:' });
await db.migrate();
const app = await createApplication(
  { production: false, origin: `http://localhost:${port}`, port: apiPort, dataDir: ':memory:' },
  db,
  false,
);
await app.listen(apiPort, '127.0.0.1');
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.mts', '--port', String(port)],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, JAZMINE_API_TARGET: `http://127.0.0.1:${apiPort}` },
  },
);
let serverOutput = '';
vite.stderr.on('data', (bytes) => {
  serverOutput += bytes;
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Vite did not start: ' + serverOutput)),
      20_000,
    );
    vite.stdout.on('data', (bytes) => {
      if (bytes.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vite.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Vite exited: ' + code + serverOutput));
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
  const page = await context.newPage();
  const errors = [];
  const throttled = [];
  page.on('response', (r) => {
    if (r.status() === 429) throttled.push(new URL(r.url()).pathname);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const password = randomBytes(18).toString('base64url');
  const staffPassword = randomBytes(18).toString('base64url');
  const newPassword = randomBytes(18).toString('base64url');
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('[name=displayName]').waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/first-owner-setup.png', fullPage: true });
  await page.locator('[name=displayName]').fill('เจ้าของสำหรับตรวจระบบ');
  await page.locator('[name=username]').fill('owner.test');
  await page.locator('[name=password]').fill(password);
  await page.locator('form button[type=submit], form button.primary').click();
  await page.getByRole('button', { name: 'จัดการทีมงาน', exact: true }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/owner-dashboard.png', fullPage: true });
  await page.locator('nav').getByRole('button', { name: 'สินค้าและชนิดผ้า', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click();
  await page.getByLabel('Catalog name', { exact: true }).fill('เสื้อกีฬาทดสอบ');
  await page.getByRole('button', { name: /Save item/ }).click();
  await page.getByRole('heading', { name: 'ไซซ์และผ้าที่ใช้ได้', exact: true }).waitFor();
  await page.getByLabel('Catalog image', { exact: true }).setInputFiles({
    name: 'shirt.png',
    mimeType: 'image/png',
    buffer: await sharp({ create: { width: 30, height: 30, channels: 3, background: '#d32f2f' } })
      .png()
      .toBuffer(),
  });
  await page.getByAltText('Selected item preview', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Save item/ }).click();
  await page.getByRole('button', { name: /Back to catalog/ }).click();
  await page.getByRole('img', { name: 'เสื้อกีฬาทดสอบ' }).waitFor();
  assert.equal((await db.query('SELECT name FROM catalog_items')).length, 1);
  await page.screenshot({ path: 'test-results/catalog-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/catalog-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { importAttachedCatalog } = require('../../dist/apps/server/src/catalog/import-catalog.js');
  assert.equal(await importAttachedCatalog(db), 42);
  const { seedPricing } = require('../../dist/apps/server/src/pricing/seed-pricing.js');
  assert.equal(await seedPricing(db), true);
  await page.reload();
  await page.locator('nav').getByRole('button', { name: 'สินค้าและชนิดผ้า', exact: true }).click();
  await page.getByRole('heading', { name: 'ຄໍເສື້ອ · แบบคอเสื้อ', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.collar-group h3').allTextContents(), [
    'ชุด 1',
    'ชุด 2',
    'ชุด 3',
  ]);
  assert.equal(await page.locator('.collar-group .catalog-card').count(), 16);
  assert.equal(await page.locator('.fabric-grid .catalog-card').count(), 20);
  await page.evaluate(() =>
    document.querySelectorAll('.imported-catalog img').forEach((i) => {
      i.loading = 'eager';
    }),
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.imported-catalog img')].length === 23 &&
      [...document.querySelectorAll('.imported-catalog img')].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
  );
  await page.screenshot({ path: 'test-results/imported-catalog-desktop.png', fullPage: true });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/imported-catalog-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: 'ລູກຄ້າປະຈຳ', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'สินค้าและชนิดผ้า', exact: true }).click();
  await page.locator('.collar-group .catalog-card').first().click();
  await page.getByLabel('ไซซ์ที่เปิดให้เลือก (คั่นด้วยเครื่องหมาย ,)').fill('S, M, L, XL');
  await page.locator('.fabric-checks input').first().check();
  const choicesSaved = page.waitForResponse(
    (r) => r.url().endsWith('/choices') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'บันทึกไซซ์และผ้า', exact: true }).click();
  const choicesResponse = await choicesSaved;
  assert.equal(choicesResponse.status(), 200, await choicesResponse.text());
  await page.locator('.collar-group .catalog-card').first().click();
  assert.equal(
    await page.getByLabel('ไซซ์ที่เปิดให้เลือก (คั่นด้วยเครื่องหมาย ,)').inputValue(),
    'S, M, L, XL',
  );
  assert.equal(await page.locator('.fabric-checks input:checked').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/catalog-choices-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: 'ราคาและส่วนลด', exact: true }).click();
  await page.getByRole('heading', { name: 'ราคาพื้นฐานตามกลุ่มคอเสื้อ', exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('ราคา AGENT_LEVEL_4 A', { exact: true }).inputValue(),
    '80000',
  );
  await page.getByText('ราคาเพิ่มของผ้า — ยังไม่มีราคาในเอกสาร', { exact: true }).click();
  await page.locator('details .pricing-fields input').first().fill('0');
  await page
    .getByLabel('เหตุผลที่เปลี่ยนราคา', { exact: true })
    .fill('ยืนยันผ้าตัวแรกไม่คิดเพิ่ม สำหรับทดสอบ');
  const pricingSaved = page.waitForResponse(
    (r) => r.url().endsWith('/pricing') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'บันทึกเป็นราคาฉบับใหม่', exact: true }).click();
  assert.equal((await pricingSaved).status(), 200);
  const configuredProduct = (
    await db.query('SELECT item_id FROM catalog_item_sizes ORDER BY item_id LIMIT 1')
  )[0].item_id;
  await page.getByLabel('แบบเสื้อ', { exact: true }).selectOption(configuredProduct);
  await page.getByLabel('ไซซ์', { exact: true }).selectOption('M');
  const firstFabric = (
    await db.query(
      "SELECT id FROM catalog_items WHERE kind='FABRIC' ORDER BY display_group,display_order,id LIMIT 1",
    )
  )[0].id;
  await page.getByLabel('เนื้อผ้า', { exact: true }).selectOption(firstFabric);
  await page.getByLabel('จำนวนที่คิดเงิน', { exact: true }).fill('10');
  await page.getByLabel('ของแถม (จำนวน)', { exact: true }).fill('1');
  await page.getByLabel('ลดเปอร์เซ็นต์', { exact: true }).fill('10');
  await page.getByLabel('ลดจำนวนเงิน (กีบ)', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'ทดลองคำนวณ', exact: true }).click();
  await page.getByText('ยอดเฉพาะตัวเสื้อและผ้าหลังลด 940,000 กีบ', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/pricing-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('ราคาเพิ่มส่วนประกอบเสื้อ', { exact: true }).click();
  await page.getByLabel('เพิ่มส่วนประกอบ ແຂນຍາວ', { exact: true }).fill('10000');
  await page.getByText('อัตราแลกเปลี่ยน THB / USD', { exact: true }).click();
  await page.getByLabel('อัตรา THB', { exact: true }).fill('600');
  await page
    .getByLabel('เหตุผลที่เปลี่ยนราคา', { exact: true })
    .fill('กำหนดราคาแขนยาวและอัตราแลกเปลี่ยนทดสอบ');
  const extraSaved = page.waitForResponse(
    (r) => r.url().endsWith('/pricing') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'บันทึกเป็นราคาฉบับใหม่', exact: true }).click();
  assert.equal((await extraSaved).status(), 200);
  const sleeveId = (await db.query("SELECT id FROM catalog_items WHERE name='ແຂນຍາວ'"))[0].id;
  await page.getByLabel('แขนเสื้อ', { exact: true }).selectOption(sleeveId);
  await page.getByLabel('สกุลเงิน', { exact: true }).selectOption('THB');
  await page.getByRole('button', { name: 'ทดลองคำนวณ', exact: true }).click();
  await page.getByText('ยอดรวมส่วนที่เลือกหลังลด 1,030,000 กีบ', { exact: true }).waitFor();
  await page.getByText(/ยอดแสดง 1716.67 THB/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/pricing-parts-fx-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('ซื้อครบแถมอัตโนมัติ', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'เปิดใช้กติกาซื้อครบแถม', exact: true }).check();
  await page.getByLabel('ซื้อครบกี่ตัว', { exact: true }).fill('10');
  await page.getByLabel('แถมกี่ตัว', { exact: true }).fill('1');
  await page.getByLabel('เพิ่มส่วนประกอบ ແຂນສັ້ນ', { exact: true }).fill('0');
  await page.getByLabel('เพิ่มส่วนประกอบ ບ່າທຳມະດາ', { exact: true }).fill('0');
  await page.getByLabel('เพิ่มส่วนประกอบ ປາຍແຂນປ່ອຍ', { exact: true }).fill('0');
  await page.getByLabel('เหตุผลที่เปลี่ยนราคา', { exact: true }).fill('ตั้งซื้อ10แถม1สำหรับทดสอบ');
  const promotionSaved = page.waitForResponse(
    (r) => r.url().endsWith('/pricing') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'บันทึกเป็นราคาฉบับใหม่', exact: true }).click();
  assert.equal((await promotionSaved).status(), 200);
  const customersBeforeDraft = (await db.query('SELECT id FROM customers')).length;
  await page.locator('nav').getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
  await page.getByLabel('ชื่อลูกค้าของร่าง', { exact: true }).fill('ขาจรสำหรับทดสอบร่าง');
  await page.getByLabel('เบอร์ลูกค้าของร่าง', { exact: true }).fill('02055558888');
  await page.getByLabel('แบบเสื้อ', { exact: true }).selectOption(configuredProduct);
  const draftFabricName = (
    await db.query('SELECT name FROM catalog_items WHERE id=$1', [firstFabric])
  )[0].name;
  await page
    .locator('.product-options')
    .getByRole('button', { name: draftFabricName, exact: true })
    .click();
  await page.getByLabel('Quantity M', { exact: true }).fill('6');
  await page.getByLabel('Quantity L', { exact: true }).fill('4');
  const requiredComponentNames = [
    ['แขนเสื้อ', 'ແຂນສັ້ນ'],
    ['บ่าเสื้อ', 'ບ່າທຳມະດາ'],
    ['ปลายแขน', 'ປາຍແຂນປ່ອຍ'],
  ];
  for (const [label, name] of requiredComponentNames) {
    const componentId = (await db.query('SELECT id FROM catalog_items WHERE name=$1', [name]))[0]
      .id;
    await page.getByLabel(label, { exact: true }).selectOption(componentId);
  }
  await page.getByRole('button', { name: /Add selected sizes/ }).click();
  await page.getByRole('checkbox', { name: 'ใช้ของแถมอัตโนมัติทั้งร่าง', exact: true }).check();
  await page.getByLabel('แถมรายการ 2', { exact: true }).fill('1');
  await page.getByLabel('ลดเปอร์เซ็นต์ทั้งร่าง', { exact: true }).fill('10');
  await page.getByLabel('ลดเงินทั้งร่าง', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'ตรวจยอดรวมร่าง', exact: true }).click();
  await page.getByText('ยอดรวมร่างหลังลด 940,000 กีบ', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/order-draft-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page.getByRole('heading', { name: 'บันทึกร่างแล้ว', exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM order_drafts')).length, 1);
  assert.equal((await db.query('SELECT id FROM customers')).length, customersBeforeDraft);
  await page.reload();
  await page.getByRole('button', { name: 'เปิดหรือปิดเมนู', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
  await page.getByText('ร่างที่บันทึกไว้ล่าสุด (สูงสุด 50 รายการ)', { exact: true }).click();
  await page.getByRole('button', { name: /ขาจรสำหรับทดสอบร่าง ·/ }).click();
  await page.getByRole('heading', { name: 'บันทึกร่างแล้ว', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: 'สินค้าและชนิดผ้า', exact: true }).click();
  const fabricName = (
    await db.query('SELECT name FROM catalog_items WHERE id=$1', [firstFabric])
  )[0].name;
  await page.getByRole('button', { name: fabricName, exact: true }).click();
  await page.getByLabel('สถานะผ้า', { exact: true }).selectOption('AVAILABLE');
  await page
    .getByLabel('เหตุผลที่เปลี่ยนสถานะผ้า', { exact: true })
    .fill('ตรวจผ้าพร้อมใช้สำหรับทดสอบ');
  await page.getByRole('button', { name: 'บันทึกสถานะผ้า', exact: true }).click();
  await page.getByRole('heading', { name: 'สินค้าและชนิดผ้า', exact: true }).waitFor();
  await page.locator('nav').getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
  await page.getByText('ร่างที่บันทึกไว้ล่าสุด (สูงสุด 50 รายการ)', { exact: true }).click();
  await page.getByRole('button', { name: /ขาจรสำหรับทดสอบร่าง ·/ }).click();
  await page.getByRole('button', { name: 'แก้ไขร่าง', exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).isDisabled(),
    true,
  );
  await page.getByLabel('จำนวนซื้อรายการ 2', { exact: true }).fill('5');
  await page.getByLabel('เหตุผลที่แก้ร่าง', { exact: true }).fill('ลูกค้าเพิ่มไซซ์ L อีกหนึ่งตัว');
  await page.getByLabel('แบรนด์ของร่าง', { exact: true }).selectOption('JAZMINE_STANDARD');
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page.getByRole('heading', { name: 'บันทึกร่างแล้ว', exact: true }).waitFor();
  await page.getByText('ป้ายคอ — ยังไม่มีไฟล์', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM order_drafts')).length, 1);
  assert.equal((await db.query('SELECT row_version FROM order_drafts'))[0].row_version, 2);
  await page.screenshot({ path: 'test-results/multi-draft-review.png', fullPage: true });
  async function printArtwork(label) {
    const data = await page.evaluate((label) => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 700;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 900, 700);
      ctx.fillStyle = '#ed3345';
      ctx.beginPath();
      ctx.moveTo(310, 100);
      ctx.lineTo(180, 170);
      ctx.lineTo(100, 330);
      ctx.lineTo(250, 385);
      ctx.lineTo(270, 285);
      ctx.lineTo(270, 600);
      ctx.lineTo(630, 600);
      ctx.lineTo(630, 285);
      ctx.lineTo(650, 385);
      ctx.lineTo(800, 330);
      ctx.lineTo(720, 170);
      ctx.lineTo(590, 100);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#192b48';
      ctx.fillRect(270, 370, 360, 230);
      ctx.beginPath();
      ctx.ellipse(450, 100, 100, 50, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('JAZMINE / TEST', 450, 320);
      ctx.fillStyle = '#192b48';
      ctx.font = '28px sans-serif';
      ctx.fillText(label, 450, 660);
      return canvas.toDataURL('image/png').split(',')[1];
    }, label);
    return Buffer.from(data, 'base64');
  }
  const { AssetService } = require('../../dist/apps/server/src/assets/asset-service.js');
  const {
    AuthService,
  } = require('../../dist/apps/server/src/identity/application/auth-service.js');
  const owner = (await new AuthService(db, true).login('owner.test', password, '127.0.0.1')).user;
  const assets = new AssetService(db);
  for (const [kind, label] of [
    ['NECK_LABEL', 'ป้ายคอ'],
    ['NECK_TAPE', 'เทปคอ'],
  ]) {
    await assets.uploadLibrary(owner, randomUUID(), null, {
      kind,
      filename: label + '.png',
      base64: (await printArtwork(label)).toString('base64'),
    });
  }
  await page.getByRole('button', { name: 'โหลดไฟล์ล่าสุด' }).click();
  for (const label of ['แบบตัวอย่าง']) {
    await page.getByLabel('แนบ' + label, { exact: true }).setInputFiles({
      name: label + '.png',
      mimeType: 'image/png',
      buffer: await printArtwork(label),
    });
    await page.getByRole('button', { name: /Save mockup/ }).click();
    await page
      .getByText(/ฉบับล่าสุด · ผ่านตรวจแล้ว/)
      .last()
      .waitFor();
  }
  await page
    .getByText('ไฟล์ล่าสุดผ่านตรวจครบสำหรับร่างฉบับ 2 · ยังไม่ใช่การยืนยันออเดอร์', { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/graphic-assets-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('กำหนดส่งสินค้า', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: 'ตรวจความพร้อมก่อนยืนยัน', exact: true }).click();
  await page.getByLabel('เหตุผลการยืนยัน', { exact: true }).fill('ตรวจรายการราคาและไฟล์ครบแล้ว');
  let droppedConfirm = false;
  await page.route('**/api/v1/orders/confirm', async (route) => {
    if (!droppedConfirm) {
      droppedConfirm = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'ยืนยันออเดอร์', exact: true }).click();
  await page.getByRole('button', { name: 'ลองยืนยันคำขอเดิม', exact: true }).click();
  await page.getByText('ยอดสุทธิ 1,039,000 กีบ', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM orders')).length, 1);
  assert.equal((await db.query('SELECT id FROM order_revisions')).length, 1);
  assert.equal((await db.query('SELECT * FROM business_counters WHERE last_value<>1')).length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/order-confirmed-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'แก้ไขร่าง', exact: true }).click();
  await page
    .getByLabel('เหตุผลที่แก้ร่าง', { exact: true })
    .fill('เปลี่ยนรายละเอียดงาน ต้องตรวจแบบใหม่');
  await page.getByRole('button', { name: 'บันทึกร่างออเดอร์', exact: true }).click();
  await page
    .getByText('แบบตัวอย่าง — ข้อมูลร่างเปลี่ยน ต้องส่งและตรวจฉบับใหม่', { exact: true })
    .waitFor();
  await page.locator('nav').getByRole('button', { name: 'ไฟล์และงานกราฟิก', exact: true }).click();
  const assetDraftId = (await db.query('SELECT id FROM order_drafts'))[0].id;
  await page.getByLabel('ร่างที่ต้องตรวจ', { exact: true }).selectOption(assetDraftId);
  await page
    .getByText('แบบตัวอย่าง — ข้อมูลร่างเปลี่ยน ต้องส่งและตรวจฉบับใหม่', { exact: true })
    .waitFor();
  await page.locator('nav').getByRole('button', { name: 'ລູກຄ້າປະຈຳ', exact: true }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: 'ออเดอร์ที่ยืนยันแล้ว', exact: true })
    .click();
  await page.getByRole('button', { name: /JAZ-.*ขาจรสำหรับทดสอบร่าง/ }).click();
  await page.getByText('ยอดสุทธิ 1,039,000 กีบ', { exact: true }).waitFor();
  await page.locator('.invoice-print').screenshot({ path: 'test-results/invoice-confirmed.png' });
  await page.locator('nav').getByRole('button', { name: 'เตรียมใบผลิต', exact: true }).click();
  const productionOrderId = (await db.query('SELECT id FROM orders'))[0].id;
  await page.getByLabel('ออเดอร์ที่ต้องเตรียม', { exact: true }).selectOption(productionOrderId);
  await page.getByRole('button', { name: 'สร้างใบผลิตร่างใหม่', exact: true }).click();
  await page.getByLabel('จัดผลิตรายการ 1', { exact: true }).fill('3');
  await page.getByLabel('จัดผลิตรายการ 2', { exact: true }).fill('2');
  await page
    .getByLabel('หมายเหตุใบผลิต', { exact: true })
    .fill('เอกสารตัวอย่างจากข้อมูลทดสอบ · แบ่งผลิตชุดแรกตามกำหนดส่ง');
  await page.getByLabel('ความเร่งด่วนใบผลิต', { exact: true }).selectOption('URGENT');
  await page.getByRole('button', { name: 'เพิ่มชื่อและเบอร์เสื้อ', exact: true }).click();
  await page.getByLabel('ชื่อบนเสื้อ 1', { exact: true }).fill('ສົມພອນ');
  await page.getByLabel('เบอร์บนเสื้อ 1', { exact: true }).fill('07');
  await page.getByLabel('เหตุผลใบผลิต', { exact: true }).fill('เตรียมชุดแรก');
  await page.getByRole('button', { name: 'บันทึกร่างใบผลิต', exact: true }).click();
  await page.getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true })
      .isDisabled(),
    true,
  );
  const productionParts = [
    ['BODY', 'ตัวเสื้อด้านหน้า'],
    ['BODY_BACK', 'ตัวเสื้อด้านหลัง'],
    ['COLLAR', 'คอเสื้อ'],
    ['SLEEVE_LEFT', 'แขนซ้าย'],
    ['SLEEVE_RIGHT', 'แขนขวา'],
    ['CUFF_LEFT', 'ปลายแขนซ้าย'],
    ['CUFF_RIGHT', 'ปลายแขนขวา'],
    ['SHOULDER', 'บ่าเสื้อ'],
  ];
  for (const [part, label] of productionParts) {
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll('input[type=file]')].some(
          (e) => e.getAttribute('aria-label') === 'ไฟล์' + label && !e.disabled,
        ),
      label,
    );
    await page.getByLabel('ไฟล์' + label, { exact: true }).setInputFiles({
      name: part + '.png',
      mimeType: 'image/png',
      buffer: await printArtwork(part),
    });
    await page.getByText(part + '.png · ไฟล์ฉบับ 1', { exact: true }).waitFor();
  }
  await page.getByLabel('เหตุผลใบผลิต', { exact: true }).fill('ตรวจข้อมูลจำนวนผ้าและชิ้นงานครบ');
  await page.getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true }).click();
  await page.getByText('สถานะ ใบผลิตพร้อม · ฉบับที่ออกแล้ว 1', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT state FROM production_sheets'))[0].state, 'READY');
  assert.equal((await db.query('SELECT * FROM production_sheet_versions')).length, 1);
  assert.equal((await page.locator('body').innerText()).includes('1,039,000'), false);
  const printLink = page.getByRole('link', { name: 'เปิด A4 / บันทึก PDF ฉบับ 1', exact: true });
  const printUrl = new URL(await printLink.getAttribute('href'), page.url()).href;
  const printPage = await context.newPage();
  printPage.on('pageerror', (e) => errors.push(e.message));
  await printPage.goto(printUrl);
  await printPage.locator('.ps-print-root[data-ready="true"]').waitFor({ timeout: 60000 });
  assert.equal(await printPage.locator('.ps-page').count(), 2);
  assert.match(await printPage.locator('.ps-size-table tbody tr').nth(0).innerText(), /6\s+6\s+12/);
  assert.match(await printPage.locator('.ps-act').innerText(), /3\s+2\s+5/);
  assert.match(await printPage.locator('.ps-names-table').first().innerText(), /ສົມພອນ/);
  assert.equal((await printPage.locator('body').innerText()).includes('1,039,000'), false);
  await printPage.emulateMedia({ media: 'print' });
  const pageSizes = await printPage.locator('.ps-page').evaluateAll((nodes) =>
    nodes.map((node) => ({
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
    })),
  );
  for (const size of pageSizes) {
    assert.ok(size.height <= 1063, JSON.stringify(pageSizes));
    assert.ok(Math.abs(size.width - 733.2) < 2);
  }
  await mkdir('output/pdf', { recursive: true });
  await printPage.pdf({
    path: 'output/pdf/JAZMINE_PRODUCTION_SAMPLE.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  await printPage
    .locator('.ps-page')
    .first()
    .screenshot({ path: 'test-results/production-a4-page-1.png' });
  await printPage.setViewportSize({ width: 390, height: 844 });
  await printPage.emulateMedia({ media: 'screen' });
  assert.equal(
    await printPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await printPage.close();

  // PDF ชิ้นงานหลายหน้าต้องอยู่ครบในภาคผนวก และฉบับเก่ายังผูกกับไฟล์เดิม
  const pdfFixturePage = await context.newPage();
  await pdfFixturePage.setContent(
    '<style>@page{size:A4;margin:16mm}section{break-after:page;font:36px sans-serif}section:last-child{break-after:auto}</style><section>COLLAR STAND / PAGE 1</section><section>COLLAR STAND / PAGE 2</section>',
  );
  const pdfFixture = await pdfFixturePage.pdf({ preferCSSPageSize: true });
  await pdfFixturePage.close();
  await page.getByLabel('เหตุผลใบผลิต', { exact: true }).fill('เพิ่มไฟล์คอน้อย PDF สองหน้า');
  await page.getByRole('button', { name: 'เปิดแก้เป็นร่างฉบับใหม่', exact: true }).click();
  await page
    .getByLabel('ไฟล์คอน้อย (ถ้ามี)', { exact: true })
    .setInputFiles({ name: 'collar-stand.pdf', mimeType: 'application/pdf', buffer: pdfFixture });
  await page.getByText('collar-stand.pdf · ไฟล์ฉบับ 1', { exact: true }).waitFor();
  await page.getByLabel('เหตุผลใบผลิต', { exact: true }).fill('ตรวจไฟล์สองหน้าครบ');
  await page.getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true }).click();
  await page.getByText('สถานะ ใบผลิตพร้อม · ฉบับที่ออกแล้ว 2', { exact: true }).waitFor();
  const pdfPrint = await context.newPage();
  pdfPrint.on('pageerror', (e) => errors.push(e.message));
  await pdfPrint.goto(printUrl.replace('version=1', 'version=2'));
  await pdfPrint.locator('.ps-print-root[data-ready="true"]').waitFor({ timeout: 60000 });
  assert.equal(await pdfPrint.locator('.ps-page').count(), 4);
  assert.equal(await pdfPrint.locator('.ps-attachment-page').count(), 2);
  await pdfPrint.pdf({
    path: 'test-results/production-pdf-attachments.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  await pdfPrint.goto(printUrl);
  await pdfPrint.locator('.ps-print-root[data-ready="true"]').waitFor({ timeout: 60000 });
  assert.match(
    await pdfPrint.locator('.ps-document-warning').first().innerText(),
    /ສະບັບເກົ່າ \/ SUPERSEDED/,
  );
  assert.equal(await pdfPrint.locator('.ps-attachment-page').count(), 0);
  await pdfPrint.close();
  const stressPrint = await context.newPage();
  stressPrint.on('pageerror', (e) => errors.push(e.message));
  const stressVersion = (
    await db.query('SELECT snapshot FROM production_sheet_versions WHERE version=2')
  )[0].snapshot;
  const stressSnapshot = structuredClone(stressVersion);
  stressSnapshot.printDetails.names = Array.from({ length: 50 }, (_, i) => ({
    lineIndex: 0,
    name: 'ສົມພອນ ຊື່ຍາວ / ชื่อสำหรับทดสอบการตัดบรรทัด '.repeat(3).slice(0, 80),
    number: String(i).padStart(20, '0'),
  }));
  stressSnapshot.context.customerName = 'ลูกค้าทดสอบชื่อยาว '.repeat(6).slice(0, 100);
  stressSnapshot.context.lines = Array.from({ length: 20 }, (_, i) => ({
    ...stressSnapshot.context.lines[0],
    lineIndex: i,
    size: 'SIZE-' + i,
    quantity: 100,
  }));
  stressSnapshot.allocations = [{ lineIndex: 0, quantity: 50 }];
  stressSnapshot.notes = 'คำสั่งงานหลายบรรทัด\n'.repeat(100);
  await stressPrint.route('**/production/sheets/*/history', (route) =>
    route.fulfill({
      json: {
        state: 'READY',
        currentVersion: 2,
        stale: false,
        versions: [{ version: 2, issuedAt: stressSnapshot.issuedAt, snapshot: stressSnapshot }],
      },
    }),
  );
  await stressPrint.goto(printUrl.replace('version=1', 'version=2'));
  await stressPrint.locator('.ps-print-root[data-ready="true"]').waitFor({ timeout: 60000 });
  await stressPrint.emulateMedia({ media: 'print' });
  const stressSizes = await stressPrint
    .locator('.ps-page')
    .evaluateAll((nodes) =>
      nodes.map((node, i) => ({ page: i + 1, height: node.getBoundingClientRect().height })),
    );
  for (const size of stressSizes) assert.ok(size.height <= 1063, JSON.stringify(stressSizes));
  assert.equal(await stressPrint.locator('.ps-names-table tbody tr').count(), 50);
  await stressPrint.pdf({
    path: 'test-results/production-long-content.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  await stressPrint.close();
  // เจ้าของเริ่มงานได้ทุกแผนก การทำงานซ้อนกันต้องไม่ปิดแผนกก่อนหน้าเอง
  const workPage = await context.newPage();
  workPage.on('pageerror', (e) => errors.push(e.message));
  await workPage.goto(
    `http://127.0.0.1:${port}/?productionWork=${(await db.query('SELECT id FROM production_sheets'))[0].id}`,
  );
  await workPage.getByLabel('Note PRINTING', { exact: true }).fill('เริ่มพิมพ์ตาม PS v2');
  let lostWorkResponse = false;
  await workPage.route('**/production-work/jobs/*/stages/PRINTING', async (route) => {
    if (!lostWorkResponse) {
      lostWorkResponse = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await workPage.getByRole('button', { name: 'Start PRINTING', exact: true }).click();
  await workPage.getByRole('button', { name: 'Retry PRINTING', exact: true }).click();
  const printingCard = workPage.getByRole('article', { name: 'PRINTING', exact: true });
  await printingCard.getByText('ກຳລັງເຮັດ / In progress', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM production_stage_events')).length, 1);
  await workPage.getByLabel('Note HEAT_TRANSFER', { exact: true }).fill('รับงานรีดส่วนแรก');
  await workPage.getByRole('button', { name: 'Start HEAT_TRANSFER', exact: true }).click();
  const heatCard = workPage.getByRole('article', { name: 'HEAT_TRANSFER', exact: true });
  await heatCard.getByText('ກຳລັງເຮັດ / In progress', { exact: true }).waitFor();
  await workPage.getByLabel('Note HEAT_TRANSFER', { exact: true }).fill('รอพิมพ์ให้ครบก่อนจบ');
  assert.equal(
    await workPage
      .getByRole('button', { name: 'Complete HEAT_TRANSFER', exact: true })
      .isDisabled(),
    true,
  );
  assert.match(await printingCard.innerText(), /In progress/);
  await workPage.getByLabel('Note PRINTING', { exact: true }).fill('พิมพ์ครบแล้ว ส่งต่องานรีด');
  await workPage.getByRole('button', { name: 'Complete PRINTING', exact: true }).click();
  await printingCard.getByText('ສຳເລັດ / Completed', { exact: true }).waitFor();
  await workPage.getByRole('button', { name: 'Complete HEAT_TRANSFER', exact: true }).click();
  await heatCard.getByText('ສຳເລັດ / Completed', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM production_stage_events')).length, 4);
  await workPage.getByRole('button', { name: 'Start LASER', exact: true }).click();
  await workPage
    .getByRole('article', { name: 'LASER', exact: true })
    .getByText('ກຳລັງເຮັດ / In progress', { exact: true })
    .waitFor();
  assert.equal(
    (await db.query("SELECT reason FROM production_stage_events WHERE department='LASER'"))[0]
      .reason,
    '',
  );
  await workPage.screenshot({ path: 'test-results/production-work-owner.png', fullPage: true });
  const reportForm = workPage.getByRole('form', { name: 'Report issue', exact: true });
  await reportForm.getByLabel('Issue department', { exact: true }).selectOption('LASER');
  await reportForm.getByLabel('Issue category', { exact: true }).selectOption('DAMAGE');
  await reportForm.getByLabel('Issue mode', { exact: true }).selectOption('STOP');
  await reportForm
    .getByLabel('Issue description', { exact: true })
    .fill('พบงานเสียหนึ่งตัว ให้ตรวจและผลิตทดแทน');
  await reportForm.getByLabel('Affected line 1', { exact: true }).fill('1');
  await reportForm.getByRole('button', { name: 'ບັນທຶກປັນຫາ / Report', exact: true }).click();
  await workPage
    .getByRole('article', { name: 'LASER', exact: true })
    .getByText('STOP · ມີປັນຫາລໍຖ້າ Admin ແກ້ໄຂ', { exact: true })
    .waitFor();
  assert.equal(
    await workPage.getByRole('button', { name: 'Complete LASER', exact: true }).isDisabled(),
    true,
  );
  const issueId = (await db.query('SELECT id FROM production_issues'))[0].id;
  const resolveForm = workPage.getByRole('form', { name: 'Resolve ' + issueId, exact: true });
  await resolveForm
    .getByRole('button', { name: 'ເສຍທັງໝົດ ແລະຜະລິດທົດແທນ / Replace all affected', exact: true })
    .click();
  await resolveForm
    .getByLabel('Resolution reason', { exact: true })
    .fill('ยืนยันของเสียหนึ่งตัว ให้กราฟิกจัดไฟล์ทดแทน');
  let lostResolution = false;
  await workPage.route('**/production-exceptions/issues/*/resolve', async (route) => {
    if (!lostResolution) {
      lostResolution = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await resolveForm
    .getByRole('button', { name: 'ຢືນຢັນ ແລະປິດປັນຫາ / Resolve', exact: true })
    .click();
  await resolveForm.getByRole('button', { name: 'Retry ຄຳຂໍເດີມ', exact: true }).click();
  await workPage
    .getByRole('article', { name: 'Issue ' + issueId, exact: true })
    .getByText(
      'ປິດຄັ້ງທຳອິດ / Initially resolved: ยืนยันของเสียหนึ่งตัว ให้กราฟิกจัดไฟล์ทดแทน · เจ้าของสำหรับตรวจระบบ',
      {
        exact: true,
      },
    )
    .waitFor();
  assert.equal((await db.query('SELECT * FROM production_replacements')).length, 1);
  for (const stage of ['LASER', 'SIZE_SORTING', 'SEWING', 'QC_PACKING']) {
    const card = workPage.getByRole('article', { name: stage, exact: true });
    if (stage !== 'LASER') {
      await card.getByRole('button', { name: 'Start ' + stage, exact: true }).click();
      await card.getByText('ກຳລັງເຮັດ / In progress', { exact: true }).waitFor();
    }
    await card.getByRole('button', { name: 'Complete ' + stage, exact: true }).click();
    await card.getByText('ສຳເລັດ / Completed', { exact: true }).waitFor();
  }
  await workPage.getByText('4 / 12 pcs · ພ້ອມບາງສ່ວນ / Partially ready', { exact: true }).waitFor();
  const replacementId = (await db.query('SELECT sheet_id FROM production_replacements'))[0]
    .sheet_id;
  const replacementPage = await context.newPage();
  replacementPage.on('pageerror', (e) => errors.push(e.message));
  await replacementPage.goto(`http://127.0.0.1:${port}/?prepareSheet=${replacementId}`);
  await replacementPage.getByLabel('จัดผลิตรายการ 1', { exact: true }).waitFor();
  assert.equal(
    await replacementPage.getByLabel('จัดผลิตรายการ 1', { exact: true }).inputValue(),
    '1',
  );
  for (const [part, label] of productionParts) {
    await replacementPage.waitForFunction(
      (label) =>
        [...document.querySelectorAll('input[type=file]')].some(
          (e) => e.getAttribute('aria-label') === 'ไฟล์' + label && !e.disabled,
        ),
      label,
    );
    await replacementPage.getByLabel('ไฟล์' + label, { exact: true }).setInputFiles({
      name: part + '.png',
      mimeType: 'image/png',
      buffer: await printArtwork('REPLACEMENT ' + part),
    });
    await replacementPage.getByText(part + '.png · ไฟล์ฉบับ 1', { exact: true }).waitFor();
  }
  await replacementPage
    .getByLabel('เหตุผลใบผลิต', { exact: true })
    .fill('ตรวจแบบ ไซซ์และไฟล์ทดแทนครบแล้ว');
  await replacementPage
    .getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true })
    .click();
  await replacementPage
    .getByText('สถานะ ใบผลิตพร้อม · ฉบับที่ออกแล้ว 1', { exact: true })
    .waitFor();
  await replacementPage.close();
  const replacementWork = await context.newPage();
  replacementWork.on('pageerror', (e) => errors.push(e.message));
  await replacementWork.goto(`http://127.0.0.1:${port}/?productionWork=${replacementId}`);
  for (const stage of [
    'PRINTING',
    'HEAT_TRANSFER',
    'LASER',
    'SIZE_SORTING',
    'SEWING',
    'QC_PACKING',
  ]) {
    const card = replacementWork.getByRole('article', { name: stage, exact: true });
    await card.getByRole('button', { name: 'Start ' + stage, exact: true }).click();
    await card.getByText('ກຳລັງເຮັດ / In progress', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Complete ' + stage, exact: true }).click();
    await card.getByText('ສຳເລັດ / Completed', { exact: true }).waitFor();
  }
  await replacementWork
    .getByText('5 / 12 pcs · ພ້ອມບາງສ່ວນ / Partially ready', { exact: true })
    .waitFor();
  await replacementWork.screenshot({
    path: 'test-results/production-exceptions-readiness.png',
    fullPage: true,
  });
  await replacementWork.close();
  await workPage.getByRole('button', { name: 'Reload', exact: true }).click();
  await workPage.getByText('5 / 12 pcs · ພ້ອມບາງສ່ວນ / Partially ready', { exact: true }).waitFor();
  await workPage.setViewportSize({ width: 390, height: 900 });
  assert.equal(
    await workPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await workPage.screenshot({ path: 'test-results/production-issues-mobile.png', fullPage: true });
  await workPage.close();
  // เงินและการส่ง: ข้อมูลทดสอบแยกจากโปรแกรมที่เจ้าของเปิดใช้อยู่
  const settlementPage = await context.newPage();
  settlementPage.on('pageerror', (e) => errors.push(e.message));
  await settlementPage.goto(`http://127.0.0.1:${port}/?settlementOrder=${productionOrderId}`);
  await settlementPage.getByLabel('Payment purpose', { exact: true }).selectOption('DEPOSIT');
  await settlementPage.getByLabel('Payment amount', { exact: true }).fill('100000');
  await settlementPage.getByLabel('Payment reason', { exact: true }).fill('รับมัดจำทดสอบ');
  let lostReceipt = false;
  await settlementPage.route('**/settlements/orders/*/receipts', async (route) => {
    if (!lostReceipt) {
      lostReceipt = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await settlementPage
    .getByRole('button', { name: 'ບັນທຶກຮັບເງິນ / Receive', exact: true })
    .click();
  await settlementPage.getByRole('button', { name: 'ລອງຄຳຂໍເດີມ / Retry', exact: true }).click();
  await settlementPage.getByRole('heading', { name: /RCPT-.*ACTIVE/ }).waitFor();
  assert.equal((await db.query('SELECT id FROM payment_entries')).length, 1);
  assert.equal(await settlementPage.getByLabel('Payment amount', { exact: true }).inputValue(), '');
  await settlementPage.getByRole('button', { name: 'ແກ້ລາຍການ / Correct', exact: true }).click();
  await settlementPage.getByLabel('Payment amount', { exact: true }).fill('90000');
  await settlementPage
    .getByLabel('Payment reason', { exact: true })
    .fill('แก้ยอดรับผิดเป็นเก้าหมื่น');
  await settlementPage
    .getByRole('button', { name: 'ບັນທຶກແກ້ໄຂ / Correct payment', exact: true })
    .click();
  await settlementPage.getByRole('heading', { name: /RCPT-.*VOIDED/ }).waitFor();
  await settlementPage.getByRole('button', { name: 'ຄືນເງິນ / Refund', exact: true }).click();
  await settlementPage.getByLabel('Refund amount', { exact: true }).fill('10000');
  await settlementPage.getByLabel('Refund reason', { exact: true }).fill('คืนมัดจำบางส่วนตามตกลง');
  await settlementPage.getByRole('button', { name: 'ບັນທຶກຄືນເງິນ / Refund', exact: true }).click();
  await settlementPage.getByRole('heading', { name: /REF-.*ACTIVE/ }).waitFor();
  assert.equal(
    (
      await db.query(
        "SELECT sum(CASE WHEN kind='RECEIPT' THEN lak_amount ELSE -lak_amount END)::text AS net FROM payment_entries WHERE state='ACTIVE'",
      )
    )[0].net,
    '80000',
  );
  await settlementPage
    .getByRole('button', { name: 'ໃບຮັບເງິນ / Receipt', exact: true })
    .last()
    .click();
  await settlementPage.locator('.receipt-print').waitFor();
  await settlementPage.evaluate(() => document.fonts.ready);
  const receiptPdf = await settlementPage.pdf({
    path: 'test-results/payment-receipt.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  const { getDocument: readReceiptPdf } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const receiptTask = readReceiptPdf({
    data: new Uint8Array(receiptPdf),
    useSystemFonts: true,
  });
  const receiptDocument = await receiptTask.promise;
  assert.equal(
    receiptDocument.numPages,
    1,
    'Receipt print must not include blank pages from the screen',
  );
  await receiptTask.destroy();
  await settlementPage.emulateMedia({ media: 'screen' });
  await settlementPage.getByLabel('Prepare line 1', { exact: true }).fill('2');
  await settlementPage.getByLabel('Prepare reason', { exact: true }).fill('ลูกค้ามารับสองตัวก่อน');
  await settlementPage
    .getByRole('button', { name: 'ບັນທຶກກຽມສົ່ງ / Prepare', exact: true })
    .click();
  await settlementPage.getByRole('heading', { name: /SHP-.*PREPARED/ }).waitFor();
  const shipmentNumber = (await db.query('SELECT number FROM shipments'))[0].number;
  await settlementPage
    .getByLabel('Shipment reason ' + shipmentNumber, { exact: true })
    .fill('แอดมินอนุญาตส่งก่อนจ่ายครบ');
  await settlementPage.getByLabel('Confirm early ' + shipmentNumber, { exact: true }).check();
  let lostShipment = false;
  await settlementPage.route('**/settlements/orders/*/shipments/*/confirm', async (route) => {
    if (!lostShipment) {
      lostShipment = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await settlementPage
    .getByRole('button', { name: 'Confirm ' + shipmentNumber, exact: true })
    .click();
  await settlementPage.getByRole('button', { name: 'ລອງຄຳຂໍເດີມ / Retry', exact: true }).click();
  await settlementPage.getByRole('heading', { name: /SHP-.*CONFIRMED/ }).waitFor();
  assert.equal(
    Number((await db.query('SELECT sum(quantity)::int AS n FROM shipment_allocations'))[0].n),
    2,
  );
  assert.equal((await db.query('SELECT confirmed_early FROM shipments'))[0].confirmed_early, true);
  await settlementPage.getByText('ເພີ່ມ/ແກ້ເລກຂົນສົ່ງ / Tracking details', { exact: true }).click();
  await settlementPage
    .getByLabel('Tracking ' + shipmentNumber, { exact: true })
    .fill('TRACK-TEST-1');
  await settlementPage
    .getByLabel('Tracking reason ' + shipmentNumber, { exact: true })
    .fill('เพิ่มเลขขนส่งภายหลัง');
  await settlementPage.getByRole('button', { name: 'Save tracking', exact: true }).click();
  await settlementPage.getByText('Tracking history (1)', { exact: true }).waitFor();
  for (const width of [390, 320]) {
    await settlementPage.setViewportSize({ width, height: 900 });
    assert.equal(
      await settlementPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Payments page overflow at ' + width,
    );
  }
  await settlementPage.screenshot({
    path: 'test-results/payments-delivery-mobile.png',
    fullPage: true,
  });
  await settlementPage.setViewportSize({ width: 1440, height: 1000 });
  await settlementPage.screenshot({
    path: 'test-results/payments-delivery-desktop.png',
    fullPage: true,
  });
  await settlementPage.close();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: 'test-results/production-sheet-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'สร้างใบผลิตร่างใหม่', exact: true }).click();
  await page.getByLabel('จัดผลิตรายการ 1', { exact: true }).fill('4');
  await page.getByLabel('เหตุผลใบผลิต', { exact: true }).fill('ลองจัดเกินเพื่อทดสอบ');
  await page.getByRole('button', { name: 'บันทึกร่างใบผลิต', exact: true }).click();
  await page.getByText('รายการ 1 จัดได้อีก 3 ตัวเท่านั้น', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT id FROM production_sheets')).length, 2);
  await page.locator('nav').getByRole('button', { name: 'ລູກຄ້າປະຈຳ', exact: true }).click();
  await page.getByRole('button', { name: 'ເພີ່ມລູກຄ້າປະຈຳ', exact: true }).click();
  await page.locator('[name=customerName]').fill('ทีมลูกค้าประจำสำหรับทดสอบ');
  await page.locator('[name=customerPhone]').fill('020 5555 1234');
  await page.locator('[name=customerGroup]').selectOption('AGENT_LEVEL_2');
  await page.locator('[name=customerNotes]').fill('ทดสอบเพิ่มข้อมูลจริงผ่านหน้าจอ');
  let droppedCustomerResponse = false;
  await page.route('**/api/v1/customers', async (route) => {
    if (route.request().method() === 'POST' && !droppedCustomerResponse) {
      droppedCustomerResponse = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'ບັນທຶກລູກຄ້າ', exact: true }).click();
  await page
    .getByText(
      'ยังตรวจผลการบันทึกไม่ได้ กรุณาลองตรวจคำขอเดิมก่อนแก้ข้อมูล เพื่อป้องกันสร้างรายชื่อซ้ำ',
      { exact: true },
    )
    .waitFor();
  assert(await page.locator('[name=customerName]').isDisabled());
  await page.getByRole('button', { name: 'ລອງບັນທຶກຄຳຂໍເດີມ', exact: true }).click();
  await page.getByRole('heading', { name: 'ทีมลูกค้าประจำสำหรับทดสอบ', exact: true }).waitFor();
  await page.getByRole('button', { name: 'ແກ້ໄຂຂໍ້ມູນ', exact: true }).click();
  await page.locator('[name=customerName]').fill('ทีมลูกค้าประจำฉบับปรับปรุง');
  await page.getByRole('button', { name: 'ບັນທຶກລູກຄ້າ', exact: true }).click();
  await page.getByRole('heading', { name: 'ทีมลูกค้าประจำฉบับปรับปรุง', exact: true }).waitFor();
  const savedCustomer = (
    await db.query("SELECT id,branding_type FROM customers WHERE name='ทีมลูกค้าประจำฉบับปรับปรุง'")
  )[0];
  assert.equal(savedCustomer.branding_type, 'CUSTOM_AGENT');
  for (const label of ['ป้ายคอ', 'เทปคอ']) {
    await page.getByLabel('แนบ' + label, { exact: true }).setInputFiles({
      name: label + '.png',
      mimeType: 'image/png',
      buffer: await printArtwork(label),
    });
    await page.getByRole('button', { name: /Save brand file/ }).click();
  }
  await page.getByText(/Label and tape are ready/).waitFor();
  assert.equal(
    (
      await db.query('SELECT kind FROM graphic_assets WHERE scope_key=$1', [
        'CUSTOMER:' + savedCustomer.id,
      ])
    ).length,
    2,
  );
  await page.screenshot({ path: 'test-results/customer-profile-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'ລາຍຊື່ລູກຄ້າ', exact: true }).click();
  await page.getByRole('textbox', { name: 'ค้นหาลูกค้าประจำ', exact: true }).fill('02055551234');
  await page.getByRole('button', { name: 'ຄົ້ນຫາ', exact: true }).click();
  await page
    .getByRole('button', { name: 'เปิดลูกค้า ทีมลูกค้าประจำฉบับปรับปรุง', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'ເພີ່ມລູກຄ້າປະຈຳ', exact: true }).click();
  await page.locator('[name=customerName]').fill('อีกแบรนด์ที่เบอร์ซ้ำ');
  await page.locator('[name=customerPhone]').fill('020-5555-1234');
  await page.locator('[name=customerNotes]').click();
  await page.getByText('พบลูกค้าที่ใช้เบอร์เดียวกัน', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ບັນທຶກລູກຄ້າ', exact: true }).click();
  await page.getByRole('heading', { name: 'อีกแบรนด์ที่เบอร์ซ้ำ', exact: true }).waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Customer profile overflow at ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/customer-profile-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'ລາຍຊື່ລູກຄ້າ', exact: true }).click();
  await page
    .getByRole('button', { name: 'เปิดลูกค้า อีกแบรนด์ที่เบอร์ซ้ำ', exact: true })
    .waitFor();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Customer list overflow',
  );
  await page.screenshot({ path: 'test-results/customer-list-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const customers = await db.query('SELECT name FROM customers ORDER BY id');
  assert.equal(customers.length, 2);
  assert.equal(customers[0].name, 'ทีมลูกค้าประจำฉบับปรับปรุง');
  await page.screenshot({ path: 'test-results/customer-list-desktop.png', fullPage: true });
  await page.locator('nav').getByRole('button', { name: 'ໜ້າຫຼັກ', exact: true }).click();
  await page.getByRole('button', { name: 'จัดการทีมงาน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มพนักงาน', exact: true }).click();
  await page.locator('[name=username]').fill('staff.print');
  await page.locator('[name=displayName]').fill('พนักงานพิมพ์ทดสอบ');
  await page.locator('[name=department]').selectOption('PRINTING');
  await page.locator('[name=password]').fill(staffPassword);
  await page.getByRole('button', { name: 'บันทึกบัญชี', exact: true }).click();
  await page
    .getByText('สร้างบัญชีแล้ว พนักงานต้องเปลี่ยนรหัสผ่านครั้งแรก', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await page.locator('[name=username]').fill('staff.print');
  await page.locator('[name=password]').fill(staffPassword);
  await page.locator('form button.primary').click();
  await page.locator('[name=currentPassword]').fill(staffPassword);
  await page.locator('[name=newPassword]').fill(newPassword);
  await page.locator('[name=confirmation]').fill(newPassword);
  await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่', exact: true }).click();
  await page.locator('[name=username]').fill('staff.print');
  await page.locator('[name=password]').fill(newPassword);
  await page.locator('form button.primary').click();
  await page.getByText('พนักงาน · STAFF', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'เพิ่มพนักงาน', exact: true }).count(), 0);
  const denied = await page.evaluate(async () => (await fetch('/api/v1/users')).status);
  assert.equal(
    await page.evaluate(async () => (await fetch('/api/v1/settlements/orders')).status),
    403,
  );
  assert.equal(
    await page
      .locator('nav')
      .getByRole('button', { name: 'ຮັບເງິນ/ສົ່ງສິນຄ້າ / Payments & delivery', exact: true })
      .count(),
    0,
  );
  assert.equal(denied, 403);
  assert.equal(await page.evaluate(async () => (await fetch('/api/v1/customers')).status), 403);
  assert.equal(
    await page.locator('nav').getByRole('button', { name: 'ລູກຄ້າປະຈຳ', exact: true }).count(),
    0,
  );
  await page
    .locator('nav')
    .getByRole('button', { name: 'ວຽກຜະລິດ / Work queue', exact: true })
    .click();
  await page.getByLabel('Work status', { exact: true }).selectOption('COMPLETED');
  const psNumber = (await db.query('SELECT sheet_number FROM production_sheets'))[0].sheet_number;
  await page.getByRole('button', { name: 'Open work ' + psNumber, exact: true }).click();
  await page.getByRole('article', { name: 'PRINTING', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'ຢືນຢັນ ແລະປິດປັນຫາ / Resolve', exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole('article', { name: 'HEAT_TRANSFER', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Work department', { exact: true }).count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('1,039,000'), false);
  assert.equal(
    await page.evaluate(
      async () => (await fetch('/api/v1/production-work/jobs?department=LASER')).status,
    ),
    403,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Overflow at ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
  const authCookie = (await context.cookies()).find((c) => c.name === 'jazmine_session');
  assert(authCookie?.httpOnly);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  const records = await db.query('SELECT count(*) AS count FROM users');
  assert.equal(Number(records[0].count), 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    throttled,
    [],
    'Normal multi-page workflow must not throttle images or account data',
  );
  console.log(
    'PASS: browser → API → PostgreSQL → UI; identity, customers, catalog, pricing, drafts, confirmation, production A4/PDF, department work, exceptions/replacements, payments/corrections/refunds, receipt PDF, partial/unpaid/early delivery, tracking history, lost-response retry, staff permissions and 320/390px layouts.',
  );
} finally {
  await browser?.close();
  vite.kill();
  await app.close();
  await db.close();
}
