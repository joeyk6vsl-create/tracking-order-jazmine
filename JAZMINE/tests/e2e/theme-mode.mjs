import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { Database } = require('../../dist/apps/server/src/database.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const port = 5189;
const apiPort = 3189;
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('[name=displayName]').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('button', { name: /Switch to dark mode/ }).click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/theme-login-dark.png', fullPage: true });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('jazmine.theme')), 'dark');
  assert.equal(
    await page.locator('.login-main').evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(13, 22, 35)',
  );
  await page.reload();
  await page.locator('[name=displayName]').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.locator('[name=displayName]').fill('Dark mode test owner');
  await page.locator('[name=username]').fill('theme.test');
  await page.locator('[name=password]').fill(randomBytes(18).toString('base64url'));
  await page.locator('form button[type=submit], form button.primary').click();
  await page.getByRole('button', { name: 'จัดการทีมงาน', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(
    await page.locator('.sidebar').evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(25, 38, 56)',
  );
  await page.screenshot({ path: 'test-results/theme-dashboard-dark.png', fullPage: true });
  await page.locator('nav').getByRole('button', { name: 'ร่างออเดอร์', exact: true }).click();
  await page.locator('nav button[aria-current=page]').getByText('ร่างออเดอร์').waitFor();
  assert.equal(
    await page
      .locator('.panel')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(25, 38, 56)',
  );
  await page.screenshot({ path: 'test-results/theme-orders-dark.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: 'test-results/theme-dashboard-mobile-dark.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: /Switch to light mode/ }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.emulateMedia({ media: 'print' });
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(255, 255, 255)',
  );
  await page.emulateMedia({ media: 'screen' });
  const darkSystem = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const fresh = await darkSystem.newPage();
  await fresh.goto(`http://127.0.0.1:${port}`);
  await fresh.locator('html[data-theme=dark]').waitFor();
  assert.equal(
    await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await darkSystem.close();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Theme toggle, saved preference, system default, mobile and print checks passed');
} finally {
  await browser?.close();
  vite.kill();
  await app.close();
  await db.close();
}
