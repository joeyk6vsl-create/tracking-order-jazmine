import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { reviseOrder } = require('../../dist/tests/integration/helpers/revise-order.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js');
const f = await productionFixture(),
  port = 5183,
  apiPort = 3107,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  await f.action(f.id, 'PRINTING', 'start');
  await f.action(f.id, 'PRINTING', 'complete');
  await f.action(f.id, 'HEAT_TRANSFER', 'start');
  await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
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
  await page.goto(base);
  await page.locator('nav').getByRole('button', { name: 'เตรียมใบผลิต', exact: true }).click();
  await page.getByLabel('ออเดอร์ที่ต้องเตรียม').selectOption(f.order.id);
  const panel = page.getByRole('region', { name: 'Production revision review' });
  await panel.getByRole('heading', { name: 'Review previous production' }).waitFor();
  await page.getByLabel(`Reuse quantity ${f.id} 0`).fill('11');
  await page.getByLabel('Review unchanged files').check();
  await page.getByLabel('Review unused quantities').check();
  await page
    .getByLabel('Revision review reason')
    .fill('ตรวจแบบเหมือนเดิม ใช้ต่องานพิมพ์และรีดที่ทำไว้แล้ว');
  await mkdir('test-results', { recursive: true });
  await panel.screenshot({ path: 'test-results/production-revision-review-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Review overflow ' + width,
    );
  }
  await panel.screenshot({ path: 'test-results/production-revision-review-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let lost = false;
  await page.route('**/api/v1/production-revisions/orders/*', async (route) => {
    if (!lost && route.request().method() === 'POST') {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await panel.getByRole('button', { name: 'Confirm production review' }).click();
  await panel.getByRole('button', { name: 'Retry production review' }).click();
  await panel.getByText('Reviewed Order v2').waitFor();
  assert.equal((await f.db.query('SELECT id FROM production_revision_reviews')).length, 1);
  const carry = (
      await f.db.query(
        'SELECT target_sheet_id FROM production_revision_carries WHERE source_sheet_id=$1',
        [f.id],
      )
    )[0],
    target = String(carry.target_sheet_id);
  assert.equal((await f.production.detail(f.owner, target)).sheet.state, 'DRAFT');
  assert.equal(
    (await f.work.queue(f.actors.PRINTING, { state: 'ACTIVE', search: '' })).pendingReviews.length,
    1,
  );
  const graphicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    graphic = await f.auth.login(
      'fixture.graphic',
      'Fixture-production-password-123new',
      '127.0.0.1',
    );
  await graphicContext.addCookies([
    { name: 'jazmine_session', value: graphic.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const graphicPage = await graphicContext.newPage();
  await graphicPage.goto(base + '?prepareSheet=' + target);
  await graphicPage.getByText('Continued work awaiting approval:', { exact: false }).waitFor();
  await graphicPage.getByLabel('เหตุผลใบผลิต').fill('กราฟิกตรวจจำนวนและไฟล์ใช้ต่อแล้ว');
  await graphicPage
    .getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true })
    .click();
  await graphicPage.getByText('ใบผลิตพร้อม', { exact: false }).first().waitFor();
  const work = (await f.work.detail(f.owner, target)).job;
  assert.equal(work.stages[0].state, 'COMPLETED');
  assert.equal(work.stages[1].state, 'IN_PROGRESS');
  assert.equal(work.stages[2].state, 'NOT_STARTED');
  assert.equal(work.blocked, null);
  const history = (await f.production.history(f.owner, target)).versions[0].snapshot;
  assert.equal(history.continuedFrom.sheetId, f.id);
  await page.goto(base + '?productionWork=' + target);
  await page.getByText('Earlier progress is retained', { exact: false }).waitFor();
  const staffContext = await browser.newContext(),
    staff = await f.auth.login(
      'fixture.printing',
      'Fixture-production-password-123new',
      '127.0.0.1',
    );
  await staffContext.addCookies([
    { name: 'jazmine_session', value: staff.token, url: base, httpOnly: true, sameSite: 'Lax' },
  ]);
  const staffPage = await staffContext.newPage();
  await staffPage.goto(base + '?productionWork=' + target);
  await staffPage.getByText('Earlier progress is retained', { exact: false }).waitFor();
  assert.equal(
    await staffPage.evaluate(
      async (id) => (await fetch('/api/v1/production-revisions/orders/' + id)).status,
      f.order.id,
    ),
    403,
  );
  const print = await page.context().newPage();
  await print.goto(base + `?productionSheet=${target}&version=1`);
  await print.locator('.ps-print-root[data-ready=true]').waitFor();
  await print.emulateMedia({ media: 'print' });
  const sizes = await print
    .locator('.ps-page')
    .evaluateAll((pages) =>
      pages.map((p) => ({ height: p.scrollHeight, width: p.getBoundingClientRect().width })),
    );
  assert(
    sizes.every((s) => s.height <= 1063 && Math.abs(s.width - 733.2) < 2),
    JSON.stringify(sizes),
  );
  const pdf = await print.pdf({
    path: 'test-results/production-revision-carried.pdf',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const doc = await loadingTask.promise;
  assert.equal(doc.numPages, 2);
  const pdfPage = await doc.getPage(1),
    text = (await pdfPage.getTextContent()).items.map((i) => i.str).join(' ');
  assert(text.includes('CONTINUED FROM'));
  assert(text.includes(history.continuedFrom.number));
  assert(text.includes(history.sheetNumber));
  assert(text.includes('Rev 2'));
  await loadingTask.destroy();
  await print
    .locator('.ps-page')
    .first()
    .screenshot({ path: 'test-results/production-revision-carried-page.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: ADMIN revision review, graphic approval gate, pending department notice, 320/390px, lost-response retry once, retained stage progress, staff source notice and access control, new A4 PDF with provenance and exact two pages',
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
