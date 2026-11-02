import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { reviseOrder } = require('../../dist/tests/integration/helpers/revise-order.js'),
  {
    RevisionReviewService,
  } = require('../../dist/apps/server/src/production/revision-review-service.js'),
  { revisionReviewSchema } = require('../../dist/packages/contracts/src/production-revisions.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js');
const f = await productionFixture(),
  port = 5191,
  apiPort = 3115,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  await f.action(f.id, 'PRINTING', 'start');
  await f.action(f.id, 'PRINTING', 'complete');
  await f.action(f.id, 'HEAT_TRANSFER', 'start');
  await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
  const reviews = new RevisionReviewService(f.db),
    v = await reviews.preview(f.owner, f.order.id);
  const p = await reviews.apply(
    f.actors.ADMIN,
    f.order.id,
    revisionReviewSchema.parse({
      requestId: randomUUID(),
      orderRevision: v.context.revision,
      checkToken: v.checkToken,
      reason: 'แผนทดสอบ',
      reviewedFiles: true,
      reviewedRemainder: true,
      decisions: v.sources.map((s) => ({
        sheetId: s.id,
        rows: s.lines.map((l) => ({
          sourceLineIndex: l.sourceLineIndex,
          targetLineIndex: l.targets[0].lineIndex,
          quantity: l.reusable,
        })),
      })),
    }),
  );
  const first = p.sheets[0].targetSheetId;
  await f.production.action(
    f.actors.GRAPHIC,
    first,
    (await f.production.detail(f.owner, first)).sheet.rowVersion,
    'ตรวจใบใช้ต่อแล้ว',
    'ready',
  );
  const originalStages = await f.db.query(
    'SELECT * FROM production_stage_work WHERE sheet_id=$1 ORDER BY sheet_version,department',
    [f.id],
  );
  const originalOrders = await f.db.query('SELECT * FROM order_revisions ORDER BY revision');
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
    const t = setTimeout(() => reject(new Error('Vite startup timeout ' + serverErrors)), 20000);
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
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE }
      : existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  async function session(username) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      login = await f.auth.login(username, 'Fixture-production-password-123new', '127.0.0.1');
    await ctx.addCookies([
      { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    return ctx;
  }
  const ctx = await session('fixture.admin'),
    page = await ctx.newPage(),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?prepareSheet=' + first);
  const panel = page.getByRole('region', { name: 'Production revision review' });
  await panel.getByRole('button', { name: 'Check plan reversal' }).click();
  await panel.getByRole('heading', { name: 'Reversal effects' }).waitFor();
  assert(await panel.getByRole('button', { name: 'Reverse entire reuse plan' }).isDisabled());
  await panel.getByLabel('Production reversal reason').fill('เลือกจำนวนผิด ขอวางแผนใหม่ทั้งชุด');
  await panel.getByLabel('Review production reversal effects').check();
  await mkdir('test-results', { recursive: true });
  await panel.screenshot({ path: 'test-results/production-reversal-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Reversal overflow ' + width,
    );
  }
  await panel.screenshot({ path: 'test-results/production-reversal-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let lost = false;
  await page.route('**/api/v1/production-revisions/reviews/*/reversal', async (route) => {
    if (!lost && route.request().method() === 'POST') {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await panel.getByRole('button', { name: 'Reverse entire reuse plan' }).click();
  await panel.getByRole('button', { name: 'Retry plan reversal' }).click();
  await panel.getByText('Plan reversed', { exact: false }).waitFor();
  assert(lost);
  assert.equal((await f.db.query('SELECT id FROM production_revision_reversals')).length, 1);
  assert.equal((await f.production.detail(f.owner, first)).sheet.state, 'CANCELLED');
  assert.equal((await f.production.detail(f.owner, f.id)).sheet.state, 'READY');
  assert.deepEqual(
    await f.db.query(
      'SELECT * FROM production_stage_work WHERE sheet_id=$1 ORDER BY sheet_version,department',
      [f.id],
    ),
    originalStages,
  );
  assert.deepEqual(
    await f.db.query('SELECT * FROM order_revisions ORDER BY revision'),
    originalOrders,
  );
  await panel.getByLabel(`Reuse quantity ${f.id} 0`).fill('11');
  await panel.getByLabel('Review unchanged files').check();
  await panel.getByLabel('Review unused quantities').check();
  await panel.getByLabel('Revision review reason').fill('วางแผนใหม่หลังตรวจจำนวนแล้ว');
  await panel.getByRole('button', { name: 'Confirm production review' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('input[aria-label^="Reuse quantity"]').length === 0,
  );
  const current = (
    await f.db.query(
      'SELECT target_sheet_id,review_id FROM production_revision_carries WHERE source_sheet_id=$1 AND active',
      [f.id],
    )
  )[0];
  const graphicCtx = await session('fixture.graphic'),
    graphicPage = await graphicCtx.newPage();
  await graphicPage.goto(base + '?prepareSheet=' + current.target_sheet_id);
  await graphicPage.getByLabel('เหตุผลใบผลิต').fill('ตรวจใบใหม่หลังย้อนแผน');
  await graphicPage
    .getByRole('button', { name: 'ตรวจครบแล้ว ทำใบผลิตให้พร้อม', exact: true })
    .click();
  await graphicPage.getByText('ใบผลิตพร้อม', { exact: false }).first().waitFor();
  const response = await graphicCtx.request.get(
    base + `/api/v1/production-revisions/reviews/${current.review_id}/reversal`,
  );
  assert.equal(response.status(), 403);
  await f.action(current.target_sheet_id, 'HEAT_TRANSFER', 'complete');
  await page.reload();
  await panel.getByRole('button', { name: 'Check plan reversal' }).click();
  await panel
    .getByText('New work, issues, delivery records or another reuse plan exists', { exact: false })
    .waitFor();
  assert(await panel.getByRole('button', { name: 'Reverse entire reuse plan' }).isDisabled());
  await panel.screenshot({ path: 'test-results/production-reversal-blocked.png' });
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get(
        base + `/api/v1/production-revisions/reviews/${current.review_id}/reversal`,
      )
    ).status(),
    401,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: whole-plan reversal from ADMIN UI, READY inherited-only progress, original history unchanged, lost-response retry once, fresh review and GRAPHIC approval, new-work blocker, protected endpoint and 320/390px layouts',
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
