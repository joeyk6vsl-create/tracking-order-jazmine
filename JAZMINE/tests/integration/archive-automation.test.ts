import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import {
  completedOrder,
  lifecycleInput,
  settlementInput,
  receive,
} from './helpers/archive-fixture';
import { ArchiveAutomationService } from '../../apps/server/src/orders/archive-automation-service';
import { OrderLifecycleService } from '../../apps/server/src/orders/order-lifecycle-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import {
  archiveSettingsSchema,
  cancellationAgreementSchema,
} from '../../packages/contracts/src/order-lifecycle';
import { refundSchema } from '../../packages/contracts/src/settlement';
import { draftSchema } from '../../packages/contracts/src/orders';
import { AppError } from '../../apps/server/src/errors';
import { Database } from '../../apps/server/src/database';
import type { Sql } from '../../apps/server/src/database';
import { unpackDump } from '../../apps/server/src/backups/archive';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
test('an interrupted automatic archive rolls back state and audit together, then retries without duplicate history', async () => {
  const f = await productionFixture();
  try {
    await completedOrder(f);
    const a = new ArchiveAutomationService(f.db);
    await enable(a, f.owner);
    await a.processBatch();
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '16 days'");
    const original = f.db.transaction.bind(f.db);
    let calls = 0;
    f.db.transaction = async function <T>(run: (sql: Sql) => Promise<T>): Promise<T> {
      return original(async (sql) => {
        const result = await run(sql);
        if (++calls === 2) throw new Error('Simulated interruption after archive writes');
        return result;
      });
    };
    try {
      assert.equal(await a.processBatch(), 0);
    } finally {
      f.db.transaction = original;
    }
    assert.equal((await f.db.query('SELECT storage_state FROM orders'))[0].storage_state, 'ACTIVE');
    assert.equal(
      (await f.db.query("SELECT id FROM order_lifecycle_events WHERE kind='ARCHIVE'")).length,
      0,
    );
    assert.equal(await a.processBatch(), 1);
    assert.equal(
      (await f.db.query("SELECT id FROM order_lifecycle_events WHERE kind='ARCHIVE'")).length,
      1,
    );
  } finally {
    await f.db.close();
  }
});
async function enable(
  service: ArchiveAutomationService,
  actor: Awaited<ReturnType<typeof productionFixture>>['owner'],
) {
  const v = await service.settings(actor);
  return service.save(actor, {
    requestId: randomUUID(),
    rowVersion: v.rowVersion,
    enabled: true,
    reason: 'เปิดเฉพาะฐานทดสอบ',
  });
}
test('automatic archive starts disabled, is owner-only, strict, idempotent and rejects stale or revoked settings', async () => {
  const f = await productionFixture();
  try {
    const a = new ArchiveAutomationService(f.db);
    assert.equal((await a.settings(f.owner)).enabled, false);
    assert.equal(await a.processBatch(), 0);
    for (const actor of [f.actors.ADMIN, f.actors.GRAPHIC]) {
      await assert.rejects(a.settings(actor), code('PERMISSION_DENIED'));
      await assert.rejects(
        a.save(actor, { requestId: randomUUID(), rowVersion: 0, enabled: true, reason: 'ลอง' }),
        code('PERMISSION_DENIED'),
      );
    }
    const input = { requestId: randomUUID(), rowVersion: 0, enabled: true, reason: 'ตรวจแล้ว' };
    assert(!archiveSettingsSchema.safeParse({ ...input, reason: ' ' }).success);
    assert(!archiveSettingsSchema.safeParse({ ...input, deleteRecords: true }).success);
    const [v, replay] = await Promise.all([a.save(f.owner, input), a.save(f.owner, input)]);
    assert.deepEqual(v, replay);
    assert.equal(v.rowVersion, 1);
    await assert.rejects(a.save(f.owner, { ...input, enabled: false }), code('REQUEST_CONFLICT'));
    await assert.rejects(
      a.save(f.owner, { ...input, requestId: randomUUID() }),
      code('STALE_STATE'),
    );
    await f.db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1', [f.owner.id]);
    await assert.rejects(a.save(f.owner, input), code('AUTHENTICATION_REQUIRED'));
  } finally {
    await f.db.close();
  }
});
test('clear completed work waits 15 days from observation, archives only once across workers and retains historical data and recovery settings', async () => {
  const f = await productionFixture();
  try {
    await completedOrder(f);
    const a = new ArchiveAutomationService(f.db);
    await enable(a, f.owner);
    const before = await f.db.query('SELECT * FROM payment_entries ORDER BY id'),
      versions = await f.db.query('SELECT * FROM order_revisions ORDER BY revision');
    assert.equal(await a.processBatch(), 0);
    assert(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
    );
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '14 days'");
    assert.equal(await a.processBatch(), 0);
    await f.db.query(
      "UPDATE order_archive_candidates SET eligible_since=now()-interval '15 days 1 second'",
    );
    assert.equal(
      (await Promise.all([a.processBatch(), a.processBatch()])).reduce((x, y) => x + y, 0),
      1,
    );
    assert.equal(
      (await f.db.query('SELECT storage_state FROM orders'))[0].storage_state,
      'ARCHIVED',
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT * FROM order_lifecycle_events WHERE kind='ARCHIVE' AND detail->>'automatic'='true'",
        )
      ).length,
      1,
    );
    assert.deepEqual(await f.db.query('SELECT * FROM payment_entries ORDER BY id'), before);
    assert.deepEqual(await f.db.query('SELECT * FROM order_revisions ORDER BY revision'), versions);
    const dump = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await dump.arrayBuffer())),
      );
    try {
      assert.equal((await new ArchiveAutomationService(copy).settings(f.owner)).enabled, true);
      assert.equal(
        (
          await copy.query(
            "SELECT * FROM order_lifecycle_events WHERE kind='ARCHIVE' AND detail->>'automatic'='true'",
          )
        ).length,
        1,
      );
    } finally {
      await copy.close();
    }
  } finally {
    await f.db.close();
  }
});
test('unpaid deliveries and unconfirmed draft changes never become automatic archive candidates', async () => {
  const f = await productionFixture();
  try {
    await completedOrder(f, false);
    const a = new ArchiveAutomationService(f.db);
    await enable(a, f.owner);
    assert.equal(await a.processBatch(), 0);
    assert.equal(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
      null,
    );
    await receive(f, String(f.order.snapshot.pricing.total));
    await a.processBatch();
    assert(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
    );
    const row = (
      await f.db.query('SELECT row_version FROM order_drafts WHERE id=$1', [f.draftId])
    )[0];
    await f.drafts.save(
      f.owner,
      f.draftId,
      draftSchema.parse({
        ...f.input,
        rowVersion: Number(row.row_version),
        reason: 'แก้งานแต่ยังไม่ยืนยัน',
      }),
    );
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '20 days'");
    assert.equal(await a.processBatch(), 0);
    assert.equal(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
      null,
    );
    assert(
      (await new OrderLifecycleService(f.db).preview(f.owner, f.order.id)).archive.reasons.some(
        (r) => r.includes('unconfirmed order'),
      ),
    );
  } finally {
    await f.db.close();
  }
});
test('cancelled orders require an explicit cleared agreement and closed work, then wait without requiring the original sale to be paid', async () => {
  const f = await productionFixture();
  try {
    const a = new ArchiveAutomationService(f.db),
      life = new OrderLifecycleService(f.db);
    await enable(a, f.owner);
    await life.command(f.owner, f.order.id, 'cancel', await lifecycleInput(f));
    await a.processBatch();
    assert.equal(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
      null,
    );
    await life.command(
      f.owner,
      f.order.id,
      'agreement',
      cancellationAgreementSchema.parse({ ...(await lifecycleInput(f)), agreedTotal: '0' }),
    );
    await a.processBatch();
    assert.equal(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
      null,
    );
    await f.production.action(
      f.actors.GRAPHIC,
      f.id,
      (await f.production.detail(f.owner, f.id)).sheet.rowVersion,
      'ตรวจงานค้างแล้วปิด',
      'cancel',
    );
    await a.processBatch();
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '16 days'");
    assert.equal(await a.processBatch(), 1);
    const order = (await f.db.query('SELECT business_state,storage_state FROM orders'))[0];
    assert.equal(order.business_state, 'CANCELLED');
    assert.equal(order.storage_state, 'ARCHIVED');
  } finally {
    await f.db.close();
  }
});
test('restore, refunds, disabling and re-enabling restart observation; automatic archive never hides unresolved new work', async () => {
  const f = await productionFixture();
  try {
    const receipt = await completedOrder(f),
      a = new ArchiveAutomationService(f.db),
      life = new OrderLifecycleService(f.db);
    await enable(a, f.owner);
    await a.processBatch();
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '16 days'");
    assert.equal(await a.processBatch(), 1);
    await life.command(f.owner, f.order.id, 'restore', await lifecycleInput(f));
    assert.equal(await a.processBatch(), 0);
    await f.db.query("UPDATE order_archive_candidates SET eligible_since=now()-interval '16 days'");
    const v = await a.settings(f.owner);
    await a.save(f.owner, {
      requestId: randomUUID(),
      rowVersion: v.rowVersion,
      enabled: false,
      reason: 'หยุดทดสอบ',
    });
    assert.equal(await a.processBatch(), 0);
    await enable(a, f.owner);
    assert.equal(await a.processBatch(), 0);
    await new PaymentService(f.db).refund(
      f.owner,
      f.order.id,
      refundSchema.parse({
        ...(await settlementInput(f)),
        receiptId: receipt!.entryId,
        amount: '1000',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
      }),
    );
    await a.processBatch();
    assert.equal(
      (await f.db.query('SELECT eligible_since FROM order_archive_candidates'))[0].eligible_since,
      null,
    );
    await receive(f, '1000');
    await a.processBatch();
    const c = (
      await f.db.query(
        "SELECT eligible_since>now()-interval '1 minute' AS recent FROM order_archive_candidates",
      )
    )[0];
    assert.equal(c.recent, true);
  } finally {
    await f.db.close();
  }
});
