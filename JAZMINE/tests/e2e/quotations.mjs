import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { QuotationService } = require('../../dist/apps/server/src/orders/quotation-service.js'),
  { businessDate } = require('../../dist/packages/contracts/src/customers.js');
const f = await productionFixture(),
  port = 5188,
  apiPort = 3112,
  base = `http://127.0.0.1:${port}`,
  draftId = randomUUID(),
  service = new QuotationService(f.db),
  customerName = 'Quotation browser sample';
let app, vite, browser;
try {
  await f.drafts.save(f.owner, draftId, { ...f.input, customerName });
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
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  const before = {
    orders: await f.db.query('SELECT * FROM orders ORDER BY id'),
    money: await f.db.query('SELECT * FROM payment_entries ORDER BY id'),
    production: await f.db.query('SELECT * FROM production_sheets ORDER BY id'),
  };
  async function openDraft() {
    await page.getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
    await page.getByText('ร่างที่บันทึกไว้ล่าสุด (สูงสุด 50 รายการ)', { exact: true }).click();
    await page
      .getByRole('button', { name: customerName + ' · ' + draftId.slice(-8), exact: true })
      .click();
  }
  async function check() {
    const panel = page.getByRole('region', { name: 'Quotation preparation' });
    await panel.getByLabel('Quotation valid until').fill(businessDate());
    await panel.getByLabel('Quotation notes').fill('ລາຄາສຳລັບລູກຄ້າ / Customer quotation');
    await panel.getByRole('button', { name: /Check quotation/ }).click();
    await panel.getByLabel('Quotation issue reason').fill('ส่งให้ลูกค้าตรวจราคา');
    return panel;
  }
  await page.goto(base);
  await openDraft();
  const panel = await check();
  assert.equal(await f.db.query('SELECT id FROM quotations').then((r) => r.length), 0);
  let dropped = false;
  await page.route('**/api/v1/quotations/drafts/*/issue', async (route) => {
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('failed');
    } else await route.continue();
  });
  await panel.getByRole('button', { name: /Issue quotation/ }).click();
  await panel.getByRole('button', { name: 'Retry quotation request', exact: true }).click();
  const link = panel.getByRole('link', { name: 'Open issued quotation', exact: true });
  await link.waitFor();
  assert.equal((await f.db.query('SELECT id FROM quotation_revisions')).length, 1);
  const href = await link.getAttribute('href'),
    v1id = new URL(base + href).searchParams.get('quotation'),
    v1 = await service.detail(f.owner, v1id),
    snapshot = structuredClone(v1.snapshot),
    url = base + '/?quotation=' + v1id;
  await page.goto(url);
  const document = page.locator('.quotation-print'),
    qr = page.locator('.quotation-qr[data-ready=true]');
  await qr.waitFor();
  assert((await document.innerText()).includes(v1.number));
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
  await document.screenshot({ path: 'test-results/quotation-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Quotation overflow ' + width,
    );
  }
  await document.screenshot({ path: 'test-results/quotation-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    globalThis.quotationPrintCalls = 0;
    window.print = () => {
      globalThis.quotationPrintCalls++;
    };
  });
  await page.getByRole('button', { name: /Print quotation PDF/ }).click();
  await page.waitForFunction(() => globalThis.quotationPrintCalls === 1);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({
      path: 'test-results/quotation.pdf',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    }),
    { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  async function pdfInfo(bytes) {
    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }),
      doc = await loading.promise,
      texts = [];
    for (let p = 1; p <= doc.numPages; p++)
      texts.push((await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(' '));
    const pages = doc.numPages;
    await loading.destroy();
    return { pages, texts };
  }
  const standard = await pdfInfo(pdf);
  assert.equal(standard.pages, 1);
  assert(standard.texts[0].includes(v1.number));
  assert(standard.texts[0].includes('Staff sign-in required'));
  assert(standard.texts[0].includes('Quotation only'));
  function render(path, prefix) {
    const result = spawnSync(
      process.env.PDFTOPPM_EXECUTABLE ?? 'pdftoppm',
      ['-r', '140', '-png', path, prefix],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  const standardPrefix = 'test-results/quotation-render-' + Date.now();
  render('test-results/quotation.pdf', standardPrefix);
  const standardFile = (await readdir('test-results')).find(
    (n) => n.startsWith(standardPrefix.slice('test-results/'.length)) && n.endsWith('.png'),
  );
  assert.equal(
    await decode(
      'data:image/png;base64,' +
        (await readFile('test-results/' + standardFile)).toString('base64'),
    ),
    url,
  );
  await page.emulateMedia({ media: 'screen' });
  const anonymous = await browser.newContext(),
    anon = await anonymous.newPage();
  await anon.goto(url);
  await anon.locator('input[name=username]').waitFor();
  assert.equal(await anon.locator('.quotation-print').count(), 0);
  assert.equal(
    (await anon.request.get(base + '/api/v1/quotations/revisions/' + v1id)).status(),
    401,
  );
  const graphic = await contextFor('fixture.graphic', 'Fixture-production-password-123new');
  assert.equal(
    (await graphic.request.get(base + '/api/v1/quotations/revisions/' + v1id)).status(),
    403,
  );
  const graphicPage = await graphic.newPage();
  await graphicPage.goto(url);
  await graphicPage.getByRole('button', { name: 'ออกจากระบบ', exact: true }).waitFor();
  assert.equal(await graphicPage.locator('.quotation-print').count(), 0);
  assert.equal(await graphicPage.getByRole('button', { name: /Quotations/ }).count(), 0);
  await f.drafts.save(f.owner, draftId, {
    ...f.input,
    customerName,
    rowVersion: 1,
    reason: 'ปรับจำนวน',
    quote: { ...f.input.quote, quantity: 12 },
  });
  await page.reload();
  await page.getByText(/The draft changed/).waitFor();
  await openDraft();
  const panel2 = await check();
  await panel2.getByRole('button', { name: /Issue quotation/ }).click();
  await panel2.getByRole('link', { name: 'Open issued quotation', exact: true }).waitFor();
  const v2 = (await service.history(f.owner, draftId)).revisions[0];
  assert.equal(v2.revision, 2);
  assert.equal(v2.number, v1.number);
  assert.deepEqual((await service.detail(f.owner, v1id)).snapshot, snapshot);
  await page.goto(url);
  await qr.waitFor();
  await page.getByText('Superseded quotation', { exact: false }).waitFor();
  assert.equal(await decode(await qr.locator('img').getAttribute('src')), url);
  assert((await document.innerText()).includes('1,100,000'));
  await f.drafts.save(f.owner, draftId, {
    ...f.input,
    customerName,
    rowVersion: 2,
    reason: 'ใบเสนอราคาหลายรายการ',
    lines: Array.from({ length: 30 }, () => ({ ...f.input.quote, quantity: 1, freeQuantity: 0 })),
  });
  const terms = { draftVersion: 3, validUntil: businessDate(), notes: '30-line quotation' },
    checked = await service.check(f.owner, draftId, terms),
    long = await service.issue(f.owner, draftId, {
      ...terms,
      requestId: randomUUID(),
      checkToken: checked.checkToken,
      reason: 'ทดสอบแบ่งหน้า A4',
    }),
    longUrl = base + '/?quotation=' + long.revisionId;
  await page.goto(longUrl);
  await qr.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  const longPdf = await page.pdf({
      path: 'test-results/quotation-long.pdf',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    }),
    longInfo = await pdfInfo(longPdf);
  assert(longInfo.pages > 1);
  assert(
    longInfo.texts.every((t) => t.trim().length > 10),
    'No blank pages',
  );
  assert.equal(longInfo.texts.filter((t) => t.includes('Staff sign-in required')).length, 1);
  const longPrefix = 'test-results/quotation-long-render-' + Date.now();
  render('test-results/quotation-long.pdf', longPrefix);
  const files = (await readdir('test-results')).filter(
    (n) => n.startsWith(longPrefix.slice('test-results/'.length)) && n.endsWith('.png'),
  );
  assert.equal(files.length, longInfo.pages);
  let decoded = 0;
  for (const file of files)
    if (
      (await decode(
        'data:image/png;base64,' + (await readFile('test-results/' + file)).toString('base64'),
      )) === longUrl
    )
      decoded++;
  assert.equal(decoded, 1);
  assert.deepEqual(await f.db.query('SELECT * FROM orders ORDER BY id'), before.orders);
  assert.deepEqual(await f.db.query('SELECT * FROM payment_entries ORDER BY id'), before.money);
  assert.deepEqual(
    await f.db.query('SELECT * FROM production_sheets ORDER BY id'),
    before.production,
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: quotation UI, lost-response retry, immutable revisions, staff-only QR, mobile 320/390px, actual A4 PDF (${standard.pages} standard / ${longInfo.pages} long pages), QR decoded from printed PDF; no order/payment/production effects`,
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
