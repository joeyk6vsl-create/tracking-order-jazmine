import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { verifyVolumeScreens } from './browser-checks.mjs';
const require = createRequire(import.meta.url);
const { volumeFixture } = require('../../dist/tests/integration/helpers/volume-fixture.js');
const { createApplication } = require('../../dist/apps/server/src/app.js');
const { businessDate } = require('../../dist/packages/contracts/src/customers.js');
const label = process.argv[2] ?? 'latest';
if (!/^[a-z0-9-]{1,30}$/.test(label)) throw new Error('Invalid report label');
const started = performance.now(),
  f = await volumeFixture(),
  seededMs = performance.now() - started;
let app;
try {
  app = await createApplication(
    { production: false, origin: 'http://localhost:5190', port: 0, dataDir: ':memory:' },
    f.db,
    false,
  );
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address(),
    base = `http://127.0.0.1:${address.port}/api/v1`;
  const login = await f.auth.login('fixture.owner', 'Fixture-production-password-123', '127.0.0.1');
  const cookie = `jazmine_session=${login.token}`;
  const today = businessDate(),
    from = new Date(Date.parse(today + 'T00:00:00Z') - 180 * 86400000).toISOString().slice(0, 10);
  const metrics = [];
  async function request(path) {
    const response = await fetch(base + path, {
      headers: { cookie },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, path);
    const bytes = Buffer.from(await response.arrayBuffer());
    return { data: JSON.parse(bytes.toString()), bytes: bytes.length };
  }
  async function measure(name, path, check) {
    const samples = [];
    let bytes = 0;
    for (let i = 0; i < 8; i++) {
      const start = performance.now(),
        result = await request(path);
      check(result.data);
      bytes = Math.max(bytes, result.bytes);
      if (i) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const result = {
      name,
      samples: samples.length,
      p50Ms: Math.round(samples[3]),
      p95Ms: Math.round(samples[6]),
      maxBytes: bytes,
    };
    assert(bytes < 1500000, name + ': unbounded response');
    metrics.push(result);
    console.log(JSON.stringify(result));
  }
  await measure('customer-page', '/customers?status=ACTIVE&limit=25', (v) =>
    assert.equal(v.customers.length, 25),
  );
  await measure('search-order', '/search?q=LOAD-JAZ-009', (v) => {
    assert(v.results.length <= 25);
    assert(v.nextCursor);
  });
  await measure('work-queue', '/production-work/jobs?state=ACTIVE', (v) => {
    assert.equal(v.jobs.length, 50);
    assert.equal(v.hasMore, true);
  });
  await measure('payments-list', '/settlements/orders?search=Load', (v) =>
    assert.equal(v.orders.length, 50),
  );
  await measure('settlement-detail', '/settlements/orders/' + f.order.id, (v) =>
    assert.equal(v.money.netPaid, '0'),
  );
  await measure('reports-180-days', `/reports/summary?from=${from}&to=${today}&page=1`, (v) => {
    assert.equal(v.orders, f.volume.orders);
    assert.equal(v.sales, f.expected.sales);
    assert.equal(v.outstanding, f.expected.outstanding);
    assert.equal(v.netCash, f.expected.netPaid);
    assert.equal(v.profit, null);
    assert.equal(v.rows.length, 25);
  });
  const waveStarted = performance.now();
  const mixed = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      request(
        i % 3 === 0
          ? `/reports/summary?from=${from}&to=${today}&page=1`
          : i % 3 === 1
            ? '/search?q=LOAD-JAZ-009'
            : '/production-work/jobs?state=ACTIVE',
      ),
    ),
  );
  assert.equal(mixed.length, 12);
  const report = {
    createdAt: new Date().toISOString(),
    label,
    mode: 'isolated-memory-database-real-loopback-http',
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryGiB: Math.round(totalmem() / 1024 ** 3),
    volume: f.volume,
    seedMs: Math.round(seededMs),
    metrics,
    simultaneousRequests: 12,
    mixedWaveMs: Math.round(performance.now() - waveStarted),
    correctness: 'all assertions passed',
    limitations: [
      'Local PGlite serializes database operations; this does not certify external PostgreSQL or internet latency.',
      'Bulk fixtures measure reads; business writes are tested through services and HTTP separately.',
      'Small repeated sample; p95 is the slowest of seven measured requests, excluding one warmup.',
    ],
  };
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/local-load-${label}.json`, JSON.stringify(report, null, 2));
  if (label !== 'baseline') {
    report.browser = await verifyVolumeScreens({
      apiPort: address.port,
      token: login.token,
      from,
      to: today,
      orders: f.volume.orders,
      sales: f.expected.sales,
    });
    await writeFile(`test-results/local-load-${label}.json`, JSON.stringify(report, null, 2));
  }
  console.log(
    'PASS: volume totals, bounded responses and 12 simultaneous HTTP reads; mixed wave ' +
      report.mixedWaveMs +
      'ms',
  );
} finally {
  await app?.close();
  await f.db.close();
}
