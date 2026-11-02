import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import type {
  DocumentRenderPayload,
  DocumentSource,
} from '../../../../packages/contracts/src/documents';
import type { Sql } from '../database';
export type PdfRenderer = (input: DocumentRenderPayload) => Promise<Uint8Array>;
export async function pinnedAssets(
  sql: Sql,
  source: DocumentSource,
): Promise<DocumentRenderPayload['assets']> {
  const result: DocumentRenderPayload['assets'] = {};
  if (source.kind === 'INVOICE') {
    for (const ref of source.paymentQrs ?? []) {
      const row = (
        await sql.query(
          'SELECT print_data,print_sha256 FROM payment_qr_versions WHERE id=$1 AND currency=$2 AND version=$3',
          [ref.id, ref.currency, ref.version],
        )
      )[0];
      if (!row) throw new Error('PINNED_PAYMENT_QR_MISSING');
      const bytes = Buffer.from(row.print_data as Uint8Array);
      if (
        createHash('sha256').update(bytes).digest('hex') !== ref.imageSha256 ||
        row.print_sha256 !== ref.imageSha256
      )
        throw new Error('PINNED_PAYMENT_QR_INTEGRITY');
      result[ref.id] = { mime: 'image/png', base64: bytes.toString('base64') };
    }
    return result;
  }
  if (source.kind !== 'PRODUCTION') return result;
  let total = 0;
  for (const [table, items] of [
    ['graphic_assets', source.document.context.assets],
    ['production_part_files', source.document.files],
  ] as const) {
    for (const item of items) {
      const row = (
        await sql.query(`SELECT mime,file_data,sha256 FROM ${table} WHERE id=$1`, [item.id])
      )[0];
      if (
        !row ||
        !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(String(row.mime)) ||
        row.mime !== item.mime
      )
        throw new Error('PINNED_ASSET_UNAVAILABLE');
      const bytes = Buffer.from(row.file_data as Uint8Array);
      total += bytes.length;
      if (
        total > 64 * 1024 * 1024 ||
        createHash('sha256').update(bytes).digest('hex') !== row.sha256
      )
        throw new Error('PINNED_ASSET_INTEGRITY');
      result[item.id] = { mime: String(row.mime), base64: bytes.toString('base64') };
    }
  }
  return result;
}
const rendererOrigin = 'http://jazmine-render.invalid';
export async function renderStoredPdf(input: DocumentRenderPayload): Promise<Uint8Array> {
  if (input.templateVersion !== 'archive-v1') throw new Error('TEMPLATE_UNAVAILABLE');
  const root = resolve('dist/document-renderer/archive-v1'),
    files = await readdir(root, { recursive: true, withFileTypes: true }),
    allowed = new Set(
      files
        .filter((f) => f.isFile())
        .map((f) => '/' + relative(root, join(f.parentPath, f.name)).split(sep).join('/')),
    );
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    executable =
      process.env.JAZMINE_PDF_BROWSER ||
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch({
    headless: true,
    ...(executable ? { executablePath: executable } : {}),
    timeout: 15000,
  });
  const deadline = setTimeout(() => void browser.close().catch(() => {}), 85000);
  try {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
      timezoneId: 'Asia/Vientiane',
      locale: 'lo-LA',
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== rendererOrigin || route.request().method() !== 'GET' || url.search) {
        await route.abort();
        return;
      }
      if (url.pathname === '/render.html') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="lo"><head><meta charset="utf-8"><link rel="stylesheet" href="/document-renderer.css"></head><body><div id="root"></div><script type="module" src="/document-renderer.js"></script></body></html>',
        });
        return;
      }
      if (!allowed.has(url.pathname)) {
        await route.abort();
        return;
      }
      const mime =
        url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')
          ? 'application/javascript'
          : url.pathname.endsWith('.css')
            ? 'text/css'
            : url.pathname.endsWith('.wasm')
              ? 'application/wasm'
              : url.pathname.endsWith('.woff2')
                ? 'font/woff2'
                : 'application/octet-stream';
      await route.fulfill({
        contentType: mime,
        body: await readFile(join(root, url.pathname.slice(1))),
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(rendererOrigin + '/render.html');
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async (payload) => {
      await (
        globalThis as unknown as { jazmineRender: (p: DocumentRenderPayload) => Promise<void> }
      ).jazmineRender(payload);
    }, input);
    const source = input.source;
    const reference =
      (source.kind === 'INVOICE'
        ? source.document.invoiceNumber
        : source.kind === 'PRODUCTION'
          ? source.document.sheetNumber
          : source.document.number) ?? '';
    const version =
      source.kind === 'RECEIPT'
        ? 1
        : source.kind === 'PRODUCTION'
          ? source.document.version
          : source.document.revision;
    const footerReference = reference
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: input.source.kind !== 'PRODUCTION',
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:10pt;width:100%;text-align:center;font-family:Arial">${footerReference} · v${version} · Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
