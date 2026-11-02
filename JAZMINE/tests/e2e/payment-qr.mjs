import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { fixtureBankInput } = require('../../dist/tests/integration/helpers/payment-qr-fixture.js'),
  { reviseOrder } = require('../../dist/tests/integration/helpers/revise-order.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { PaymentQrService } = require('../../dist/apps/server/src/payment-qr/payment-qr-service.js'),
  { DocumentService } = require('../../dist/apps/server/src/documents/document-service.js'),
  { DocumentProcessor } = require('../../dist/apps/server/src/documents/document-processor.js'),
  { renderStoredPdf } = require('../../dist/apps/server/src/documents/pdf-renderer.js'),
  { TrackingLinkService } = require('../../dist/apps/server/src/tracking/link-service.js');
const f = await productionFixture(),
  port = 5190,
  apiPort = 3114,
  base = `http://127.0.0.1:${port}`,
  lak = await fixtureBankInput('LAK'),
  thb = await fixtureBankInput('THB'),
  bank = new PaymentQrService(f.db),
  docs = new DocumentService(f.db),
  hash = (b) => createHash('sha256').update(b).digest('hex');
let app, vite, browser;
try {
  const numbers = await f.db.query('SELECT * FROM business_counters ORDER BY family'),
    money = await f.db.query('SELECT * FROM payment_entries');
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
  async function contextFor(username, password) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      login = await f.auth.login(username, password, '127.0.0.1');
    await c.addCookies([
      { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    return c;
  }
  const owner = await contextFor('fixture.owner', 'Fixture-production-password-123'),
    page = await owner.newPage(),
    errors = [];
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('same key')) errors.push(m.text());
  });
  await page.goto(base);
  await page.getByRole('button', { name: /Shop payment QR/, exact: false }).click();
  async function prepare(sample) {
    await page
      .getByLabel('Bank QR image', { exact: true })
      .setInputFiles({ name: sample.input.filename, mimeType: 'image/png', buffer: sample.bytes });
    await page.getByRole('button', { name: /Check bank QR image/ }).click();
    await page.getByAltText('Bank QR preview to verify in bank app', { exact: true }).waitFor();
    await page.getByLabel('Payment QR bank name').fill(sample.input.bankName);
    await page.getByLabel('Payment QR recipient name').fill(sample.input.receiverName);
    await page.getByLabel('Payment QR account reference').fill(sample.input.accountReference);
    await page.getByLabel('Enable payment QR on new invoices').check();
    await page.getByLabel('Verified payment QR in bank app').check();
    await page.getByLabel('Payment QR change reason').fill('ตั้งค่าจำลองเพื่อทดสอบเท่านั้น');
  }
  await prepare(lak);
  let dropped = false;
  await page.route('**/api/v1/payment-qr/LAK', async (route) => {
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: /Save payment QR/ }).click();
  await page.getByRole('button', { name: 'Retry same bank QR request', exact: true }).click();
  await page.getByRole('heading', { name: /LAK.*v1/ }).waitFor();
  assert.equal((await bank.history(f.owner, 'LAK', 1)).versions.length, 1);
  await page.getByRole('button', { name: 'ບາດ / THB', exact: true }).click();
  await page
    .getByLabel('Bank QR image', { exact: true })
    .setInputFiles({ name: 'wrong-currency.png', mimeType: 'image/png', buffer: lak.bytes });
  await page.getByRole('button', { name: /Check bank QR image/ }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: /currency does not match/ })
    .waitFor();
  await prepare(thb);
  await page.getByRole('button', { name: /Save payment QR/ }).click();
  await page.getByRole('heading', { name: /THB.*v1/ }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/payment-qr-settings-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Settings overflow ' + width,
    );
  }
  await page.screenshot({ path: 'test-results/payment-qr-settings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const revised = await reviseOrder(f, { quote: { ...f.input.quote, quantity: 12 } }),
    processor = new DocumentProcessor(f.db, base, async (payload) => {
      try {
        return await renderStoredPdf(payload);
      } catch (e) {
        console.error('Payment test render failed', e);
        throw e;
      }
    });
  for (let i = 0; i < 3; i++) await processor.processOne();
  const original = await docs.file(f.owner, 'INVOICE', f.order.id, revised.revision);
  await writeFile('test-results/payment-qr-stored-invoice.pdf', original.bytes);
  const admin = await contextFor('fixture.admin', 'Fixture-production-password-123new'),
    staff = await admin.newPage();
  staff.setDefaultTimeout(45000);
  staff.on('pageerror', (e) => errors.push(e.message));
  staff.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('same key')) errors.push(m.text());
  });
  await staff.goto(base + '/?confirmedOrder=' + f.order.id);
  await staff.getByLabel('ฉบับออเดอร์', { exact: true }).waitFor();
  assert.equal(await staff.getByRole('button', { name: /Shop payment QR/ }).count(), 0);
  const session = await (await admin.request.get(base + '/api/v1/auth/session')).json(),
    forbidden = await admin.request.post(base + '/api/v1/payment-qr/LAK', {
      headers: { Origin: base, 'X-CSRF-Token': session.csrfToken },
      data: { ...lak.input, requestId: randomUUID(), version: 1 },
    });
  assert.equal(forbidden.status(), 403);
  assert.equal((await forbidden.json()).code, 'PERMISSION_DENIED');
  const controls = staff.getByRole('region', { name: 'Invoice bank payment controls' });
  await controls.getByLabel('Include bank payment QR').check();
  await controls.getByRole('button', { name: /Check and attach payment QR/ }).click();
  await staff.waitForFunction(() => document.querySelectorAll('.invoice-payment-qr').length === 2);
  const tracking = await new TrackingLinkService(f.db).issue(f.owner, f.order.id, {
      requestId: randomUUID(),
      reason: 'ลิงก์ทดสอบแยกจากรับเงิน',
      days: 7,
    }),
    url = base + '/#track=' + tracking.token,
    trackingControls = staff.getByRole('region', { name: 'Invoice tracking controls' });
  await trackingControls.getByLabel('Include invoice tracking QR').check();
  await trackingControls.getByLabel('Invoice tracking link', { exact: true }).fill(url);
  await trackingControls.getByRole('button', { name: /Validate and attach QR/ }).click();
  await staff.locator('.invoice-tracking-qr[data-ready=true]').waitFor();
  async function print() {
    await staff.evaluate(() => {
      globalThis.paymentPrintCalls = 0;
      window.print = () => {
        globalThis.paymentPrintCalls++;
      };
    });
    await staff.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
    await staff.waitForFunction(() => globalThis.paymentPrintCalls === 1);
  }
  await print();
  await staff.emulateMedia({ media: 'print' });
  await staff.pdf({
    path: 'test-results/payment-qr-live-invoice.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  await staff.emulateMedia({ media: 'screen' });
  await staff
    .locator('.invoice-payment-qrs')
    .screenshot({ path: 'test-results/payment-qr-invoice-desktop.png' });
  for (const width of [390, 320]) {
    await staff.setViewportSize({ width, height: 900 });
    assert(
      await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Invoice bank QR overflow ' + width,
    );
  }
  await staff
    .locator('.invoice-payment-qrs')
    .screenshot({ path: 'test-results/payment-qr-invoice-mobile.png' });
  await staff.setViewportSize({ width: 1440, height: 1000 });
  await bank.save(f.owner, 'LAK', {
    ...lak.input,
    requestId: randomUUID(),
    version: 1,
    imageBase64: undefined,
    enabled: false,
    verifiedInBankApp: false,
    reason: 'หยุด QR กีบทดสอบ',
  });
  await staff.evaluate(() => {
    globalThis.paymentPrintCalls = 0;
  });
  await staff.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
  await controls
    .getByRole('alert')
    .filter({ hasText: /changed or was disabled/ })
    .waitFor();
  assert.equal(await staff.evaluate(() => globalThis.paymentPrintCalls), 0);
  assert.equal(await staff.locator('.invoice-payment-qr').count(), 0);
  assert.equal(await staff.locator('.invoice-tracking-qr[data-ready=true]').count(), 1);
  assert.equal(
    hash((await docs.file(f.owner, 'INVOICE', f.order.id, 2)).bytes),
    hash(original.bytes),
  );
  assert(
    (await docs.status(f.owner, 'INVOICE', f.order.id, 2)).notice.includes(
      'Payment details changed',
    ),
  );
  await controls.getByRole('button', { name: 'Reload current payment QR', exact: true }).click();
  await staff.waitForFunction(() => !document.querySelector('input[aria-label="Use bank QR LAK"]'));
  await controls.getByRole('button', { name: /Check and attach payment QR/ }).click();
  await staff.waitForFunction(() => document.querySelectorAll('.invoice-payment-qr').length === 1);
  await print();
  let release, started;
  const gate = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r));
  await staff.route(
    '**/api/v1/payment-qr/check',
    async (route) => {
      started();
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  await staff.evaluate(() => {
    globalThis.paymentPrintCalls = 0;
  });
  await staff.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
  await ready;
  await staff.getByLabel('ฉบับออเดอร์', { exact: true }).selectOption('1');
  const response = staff.waitForResponse((r) => r.url().endsWith('/api/v1/payment-qr/check'));
  release();
  await response;
  await staff.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  assert.equal(
    await staff.evaluate(() => globalThis.paymentPrintCalls),
    0,
    'Changing invoice during validation must cancel print',
  );
  await bank.save(f.owner, 'LAK', {
    ...lak.input,
    requestId: randomUUID(),
    version: 2,
    imageBase64: undefined,
    reason: 'เปิดกีบอีกครั้งทดสอบ',
    verifiedInBankApp: true,
  });
  const longOrder = await reviseOrder(f, {
    lines: Array.from({ length: 30 }, () => ({ ...f.input.quote, quantity: 1, freeQuantity: 0 })),
  });
  await processor.processOne();
  const long = await docs.file(f.owner, 'INVOICE', f.order.id, longOrder.revision);
  await writeFile('test-results/payment-qr-long-invoice.pdf', long.bytes);
  assert.equal(
    hash((await docs.file(f.owner, 'INVOICE', f.order.id, 2)).bytes),
    hash(original.bytes),
  );
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(base + '/api/v1/payment-qr')).status(), 401);
  assert.equal(
    (await anonymous.request.get(base + '/api/v1/payment-qr/LAK/versions/3/image')).status(),
    401,
  );
  async function decodeAll(src) {
    await staff.addScriptTag({ path: require.resolve('jsqr') });
    return staff.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const half = Math.floor(canvas.width / 2),
        found = [];
      // อ่านทั้งหน้าและแยกสองคอลัมน์ เพื่อไม่ให้ตัวอ่านจับมุมจากคนละ QR มารวมกัน
      for (const [x, width] of [
        [0, canvas.width],
        [0, half],
        [half, canvas.width - half],
      ]) {
        const pixels = ctx.getImageData(x, 0, width, canvas.height);
        for (let i = 0; i < 6; i++) {
          const qr = globalThis.jsQR(pixels.data, width, canvas.height);
          if (!qr) break;
          const corners = [
              qr.location.topLeftCorner,
              qr.location.topRightCorner,
              qr.location.bottomLeftCorner,
              qr.location.bottomRightCorner,
            ],
            cx = x + corners.reduce((n, p) => n + p.x, 0) / 4,
            cy = corners.reduce((n, p) => n + p.y, 0) / 4;
          if (!found.some((f) => f.data === qr.data && Math.hypot(f.x - cx, f.y - cy) < 30))
            found.push({ data: qr.data, x: cx, y: cy });
          const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 3),
            right = Math.min(width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 3),
            top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 3),
            bottom = Math.min(canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 3);
          for (let y = top; y < bottom; y++)
            pixels.data.fill(255, (y * width + left) * 4, (y * width + right) * 4);
        }
      }
      return found.map((f) => f.data);
    }, src);
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'),
    stamp = Date.now(),
    counts = {};
  for (const [name, expected] of [
    ['stored', [lak.payload, thb.payload]],
    ['live', [lak.payload, thb.payload, url]],
    ['long', [lak.payload, thb.payload]],
  ]) {
    const path = `test-results/payment-qr-${name}-invoice.pdf`,
      bytes = await readFile(path),
      task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }),
      pdf = await task.promise;
    counts[name] = pdf.numPages;
    for (let p = 1; p <= pdf.numPages; p++) {
      const text = (await (await pdf.getPage(p)).getTextContent()).items
        .map((i) => i.str)
        .join(' ');
      assert(text.trim().length > 20, 'No blank pages');
    }
    await task.destroy();
    const prefix = `test-results/payment-qr-${name}-render-${stamp}`,
      render = spawnSync(
        process.env.PDFTOPPM_EXECUTABLE ?? 'pdftoppm',
        ['-r', '150', '-png', path, prefix],
        { encoding: 'utf8' },
      );
    assert.equal(render.status, 0, render.stderr || render.error?.message);
    const files = (await readdir('test-results')).filter(
      (n) => n.startsWith(prefix.slice('test-results/'.length)) && n.endsWith('.png'),
    );
    assert.equal(files.length, counts[name]);
    const found = [];
    for (const file of files)
      found.push(
        ...(await decodeAll(
          'data:image/png;base64,' + (await readFile('test-results/' + file)).toString('base64'),
        )),
      );
    assert.deepEqual(
      found.sort(),
      expected.sort(),
      name + ' PDF contains exactly the expected original bank/tracking payloads',
    );
  }
  assert.equal(counts.stored, 1);
  assert(counts.long > 1);
  assert.deepEqual(await f.db.query('SELECT * FROM payment_entries'), money);
  assert.deepEqual(await f.db.query('SELECT * FROM business_counters ORDER BY family'), numbers);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: owner LAK/THB QR settings and lost-response retry, ADMIN use without edit, stored invoice snapshots, bank and tracking QR coexistence, print-time disable and invoice-switch guards, mobile 320/390px, no recorded payments; PDF pages ' +
      JSON.stringify(counts) +
      '; images ' +
      stamp,
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
