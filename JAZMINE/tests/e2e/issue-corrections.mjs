import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url),
  { productionFixture } = require('../../dist/tests/integration/helpers/production-fixture.js'),
  { resolvedIssue } = require('../../dist/tests/integration/helpers/resolved-issue.js'),
  { createApplication } = require('../../dist/apps/server/src/app.js'),
  { SettlementService } = require('../../dist/apps/server/src/settlements/settlement-service.js');
const f = await productionFixture(),
  port = 5184,
  apiPort = 3108,
  base = `http://127.0.0.1:${port}`;
let app, vite, browser;
try {
  const { issueId, replacementId } = await resolvedIssue(f, 3, 3);
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
  async function loggedIn(username, viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({ viewport }),
      login = await f.auth.login(username, 'Fixture-production-password-123new', '127.0.0.1');
    await context.addCookies([
      { name: 'jazmine_session', value: login.token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    return page;
  }
  const page = await loggedIn('fixture.admin'),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?productionWork=' + f.id);
  const issue = page.getByRole('article', { name: 'Issue ' + issueId });
  await issue.getByRole('button', { name: /Correct recorded quantities/ }).click();
  const form = issue.getByRole('form', { name: 'Correct resolved issue quantities' });
  await form.getByLabel('Correction scrapQty line 1', { exact: true }).fill('2');
  await form.getByLabel('Correction usableQty line 1', { exact: true }).fill('1');
  await form.getByLabel(`Correct replacement ${replacementId} line 1`, { exact: true }).fill('2');
  await form.getByLabel('Verified corrected physical stock').check();
  await form
    .getByLabel('Issue correction reason')
    .fill('ตรวจชิ้นงานจริง พบเสีย 2 ตัว ใช้ได้ 1 ตัว ลดร่างทดแทนตามจริง');
  await mkdir('test-results', { recursive: true });
  await form.screenshot({ path: 'test-results/issue-correction-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Correction overflow ' + width,
    );
  }
  await form.screenshot({ path: 'test-results/issue-correction-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let lost = false,
    savedCommand;
  await page.route('**/api/v1/production-exceptions/issues/*/corrections', async (route) => {
    if (!lost && route.request().method() === 'POST') {
      lost = true;
      savedCommand = route.request().postDataJSON();
      const response = await route.fetch();
      assert.equal(response.status(), 201, await response.text());
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await form.getByRole('button', { name: /Save quantity correction/ }).click();
  await form.getByRole('button', { name: /Retry quantity correction/ }).click();
  await issue.getByText(/Resolution & correction history \(2\)/).waitFor();
  await issue.locator('.issue-correction-history > summary').click();
  await issue
    .locator('.issue-correction-history')
    .screenshot({ path: 'test-results/issue-correction-history.png' });
  const detail = await f.exceptions.detail(f.owner, f.id);
  assert.equal(detail.issues[0].affected[0].quantity, 3);
  assert.equal(detail.issues[0].resolutionHistory.length, 2);
  assert.equal(detail.issues[0].resolutionHistory[0].rows[0].scrapQty, 3);
  assert.equal(detail.issues[0].resolutionHistory[1].rows[0].scrapQty, 2);
  assert.equal(
    (await f.production.detail(f.owner, replacementId)).sheet.allocations[0].quantity,
    2,
  );
  assert.equal(
    (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
    9,
  );
  assert.equal((await f.db.query('SELECT * FROM production_loss_adjustments')).length, 1);
  const staff = await loggedIn('fixture.printing', { width: 320, height: 900 });
  await staff.goto(base + '?productionWork=' + f.id);
  await staff.getByRole('article', { name: 'Issue ' + issueId }).waitFor();
  assert.equal(await staff.getByRole('button', { name: /Correct recorded quantities/ }).count(), 0);
  const denied = await staff.evaluate(
    async ({ id, input }) => {
      const session = await (await fetch('/api/v1/auth/session')).json();
      const read = await fetch(`/api/v1/production-exceptions/issues/${id}/correction`);
      const write = await fetch(`/api/v1/production-exceptions/issues/${id}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }),
      });
      return [read.status, write.status];
    },
    { id: issueId, input: savedCommand },
  );
  assert.deepEqual(denied, [403, 403]);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: ADMIN correction with original history, atomic replacement resize, 320/390px, lost-response retry once, current readiness and staff access protection',
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
