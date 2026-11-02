import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volumeFixture } from './helpers/volume-fixture';
import { ReportService } from '../../apps/server/src/reports/report-service';
import { businessDate } from '../../packages/contracts/src/customers';

test('shared report calculation preserves large exact money, latest revisions, every page and empty periods', async () => {
  const f = await volumeFixture(100);
  try {
    const reports = new ReportService(f.db),
      today = businessDate();
    const from = new Date(Date.parse(today + 'T00:00:00Z') - 180 * 86400000)
      .toISOString()
      .slice(0, 10);
    await f.db.query(
      "UPDATE order_revisions SET snapshot=jsonb_set(snapshot,'{pricing,total}',$1::jsonb) WHERE order_id<>$2 AND revision=2",
      [JSON.stringify('9000000000000000'), f.order.id],
    );
    const expected = 9000000000000000n * 100n + BigInt(f.order.snapshot.pricing.total!);
    const seen = new Set<string>();
    for (let page = 1; page <= 5; page++) {
      const result = await reports.read(f.owner, { from, to: today, page });
      assert.equal(result.sales, String(expected));
      assert.equal(result.orders, 101);
      assert.equal(result.quantity, 1111);
      assert.equal(result.netCash, '15000000');
      assert.equal(result.outstanding, String(expected - 15000000n));
      assert.equal(
        result.trend.reduce((n, r) => n + BigInt(r.sales), 0n),
        expected,
      );
      assert.equal(result.rows.length, page === 5 ? 1 : 25);
      assert.equal(result.hasMore, page < 5);
      for (const row of result.rows) {
        assert(!seen.has(row.id));
        seen.add(row.id);
        assert.equal(
          row.total,
          row.id === f.order.id ? String(f.order.snapshot.pricing.total) : '9000000000000000',
        );
      }
      assert.equal(result.profit, null);
    }
    assert.equal(seen.size, 101);
    const empty = await reports.read(f.owner, { from: '2000-01-01', to: '2000-01-02', page: 1 });
    assert.equal(empty.orders, 0);
    assert.equal(empty.sales, '0');
    assert.equal(empty.cohortOutstanding, '0');
    assert.equal(empty.historicalOutstanding, '0');
    assert.deepEqual(empty.rows, []);
    assert.deepEqual(empty.trend, []);
    assert.equal(empty.hasMore, false);
    assert.equal(empty.outstanding, String(expected - 15000000n));
  } finally {
    await f.db.close();
  }
});
