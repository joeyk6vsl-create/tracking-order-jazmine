import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { reviseOrder } = require('../../dist/tests/integration/helpers/revise-order.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { TrackingLinkService } = require('../../dist/apps/server/src/tracking/link-service.js');
const f = await productionFixture(),
  port = 5187,
  apiPort = 3111,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
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
  await page.goto(base + '?confirmedOrder=' + f.order.id);
  const controls = page.getByRole('region', { name: 'Invoice tracking controls' }),
    include = controls.getByLabel('Include invoice tracking QR');
  await include.check();
  await controls.getByText(/Create or replace link/).click();
  await controls.getByLabel('Tracking link reason').fill('สร้าง QR ติดตามสำหรับใบแจ้งหนี้ทดสอบ');
  await controls.getByRole('button', { name: /Create replacement link/ }).click();
  const qr = page.locator('.invoice-tracking-qr[data-ready=true]');
  await qr.waitFor();
  const url = await controls.getByLabel('Customer tracking link', { exact: true }).inputValue(),
    token = new URL(url).hash.slice(7);
  async function decode(src) {
    await page.addScriptTag({ path: require.resolve('jsqr') });
    return page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return (
        globalThis.jsQR(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        )?.data ?? null
      );
    }, src);
  }
  assert.equal(await decode(await qr.locator('img').getAttribute('src')), url);
  await mkdir('test-results', { recursive: true });
  await qr.screenshot({ path: 'test-results/invoice-tracking-qr-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Invoice QR overflow ' + width,
    );
  }
  await qr.screenshot({ path: 'test-results/invoice-tracking-qr-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function printChecked() {
    await page.evaluate(() => {
      globalThis.invoicePrintCalls = 0;
      window.print = () => {
        globalThis.invoicePrintCalls++;
      };
    });
    await page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
    await page.waitForFunction(() => globalThis.invoicePrintCalls === 1);
  }
  await printChecked();
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({
    path: 'test-results/invoice-tracking.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }),
    doc = await loading.promise;
  assert.equal(doc.numPages, 1);
  const pdfPage = await doc.getPage(1),
    text = (await pdfPage.getTextContent()).items.map((i) => i.str).join(' ');
  assert(text.includes(f.order.invoiceNumber));
  assert(text.includes('Track your order'));
  assert(text.includes('Not a payment QR'));
  await loading.destroy();
  const standardRender = spawnSync(
    process.env.PDFTOPPM_EXECUTABLE ?? 'pdftoppm',
    [
      '-r',
      '160',
      '-singlefile',
      '-png',
      'test-results/invoice-tracking.pdf',
      'test-results/invoice-tracking-page',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(standardRender.status, 0, standardRender.stderr || standardRender.error?.message);
  assert.equal(
    await decode(
      'data:image/png;base64,' +
        (await readFile('test-results/invoice-tracking-page.png')).toString('base64'),
    ),
    url,
  );
  await page.emulateMedia({ media: 'screen' });
  const customerContext = await browser.newContext(),
    customer = await customerContext.newPage();
  await customer.goto(url);
  assert.equal(await customer.locator('.public-progress').count(), 0);
  await customer.getByLabel('Tracking phone', { exact: true }).fill(f.input.phone);
  await customer.getByRole('button', { name: 'ຢືນຢັນ / Verify', exact: true }).click();
  await customer.getByText(f.order.orderNumber, { exact: false }).first().waitFor();
  // Reload and paste the saved link instead of rotating a link already printed on paper.
  await page.reload();
  await include.check();
  await controls.getByLabel('Invoice tracking link').fill(url);
  await controls.getByRole('button', { name: /Validate and attach QR/ }).click();
  await qr.waitFor();
  assert.equal((await f.db.query('SELECT id FROM tracking_links')).length, 1);
  assert.equal(
    await page.evaluate(
      (t) =>
        Object.values(localStorage).some((v) => v.includes(t)) ||
        Object.values(sessionStorage).some((v) => v.includes(t)),
      token,
    ),
    false,
  );
  const oldSnapshot = structuredClone(f.order.snapshot);
  await reviseOrder(f, {
    lines: Array.from({ length: 30 }, () => ({ ...f.input.quote, quantity: 1, freeQuantity: 0 })),
  });
  await page.reload();
  await include.check();
  await controls.getByLabel('Invoice tracking link').fill(url);
  await controls.getByRole('button', { name: /Validate and attach QR/ }).click();
  await qr.waitFor();
  await printChecked();
  await page.emulateMedia({ media: 'print' });
  const longPdf = await page.pdf({
    path: 'test-results/invoice-tracking-long.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const longLoading = getDocument({ data: new Uint8Array(longPdf), useSystemFonts: true }),
    longDoc = await longLoading.promise;
  assert(longDoc.numPages > 1);
  const longPageCount = longDoc.numPages;
  await longLoading.destroy();
  const prefix = 'test-results/invoice-tracking-long-render-' + Date.now(),
    longRender = spawnSync(
      process.env.PDFTOPPM_EXECUTABLE ?? 'pdftoppm',
      ['-r', '130', '-png', 'test-results/invoice-tracking-long.pdf', prefix],
      { encoding: 'utf8' },
    );
  assert.equal(longRender.status, 0, longRender.stderr || longRender.error?.message);
  const filenames = (await readdir('test-results')).filter(
    (n) => n.startsWith(prefix.slice('test-results/'.length)) && n.endsWith('.png'),
  );
  assert.equal(filenames.length, longPageCount);
  let decoded = 0;
  for (const filename of filenames) {
    if (
      (await decode(
        'data:image/png;base64,' + (await readFile('test-results/' + filename)).toString('base64'),
      )) === url
    )
      decoded++;
  }
  assert.equal(decoded, 1, 'Long invoice retains exactly one readable QR');
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('ฉบับออเดอร์', { exact: true }).selectOption('1');
  assert.equal(await qr.count(), 0);
  await include.check();
  await controls.getByLabel('Invoice tracking link').fill(url);
  await controls.getByRole('button', { name: /Validate and attach QR/ }).click();
  await qr.waitFor();
  assert.deepEqual(
    (await f.orders.history(f.owner, f.order.id)).revisions[1].snapshot,
    oldSnapshot,
  );
  assert.equal((await f.db.query('SELECT id FROM tracking_links')).length, 1);
  await new TrackingLinkService(f.db).revoke(f.owner, f.order.id, {
    requestId: crypto.randomUUID(),
    reason: 'ปิดลิงก์ที่เคยพิมพ์แล้วเพื่อทดสอบ',
  });
  await page.evaluate(() => {
    globalThis.invoicePrintCalls = 0;
    window.print = () => {
      globalThis.invoicePrintCalls++;
    };
  });
  await page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
  await controls
    .getByRole('alert')
    .filter({ hasText: /revoked/ })
    .waitFor();
  assert.equal(await page.evaluate(() => globalThis.invoicePrintCalls), 0);
  assert.equal(await qr.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: invoice QR creation/reuse with phone verification, actual PDF QR decode, one-page standard and multi-page long invoice, immutable earlier revision, print-time revocation guard and 320/390px layouts',
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
