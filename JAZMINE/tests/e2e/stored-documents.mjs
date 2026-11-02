import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { QuotationService } = require('../../dist/apps/server/src/orders/quotation-service.js'),
  { DocumentService } = require('../../dist/apps/server/src/documents/document-service.js'),
  { renderStoredPdf } = require('../../dist/apps/server/src/documents/pdf-renderer.js'),
  { startWorker } = require('../../dist/apps/worker/src/worker.js'),
  { SettlementService } = require('../../dist/apps/server/src/settlements/settlement-service.js'),
  { PaymentService } = require('../../dist/apps/server/src/settlements/payment-service.js'),
  { businessDate } = require('../../dist/packages/contracts/src/customers.js'),
  { receiptSchema } = require('../../dist/packages/contracts/src/settlement.js'),
  { sheetSchema } = require('../../dist/packages/contracts/src/production.js');
const f = await productionFixture(),
  port = 5189,
  apiPort = 3113,
  base = `http://127.0.0.1:${port}`,
  docs = new DocumentService(f.db),
  quotations = new QuotationService(f.db),
  draft = randomUUID();
let app, vite, browser, stopWorker;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  await f.drafts.save(f.owner, draft, { ...f.input, customerName: 'ລູກຄ້າ / PDF archive sample' });
  const terms = {
      draftVersion: 1,
      validUntil: businessDate(),
      notes: 'Pinned prices and font: ສະບາຍດີ · <img src="http://127.0.0.1:1/private">',
    },
    checked = await quotations.check(f.owner, draft, terms),
    quote = await quotations.issue(f.owner, draft, {
      ...terms,
      requestId: randomUUID(),
      checkToken: checked.checkToken,
      reason: 'ทดสอบใบเก็บถาวร',
    });
  const settlements = new SettlementService(f.db),
    payments = new PaymentService(f.db),
    money = await settlements.detail(f.owner, f.order.id),
    receipt = await payments.receipt(
      f.actors.ADMIN,
      f.order.id,
      receiptSchema.parse({
        requestId: randomUUID(),
        expectedVersion: money.version,
        orderRevision: 1,
        reason: 'รับมัดจำทดสอบ',
        purpose: 'DEPOSIT',
        currency: 'LAK',
        amount: '100000',
        method: 'CASH',
        reference: 'ARCHIVE-TEST',
        occurredAt: new Date().toISOString(),
        rateRevision: money.rates.revision,
      }),
    );
  const sheet = (await f.production.detail(f.owner, f.id)).sheet;
  await f.production.save(
    f.actors.GRAPHIC,
    f.id,
    sheetSchema.parse({
      ...f.sheetInput,
      rowVersion: sheet.rowVersion,
      reason: 'เพิ่ม PDF ชิ้นงาน',
      notes: 'ທົດສອບໄຟລ໌ແນບ / Pinned production attachment',
    }),
  );
  const attachment = await PDFDocument.create(),
    font = await attachment.embedFont(StandardFonts.Helvetica);
  attachment
    .addPage([500, 500])
    .drawText('PINNED COLLAR STAND PDF', { font, size: 24, x: 45, y: 250 });
  const attachmentBytes = await attachment.save();
  await f.production.upload(f.actors.GRAPHIC, f.id, randomUUID(), {
    part: 'COLLAR_STAND',
    filename: 'pinned-collar-stand.pdf',
    base64: Buffer.from(attachmentBytes).toString('base64'),
  });
  const updated = (await f.production.detail(f.owner, f.id)).sheet;
  await f.production.action(f.actors.GRAPHIC, f.id, updated.rowVersion, 'ตรวจ PDF ครบ', 'ready');
  await f.db.query(
    "UPDATE document_jobs SET state='FAILED',attempts=5,last_error='PDF_PREPARATION_FAILED' WHERE kind='QUOTATION'",
  );
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      login = await f.auth.login(username, password, '127.0.0.1');
    await context.addCookies([
      { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    return context;
  }
  const context = await contextFor('fixture.admin', 'Fixture-production-password-123new'),
    page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/?quotation=' + quote.revisionId);
  const panel = page.getByRole('region', { name: 'Stored document' });
  await panel.getByText(/PDF preparation failed/).waitFor();
  await panel.getByLabel('Stored PDF retry reason').fill('แก้ปัญหาแล้วลองไฟล์ฉบับเดิม');
  let dropped = false;
  await page.route('**/api/v1/documents/*/*/*/retry', async (route) => {
    if (!dropped) {
      dropped = true;
      const r = await route.fetch();
      assert.equal(r.status(), 201);
      await route.abort('failed');
    } else await route.continue();
  });
  await panel.getByRole('button', { name: /Retry PDF preparation/ }).click();
  await panel.getByRole('button', { name: 'Retry same PDF request', exact: true }).click();
  await panel.getByText(/PDF queued/).waitFor();
  const renderer = async (payload) => {
    try {
      return await renderStoredPdf(payload);
    } catch (e) {
      console.error('Test render failed for ' + payload.source.kind, e);
      throw e;
    }
  };
  stopWorker = startWorker(f.db, base, renderer);
  async function waitFiles(expected) {
    for (let i = 0; i < 450; i++) {
      const rows = await f.db.query('SELECT kind,state,last_error,attempts FROM document_jobs');
      if (rows.every((r) => r.state === 'ISSUED') && rows.length >= expected) return;
      if (rows.some((r) => r.state === 'FAILED'))
        throw new Error('Rendering failed: ' + JSON.stringify(rows));
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('PDF queue timeout');
  }
  await waitFiles(5);
  await stopWorker();
  stopWorker = undefined;
  await panel.getByRole('button', { name: 'Refresh PDF status', exact: true }).click();
  await panel.getByRole('link', { name: /Download stored PDF/ }).waitFor();
  await mkdir('test-results', { recursive: true });
  await panel.screenshot({ path: 'test-results/stored-pdf-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'PDF controls overflow ' + width,
    );
  }
  await panel.screenshot({ path: 'test-results/stored-pdf-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const download = page.waitForEvent('download');
  await panel.getByRole('link', { name: /Download stored PDF/ }).click();
  const downloaded = await download;
  await downloaded.saveAs('test-results/stored-quotation.pdf');
  const quoteBytes = (await docs.file(f.owner, 'QUOTATION', quote.revisionId, 1)).bytes;
  assert.equal(hash(await readFile('test-results/stored-quotation.pdf')), hash(quoteBytes));
  const samples = [
    ['INVOICE', f.order.id, 1, 'stored-invoice'],
    ['RECEIPT', receipt.entryId, 1, 'stored-receipt'],
    ['PRODUCTION', f.id, 2, 'stored-production'],
  ];
  for (const [kind, id, version, name] of samples) {
    const file = await docs.file(f.owner, kind, id, version);
    await writeFile('test-results/' + name + '.pdf', file.bytes);
    const response = await context.request.get(
      `${base}/api/v1/documents/${kind}/${id}/${version}/file`,
    );
    assert.equal(response.status(), 200);
    assert(response.headers()['content-type'].includes('application/pdf'));
    assert.equal(response.headers()['x-document-sha256'], hash(file.bytes));
    assert.equal(hash(await response.body()), hash(file.bytes));
  }
  const anon = await browser.newContext();
  assert.equal(
    (await anon.request.get(base + '/api/v1/documents/INVOICE/' + f.order.id + '/1/file')).status(),
    401,
  );
  const graphic = await contextFor('fixture.graphic', 'Fixture-production-password-123new');
  assert.equal(
    (
      await graphic.request.get(base + '/api/v1/documents/INVOICE/' + f.order.id + '/1/file')
    ).status(),
    403,
  );
  assert.equal(
    (await graphic.request.get(base + '/api/v1/documents/PRODUCTION/' + f.id + '/2/file')).status(),
    200,
  );
  const parsed = await import('pdfjs-dist/legacy/build/pdf.mjs');
  async function pdfInfo(bytes) {
    const task = parsed.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }),
      pdf = await task.promise,
      texts = [];
    for (let n = 1; n <= pdf.numPages; n++)
      texts.push((await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(' '));
    const count = pdf.numPages;
    await task.destroy();
    return { count, texts };
  }
  for (const name of [
    'stored-quotation',
    'stored-invoice',
    'stored-receipt',
    'stored-production',
  ]) {
    const info = await pdfInfo(await readFile('test-results/' + name + '.pdf'));
    assert(
      info.texts.every((t) => t.trim().length > 20),
      'No blank pages: ' + name,
    );
    if (name === 'stored-production') {
      assert(info.count >= 3);
      assert(info.texts.join(' ').includes('pinned-collar-stand.pdf'));
    } else assert.equal(info.count, 1, name + ' standard one page');
  }
  const before = await settlements.detail(f.owner, f.order.id);
  await payments.void(f.actors.ADMIN, f.order.id, receipt.entryId, {
    requestId: randomUUID(),
    expectedVersion: before.version,
    orderRevision: 1,
    reason: 'บันทึกเงินผิดทดสอบ',
  });
  const savedReceipt = await docs.file(f.owner, 'RECEIPT', receipt.entryId, 1);
  assert.equal(hash(savedReceipt.bytes), hash(await readFile('test-results/stored-receipt.pdf')));
  assert((await docs.status(f.owner, 'RECEIPT', receipt.entryId, 1)).notice.includes('VOIDED'));
  await page.goto(base + '/?settlementOrder=' + f.order.id + '&paymentEntry=' + receipt.entryId);
  await page
    .getByRole('region', { name: 'Stored document' })
    .getByText(/VOIDED/)
    .waitFor();
  await f.drafts.save(f.owner, draft, {
    ...f.input,
    rowVersion: 1,
    reason: 'เปลี่ยนเป็นใบยาว',
    customerName: 'New customer name',
    lines: Array.from({ length: 30 }, () => ({ ...f.input.quote, quantity: 1, freeQuantity: 0 })),
  });
  const nextTerms = {
      draftVersion: 2,
      validUntil: businessDate(),
      notes: '30-line archived quotation',
    },
    nextCheck = await quotations.check(f.owner, draft, nextTerms),
    next = await quotations.issue(f.owner, draft, {
      ...nextTerms,
      requestId: randomUUID(),
      checkToken: nextCheck.checkToken,
      reason: 'ใบเสนอราคาฉบับใหม่',
    });
  stopWorker = startWorker(f.db, base, renderer);
  await waitFiles(6);
  await stopWorker();
  stopWorker = undefined;
  const long = await docs.file(f.owner, 'QUOTATION', next.revisionId, 2);
  await writeFile('test-results/stored-quotation-long.pdf', long.bytes);
  const longInfo = await pdfInfo(long.bytes);
  assert(longInfo.count > 1);
  assert(longInfo.texts.every((t) => t.trim().length > 20));
  assert.deepEqual((await docs.file(f.owner, 'QUOTATION', quote.revisionId, 1)).bytes, quoteBytes);
  assert.equal(
    (await f.db.query("SELECT id FROM audit_events WHERE action='DOCUMENT_RETRY_REQUESTED'"))
      .length,
    1,
  );
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
  const renderId = Date.now();
  let qrCount = 0;
  for (const name of [
    'stored-quotation',
    'stored-invoice',
    'stored-receipt',
    'stored-production',
    'stored-quotation-long',
  ]) {
    const prefix = `test-results/${name}-render-${renderId}`,
      result = spawnSync(
        process.env.PDFTOPPM_EXECUTABLE ?? 'pdftoppm',
        ['-r', '120', '-png', 'test-results/' + name + '.pdf', prefix],
        { encoding: 'utf8' },
      );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const files = (await readdir('test-results')).filter(
      (n) => n.startsWith(prefix.slice('test-results/'.length)) && n.endsWith('.png'),
    );
    for (const file of files) {
      const found = await decode(
        'data:image/png;base64,' + (await readFile('test-results/' + file)).toString('base64'),
      );
      if (found) {
        qrCount++;
        assert(found.startsWith(base + '/?'));
      }
    }
  }
  assert(qrCount >= 4, 'Quotation, receipt and production retain readable QR');
  assert.deepEqual(errors, []);
  console.log(
    `PASS: automatic stored PDFs for quotation/invoice/receipt/production, PDF attachment, exact byte downloads after revisions/void, protected routes, lost-response retry, mobile and PDF QR; long quotation ${longInfo.count} pages; rendered samples ${renderId}`,
  );
} finally {
  await stopWorker?.();
  await browser?.close();
  if (vite) {
    const stopped = new Promise((r) => vite.once('exit', r));
    vite.kill();
    await stopped;
  }
  await app?.close();
  await f.db.close();
}
