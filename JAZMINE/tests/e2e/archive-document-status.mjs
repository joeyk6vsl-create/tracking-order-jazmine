import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import sharp from 'sharp';
import jsQR from 'jsqr';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  {
    completedOrder,
    lifecycleInput,
    settlementInput,
  } = require('../../dist/tests/integration/helpers/archive-fixture.js'),
  {
    ArchiveAutomationService,
  } = require('../../dist/apps/server/src/orders/archive-automation-service.js'),
  {
    OrderLifecycleService,
  } = require('../../dist/apps/server/src/orders/order-lifecycle-service.js'),
  { PaymentService } = require('../../dist/apps/server/src/settlements/payment-service.js'),
  { QuotationService } = require('../../dist/apps/server/src/orders/quotation-service.js'),
  { DocumentService } = require('../../dist/apps/server/src/documents/document-service.js'),
  { DocumentProcessor } = require('../../dist/apps/server/src/documents/document-processor.js'),
  { businessDate } = require('../../dist/packages/contracts/src/customers.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js');
const f = await productionFixture(),
  port = 5192,
  apiPort = 3116,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  const receipt = await completedOrder(f),
    quotes = new QuotationService(f.db),
    draft = randomUUID();
  await f.drafts.save(f.owner, draft, f.input);
  async function quote(notes) {
    const terms = { draftVersion: 1, validUntil: businessDate(), notes },
      check = await quotes.check(f.owner, draft, terms);
    return quotes.issue(f.owner, draft, {
      ...terms,
      requestId: randomUUID(),
      checkToken: check.checkToken,
      reason: 'ทดสอบสำเนาสถานะ',
    });
  }
  const q = await quote('ฉบับแรก');
  await quote('ฉบับใหม่');
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
  let serverErrors = '';
  vite.stderr.on('data', (d) => {
    serverErrors += d.toString();
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Vite timeout ' + serverErrors)), 20000);
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('Local:')) {
        clearTimeout(t);
        resolve();
      }
    });
    vite.once('exit', (c) => {
      clearTimeout(t);
      reject(new Error('Vite stopped ' + c));
    });
  });
  const processor = new DocumentProcessor(f.db, base);
  for (let i = 0; i < 20 && (await processor.processOne()); i++) {
    /* Render fixture originals only. */
  }
  assert(
    (await f.db.query('SELECT state,last_error FROM document_jobs')).every(
      (r) => r.state === 'ISSUED',
    ),
  );
  const docs = new DocumentService(f.db),
    targets = [
      ['INVOICE', f.order.id, 1, 'invoice', 'CANCELLED'],
      ['RECEIPT', receipt.entryId, 1, 'receipt', 'VOIDED'],
      ['PRODUCTION', f.id, 1, 'production', 'CANCELLED'],
      ['QUOTATION', q.revisionId, 1, 'quotation', 'SUPERSEDED'],
    ];
  const originals = new Map();
  for (const [kind, id, version, name] of targets)
    originals.set(name, (await docs.file(f.owner, kind, id, version)).bytes);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE }
      : existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  async function context(username, password) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      login = await f.auth.login(username, password, '127.0.0.1');
    await ctx.addCookies([
      { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    return ctx;
  }
  const owner = await context('fixture.owner', 'Fixture-production-password-123'),
    page = await owner.newPage(),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?settlementOrder=' + f.order.id);
  const settings = page.getByRole('region', { name: 'Automatic archive settings' });
  await settings.getByRole('button', { name: 'Owner archive settings' }).click();
  await settings.getByLabel('Enable automatic archive').waitFor();
  assert.equal(await settings.getByLabel('Enable automatic archive').isChecked(), false);
  await settings.getByLabel('Enable automatic archive').check();
  await settings.getByLabel('Automatic archive reason').fill('เปิดในข้อมูลทดสอบเท่านั้น');
  let lost = false;
  await page.route('**/api/v1/archive-settings', async (route) => {
    if (!lost && route.request().method() === 'POST') {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await settings.getByRole('button', { name: 'Save archive settings' }).click();
  await settings.getByRole('button', { name: 'Retry archive settings' }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Automatic archive reason"]')?.value === '',
  );
  assert(lost);
  assert.equal((await f.db.query('SELECT * FROM archive_settings_commands')).length, 1);
  await mkdir('test-results', { recursive: true });
  await settings.screenshot({ path: 'test-results/automatic-archive-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Archive settings overflow ' + width,
    );
  }
  await settings.screenshot({ path: 'test-results/automatic-archive-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const automation = new ArchiveAutomationService(f.db);
  assert.equal(await automation.processBatch(), 0);
  await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '16 days'");
  assert.equal(await automation.processBatch(), 1);
  await page.getByLabel('Include archived orders').check();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByLabel('Settlement order').selectOption(f.order.id);
  assert((await page.getByLabel('Settlement order').textContent()).includes(f.order.orderNumber));
  const life = new OrderLifecycleService(f.db);
  await life.command(f.owner, f.order.id, 'restore', await lifecycleInput(f));
  assert.equal(await automation.processBatch(), 0);
  const admin = await context('fixture.admin', 'Fixture-production-password-123new');
  assert.equal((await admin.request.get(base + '/api/v1/archive-settings')).status(), 403);
  const adminPage = await admin.newPage();
  await adminPage.goto(base + '?settlementOrder=' + f.order.id);
  assert.equal(
    await adminPage.getByRole('region', { name: 'Automatic archive settings' }).count(),
    0,
  );
  await page.goto(base + '?confirmedOrder=' + f.order.id);
  await page
    .locator('.invoice-print > [aria-label="Current document status"]')
    .getByText('Current revision', { exact: false })
    .waitFor();
  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed++;
    };
  });
  await new PaymentService(f.db).void(
    f.owner,
    f.order.id,
    receipt.entryId,
    await settlementInput(f),
  );
  await life.command(f.owner, f.order.id, 'cancel', await lifecycleInput(f));
  await page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
  await page.waitForFunction(() => window.__printed === 1);
  await page
    .locator('.invoice-print > [aria-label="Current document status"]')
    .getByText('CANCELLED', { exact: false })
    .waitFor();
  const stored = page.getByRole('region', { name: 'Stored document' });
  await stored.getByRole('button', { name: 'Refresh PDF status' }).click();
  await stored
    .getByRole('complementary', { name: 'Current document status' })
    .getByText('CANCELLED', { exact: false })
    .waitFor();
  await stored.getByRole('link', { name: 'Download current-status copy' }).waitFor();
  await stored.screenshot({ path: 'test-results/current-document-status-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Current status overflow ' + width,
    );
  }
  await stored.screenshot({ path: 'test-results/current-document-status-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'),
    stamp = Date.now(),
    pages = {};
  const beforeMoney = await f.db.query('SELECT * FROM payment_entries ORDER BY id'),
    beforeJobs = await f.db.query('SELECT * FROM document_jobs ORDER BY id');
  for (const [kind, id, version, name, mark] of targets) {
    const path = '/api/v1/documents/' + kind + '/' + id + '/' + version;
    const response = await owner.request.get(base + path + '/current-copy');
    assert.equal(response.status(), 200);
    assert(response.headers()['cache-control'].includes('no-store'));
    const bytes = await response.body();
    assert.equal(
      response.headers()['x-document-sha256'],
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.deepEqual(
      await (await owner.request.get(base + path + '/file')).body(),
      originals.get(name),
    );
    const file = 'test-results/current-status-' + name + '.pdf';
    if (name === 'invoice') {
      const download = page.waitForEvent('download');
      await stored.getByRole('link', { name: 'Download current-status copy' }).click();
      await (await download).saveAs(file);
    } else {
      const fs = await import('node:fs/promises');
      await fs.writeFile(file, bytes);
    }
    const saved = await readFile(file),
      loading = pdfjs.getDocument({ data: new Uint8Array(saved), useSystemFonts: true }),
      pdf = await loading.promise;
    pages[name] = pdf.numPages;
    for (let n = 1; n <= pdf.numPages; n++) {
      const text = (await (await pdf.getPage(n)).getTextContent()).items
        .map((i) => i.str)
        .join(' ');
      assert(text.includes(mark), 'Missing ' + mark + ' on ' + name + ' page ' + n);
      assert(text.includes('Checked'), 'Missing check time ' + name);
    }
    await loading.destroy();
    const rendered = spawnSync(
      process.env.PDFTOPPM_EXECUTABLE || 'pdftoppm',
      ['-scale-to', '1600', '-png', file, `test-results/current-status-${name}-render-${stamp}`],
      { encoding: 'utf8' },
    );
    assert.equal(rendered.status, 0, rendered.stderr);
    if (name !== 'invoice') {
      const expected =
        name === 'quotation'
          ? base + '/?quotation=' + q.revisionId
          : name === 'production'
            ? base + `/?productionSheet=${f.id}&version=1`
            : base + `/?settlementOrder=${f.order.id}&paymentEntry=${receipt.entryId}`;
      for (let n = 1; n <= pages[name]; n++) {
        const { data, info } = await sharp(
          `test-results/current-status-${name}-render-${stamp}-${n}.png`,
        )
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const found = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        assert.equal(found?.data, expected, 'QR changed after marking ' + name + ' page ' + n);
      }
    }
  }
  assert.deepEqual(await f.db.query('SELECT * FROM payment_entries ORDER BY id'), beforeMoney);
  assert.deepEqual(await f.db.query('SELECT * FROM document_jobs ORDER BY id'), beforeJobs);
  const receiptPage = await owner.newPage();
  await receiptPage.goto(base + '?settlementOrder=' + f.order.id);
  await receiptPage.getByRole('button', { name: 'ໃບຮັບເງິນ / Receipt', exact: true }).click();
  await receiptPage.evaluate(() => {
    window.__printed = 0;
    window.print = () => window.__printed++;
  });
  await receiptPage.getByRole('button', { name: 'Print receipt', exact: false }).click();
  await receiptPage.waitForFunction(() => window.__printed === 1);
  assert(
    (await receiptPage.locator('.receipt-print .document-current-status').textContent()).includes(
      'VOIDED',
    ),
  );
  const psPage = await owner.newPage();
  await psPage.goto(base + `?productionSheet=${f.id}&version=1`);
  await psPage.locator('[data-ready=true]').waitFor();
  await psPage.evaluate(() => {
    window.__printed = 0;
    window.print = () => window.__printed++;
  });
  await psPage.getByRole('button', { name: 'พิมพ์ / บันทึก PDF', exact: true }).click();
  await psPage.waitForFunction(() => window.__printed === 1);
  assert(
    (await psPage.locator('.ps-document-warning').first().textContent()).includes('CANCELLED'),
  );
  const qPage = await owner.newPage();
  await qPage.goto(base + '?quotation=' + q.revisionId);
  await qPage.evaluate(() => {
    window.__printed = 0;
    window.print = () => window.__printed++;
  });
  await qPage.getByRole('button', { name: 'Print quotation PDF', exact: false }).click();
  await qPage.waitForFunction(() => window.__printed === 1);
  assert(
    (await qPage.locator('.quotation-print .document-current-status').textContent()).includes(
      'SUPERSEDED',
    ),
  );
  const graphic = await context('fixture.graphic', 'Fixture-production-password-123new');
  assert.equal(
    (
      await graphic.request.get(base + `/api/v1/documents/INVOICE/${f.order.id}/1/current-copy`)
    ).status(),
    403,
  );
  assert.equal(
    (
      await graphic.request.get(base + `/api/v1/documents/PRODUCTION/${f.id}/1/current-copy`)
    ).status(),
    200,
  );
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get(base + `/api/v1/documents/INVOICE/${f.order.id}/1/current-status`)
    ).status(),
    401,
  );
  await page.route('**/api/v1/documents/INVOICE/*/1/current-status', (route) =>
    route.abort('connectionfailed'),
  );
  await page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF', exact: true }).click();
  await page.locator('.invoice-print [role="alert"]').first().waitFor();
  assert.equal(await page.evaluate(() => window.__printed), 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: owner archive settings/retry, staff denial, observed delay/archive/restore, fresh print cancellation status, fail-closed printing, four real current-status PDFs, exact originals and 320/390px; pages ' +
      JSON.stringify(pages) +
      '; render stamp ' +
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
