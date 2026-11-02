import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export async function verifyVolumeScreens({ apiPort, token, from, to, orders, sales }) {
  const port = 5182,
    base = `http://127.0.0.1:${port}`;
  const vite = spawn(
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
  const stopped = new Promise((resolve) => vite.once('exit', resolve));
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Volume UI startup timeout')), 20000);
      vite.stdout.on('data', (data) => {
        if (data.toString().includes('Local:')) {
          clearTimeout(timer);
          resolve();
        }
      });
      vite.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('Volume UI stopped: ' + code));
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([
      { name: 'jazmine_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page
      .locator('nav')
      .getByRole('button', { name: 'ລາຍງານເຈົ້າຂອງ / Reports', exact: true })
      .click();
    await page.getByLabel('Report from').fill(from);
    await page.getByLabel('Report to').fill(to);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/reports/summary?from=' + from) && r.status() === 200,
      ),
      page.getByRole('button', { name: 'Apply period' }).click(),
    ]);
    await page.getByRole('button', { name: 'Refresh reports', exact: true }).waitFor();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('.report-cards strong')[1]?.textContent === String(expected),
      orders,
    );
    assert.equal(
      (await page.locator('.report-cards strong').first().innerText()).replace(/[^0-9]/g, ''),
      sales,
    );
    assert.equal(await page.locator('.report-table tbody tr').count(), 25);
    const before = await page.locator('.report-table tbody a').first().getAttribute('href');
    await page.getByRole('button', { name: 'Next orders', exact: true }).click();
    await page.waitForFunction(
      (href) => document.querySelector('.report-table tbody a')?.getAttribute('href') !== href,
      before,
    );
    await page.screenshot({ path: 'test-results/volume-reports-desktop.png' });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Report overflow: ' + width,
      );
    }
    await page.screenshot({ path: 'test-results/volume-reports-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('nav').getByRole('button', { name: 'ຄົ້ນຫາ / Search', exact: true }).click();
    await page.getByLabel('Global search query').fill('LOAD-JAZ-009');
    await page.getByRole('button', { name: 'Search all' }).click();
    await page.locator('.search-results li').nth(24).waitFor();
    assert.equal(await page.locator('.search-results li').count(), 25);
    const first = await page.locator('.search-results a').first().getAttribute('href');
    await page.getByRole('button', { name: 'Next results', exact: true }).click();
    await page.waitForFunction(
      (href) => document.querySelector('.search-results a')?.getAttribute('href') !== href,
      first,
    );
    assert.equal(await page.locator('.search-results li').count(), 25);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: large-data report totals, report/search pagination and 320/390px browser layouts',
    );
    return {
      reportTotals: true,
      reportPagination: true,
      searchPagination: true,
      mobileWidths: [320, 390],
      pageErrors: errors,
    };
  } finally {
    await browser?.close();
    vite.kill();
    await stopped;
  }
}
