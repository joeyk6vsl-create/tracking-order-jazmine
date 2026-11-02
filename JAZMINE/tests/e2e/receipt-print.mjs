import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const f = await productionFixture();
let app, vite, browser;
try {
  app = await createApplication(
    { production: false, origin: 'http://localhost:5174', port: 3101, dataDir: ':memory:' },
    f.db,
    false,
  );
  await app.listen(3101, '127.0.0.1');
  vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.mts', '--port', '5174'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JAZMINE_API_TARGET: 'http://127.0.0.1:3101' },
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 20000);
    vite.stdout.on('data', (data) => {
      if (data.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vite.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Vite exited: ' + code));
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
  // เครื่องอยู่อีกเขตเวลา แต่เวลาเงินของร้านยังต้องเป็นเวลาลาว
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/New_York',
  });
  const { token } = await f.auth.login(
    'fixture.owner',
    'Fixture-production-password-123',
    '127.0.0.1',
  );
  await context.addCookies([
    {
      name: 'jazmine_session',
      value: token,
      url: 'http://127.0.0.1:5174',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/?settlementOrder=${f.order.id}`);
  await page.getByLabel('Payment amount', { exact: true }).fill('100000');
  await page.getByLabel('Payment date', { exact: true }).fill('2026-10-31T23:59');
  await page
    .getByLabel('Payment reason', { exact: true })
    .fill('รับมัดจำตามเวลาลาว ทดสอบจากเครื่องต่างเขตเวลา');
  await page.getByRole('button', { name: 'ບັນທຶກຮັບເງິນ / Receive', exact: true }).click();
  await page.getByRole('heading', { name: /RCPT-.*ACTIVE/ }).waitFor();
  const entry = (await f.db.query('SELECT occurred_at FROM payment_entries'))[0];
  assert.equal(new Date(entry.occurred_at).toISOString(), '2026-10-31T16:59:00.000Z');
  await page.getByRole('button', { name: 'ໃບຮັບເງິນ / Receipt', exact: true }).click();
  await page.locator('.receipt-print').waitFor();
  assert((await page.locator('.receipt-print').innerText()).includes('31/10/2026, 23:59:00'));
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
    'rgb(255, 255, 255)',
  );
  await mkdir('test-results', { recursive: true });
  const pdf = await page.pdf({
    path: 'test-results/payment-receipt.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const document = await task.promise;
  assert.equal(document.numPages, 1);
  await task.destroy();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: receipt stays one A4 page on white background; Lao date/time survives a browser in another timezone.',
  );
} finally {
  await browser?.close();
  vite?.kill();
  await app?.close();
  await f.db.close();
}
