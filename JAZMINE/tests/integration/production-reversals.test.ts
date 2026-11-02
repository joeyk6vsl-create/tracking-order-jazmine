import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { reviseOrder } from './helpers/revise-order';
import { RevisionReviewService } from '../../apps/server/src/production/revision-review-service';
import { RevisionReversalService } from '../../apps/server/src/production/revision-reversal-service';
import {
  revisionReviewSchema,
  revisionReversalSchema,
} from '../../packages/contracts/src/production-revisions';
import { AppError } from '../../apps/server/src/errors';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import {
  shipmentPrepareSchema,
  shipmentConfirmSchema,
  receiptSchema,
} from '../../packages/contracts/src/settlement';
import { issueReportSchema } from '../../packages/contracts/src/production-exceptions';
import { Database } from '../../apps/server/src/database';
import { unpackDump } from '../../apps/server/src/backups/archive';
const code = (value: string) => (e: unknown) => e instanceof AppError && e.code === value;
type Fixture = Awaited<ReturnType<typeof productionFixture>>;
async function applyPlan(f: Fixture, reuse = true) {
  const reviews = new RevisionReviewService(f.db),
    view = await reviews.preview(f.owner, f.order.id);
  const input = revisionReviewSchema.parse({
    requestId: randomUUID(),
    orderRevision: view.context.revision,
    checkToken: view.checkToken,
    reason: 'ทบทวนงานเดิม',
    reviewedFiles: true,
    reviewedRemainder: true,
    decisions: view.sources.map((s) => ({
      sheetId: s.id,
      rows: reuse
        ? s.lines
            .filter((l) => l.reusable && l.targets.length)
            .map((l) => ({
              sourceLineIndex: l.sourceLineIndex,
              targetLineIndex: l.targets[0].lineIndex,
              quantity: l.reusable,
            }))
        : [],
    })),
  });
  return { input, result: await reviews.apply(f.actors.ADMIN, f.order.id, input), reviews };
}
async function reverseInput(f: Fixture, reviewId: string) {
  const service = new RevisionReversalService(f.db),
    view = await service.preview(f.owner, reviewId);
  return {
    service,
    view,
    input: revisionReversalSchema.parse({
      requestId: randomUUID(),
      checkToken: view.checkToken,
      reason: 'เลือกจำนวนใช้ต่อผิด ตรวจใหม่ทั้งชุด',
      reviewedEffects: true,
    }),
  };
}
async function approve(f: Fixture, target: string) {
  const s = (await f.production.detail(f.owner, target)).sheet;
  await f.production.action(f.actors.GRAPHIC, target, s.rowVersion, 'ตรวจงานเดิมตรงแผน', 'ready');
}
test('reversal requires a reason, a current checkpoint and explicit whole-plan acknowledgement', () => {
  const input = {
    requestId: randomUUID(),
    checkToken: 'a'.repeat(64),
    reason: 'ตรวจแล้ว',
    reviewedEffects: true,
  };
  assert(revisionReversalSchema.safeParse(input).success);
  for (const change of [
    { reason: ' ' },
    { reviewedEffects: false },
    { checkToken: '' },
    { targetSheetId: randomUUID() },
  ])
    assert(!revisionReversalSchema.safeParse({ ...input, ...change }).success);
});
test('individually closed targets can be reversed as a whole plan when nothing was consumed; source reservations and earlier history remain correct', async () => {
  const f = await productionFixture();
  try {
    await reviseOrder(f);
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    await f.production.action(
      f.actors.GRAPHIC,
      target,
      (await f.production.detail(f.owner, target)).sheet.rowVersion,
      'ปิดร่างผิดโดยยังไม่ได้ทำงาน',
      'cancel',
    );
    const r = await reverseInput(f, p.result.reviewId);
    assert(r.view.canReverse, JSON.stringify(r.view.blockers));
    assert.equal(r.view.sheets[0].targetState, 'CANCELLED');
    await r.service.reverse(f.actors.ADMIN, p.result.reviewId, r.input);
    assert.equal((await f.production.detail(f.owner, f.id)).sheet.state, 'READY');
    const next = await applyPlan(f);
    assert.equal(next.result.sheets[0].reused, 11);
    const nextTarget = next.result.sheets[0].targetSheetId!;
    await approve(f, nextTarget);
    await f.production.action(
      f.actors.GRAPHIC,
      nextTarget,
      (await f.production.detail(f.owner, nextTarget)).sheet.rowVersion,
      'ปิดใบพร้อมที่ยังไม่มีงานเพิ่ม',
      'cancel',
    );
    const second = await reverseInput(f, next.result.reviewId);
    assert(second.view.canReverse);
    await second.service.reverse(f.owner, next.result.reviewId, second.input);
    assert.equal((await f.db.query('SELECT * FROM production_revision_carry_history')).length, 2);
    assert.equal(
      (
        await f.db.query(
          'SELECT * FROM production_revision_carry_records WHERE source_sheet_id=$1',
          [f.id],
        )
      ).length,
      2,
    );
  } finally {
    await f.db.close();
  }
});
test('reverse every source and target atomically, retry concurrently once, and review again without losing the earlier chain', async () => {
  const f = await productionFixture();
  try {
    const current = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.save(f.actors.GRAPHIC, f.id, {
      ...f.sheetInput,
      rowVersion: current.rowVersion,
      allocations: [{ lineIndex: 0, quantity: 5 }],
    });
    await f.publish(f.id);
    const second = randomUUID();
    await f.production.save(f.actors.GRAPHIC, second, {
      ...f.sheetInput,
      allocations: [{ lineIndex: 0, quantity: 6 }],
    });
    await f.publish(second);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
    const p = await applyPlan(f),
      r = await reverseInput(f, p.result.reviewId);
    assert(r.view.canReverse);
    assert.equal(r.view.sheets.length, 2);
    const savedNotes = (
      await f.db.query('SELECT notes FROM production_sheets WHERE id=$1', [second])
    )[0].notes;
    await f.db.query("UPDATE production_sheets SET notes='เปลี่ยนข้อมูลหนึ่งใบ' WHERE id=$1", [
      second,
    ]);
    const blocked = await reverseInput(f, p.result.reviewId);
    await assert.rejects(
      blocked.service.reverse(f.owner, p.result.reviewId, blocked.input),
      code('REVERSAL_BLOCKED'),
    );
    for (const s of p.result.sheets) {
      assert.equal((await f.production.detail(f.owner, s.sourceSheetId)).sheet.state, 'CANCELLED');
      assert.equal((await f.production.detail(f.owner, s.targetSheetId!)).sheet.state, 'DRAFT');
    }
    await f.db.query('UPDATE production_sheets SET notes=$2 WHERE id=$1', [second, savedNotes]);
    const before = await f.db.query('SELECT * FROM order_revisions ORDER BY revision'),
      counters = await f.db.query('SELECT * FROM business_counters ORDER BY family,business_date');
    const [result, replay] = await Promise.all([
      r.service.reverse(f.actors.ADMIN, p.result.reviewId, r.input),
      r.service.reverse(f.actors.ADMIN, p.result.reviewId, r.input),
    ]);
    assert.deepEqual(result, replay);
    assert.deepEqual(result.restoredSheetIds.sort(), [f.id, second].sort());
    assert(
      (
        await f.db.query('SELECT state FROM production_sheets WHERE id=ANY($1::uuid[])', [
          result.restoredSheetIds,
        ])
      ).every((s) => s.state === 'READY'),
    );
    assert(
      (
        await f.db.query('SELECT state FROM production_sheets WHERE id=ANY($1::uuid[])', [
          result.cancelledSheetIds,
        ])
      ).every((s) => s.state === 'CANCELLED'),
    );
    assert.deepEqual(await f.db.query('SELECT * FROM order_revisions ORDER BY revision'), before);
    assert.deepEqual(
      await f.db.query('SELECT * FROM business_counters ORDER BY family,business_date'),
      counters,
    );
    assert.equal(
      (await f.db.query("SELECT id FROM audit_events WHERE action='PRODUCTION_REVISION_REVERSED'"))
        .length,
      1,
    );
    await assert.rejects(
      r.service.reverse(f.owner, p.result.reviewId, { ...r.input, requestId: randomUUID() }),
      code('REVIEW_ALREADY_REVERSED'),
    );
    await assert.rejects(
      r.service.reverse(f.owner, p.result.reviewId, { ...r.input, reason: 'คำขอต่างกัน' }),
      code('REQUEST_CONFLICT'),
    );
    const next = await applyPlan(f);
    assert.notEqual(next.result.reviewId, p.result.reviewId);
    assert.equal((await f.db.query('SELECT * FROM production_revision_carry_history')).length, 2);
    for (const target of result.cancelledSheetIds)
      assert((await f.production.detail(f.owner, target)).pendingInheritance);
    const history = (await p.reviews.preview(f.owner, f.order.id)).history;
    assert.equal(history.find((h) => h.id === p.result.reviewId)?.reversal?.reason, r.input.reason);
    assert.deepEqual(await p.reviews.apply(f.actors.ADMIN, f.order.id, p.input), p.result);
    assert.equal(
      (await r.service.preview(f.owner, p.result.reviewId)).reversal?.actorName,
      f.actors.ADMIN.displayName,
    );
  } finally {
    await f.db.close();
  }
});
test('READY with only inherited completed work can reverse; keep original issued versions and restored copies', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    const original = await f.production.history(f.owner, f.id);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    await approve(f, target);
    const targetHistory = await f.production.history(f.owner, target);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      11,
    );
    const r = await reverseInput(f, p.result.reviewId);
    assert(r.view.canReverse, JSON.stringify(r.view.blockers));
    await r.service.reverse(f.owner, p.result.reviewId, r.input);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      0,
    );
    assert.deepEqual((await f.production.history(f.owner, f.id)).versions, original.versions);
    assert.deepEqual(
      (await f.production.history(f.owner, target)).versions,
      targetHistory.versions,
    );
    assert.equal((await f.production.detail(f.owner, target)).sheet.state, 'CANCELLED');
    const dump = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await dump.arrayBuffer())),
      );
    try {
      await copy.migrate();
      const view = await new RevisionReversalService(copy).preview(f.owner, p.result.reviewId);
      assert(view.reversal);
      assert.equal(view.sheets.length, 1);
      const rep = new RevisionReviewService(copy),
        v = await rep.preview(f.owner, f.order.id);
      assert.equal(v.sources.length, 1);
    } finally {
      await copy.close();
    }
  } finally {
    await f.db.close();
  }
});
test('work after preview invalidates the checkpoint and prevents reversing the entire plan', async () => {
  const f = await productionFixture();
  try {
    await reviseOrder(f);
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    await approve(f, target);
    const r = await reverseInput(f, p.result.reviewId);
    assert(r.view.canReverse);
    await f.action(target, 'PRINTING', 'start');
    await assert.rejects(
      r.service.reverse(f.owner, p.result.reviewId, r.input),
      code('REVIEW_CHANGED'),
    );
    const updated = await reverseInput(f, p.result.reviewId);
    assert(!updated.view.canReverse);
    await assert.rejects(
      updated.service.reverse(f.owner, p.result.reviewId, updated.input),
      code('REVERSAL_BLOCKED'),
    );
    assert.equal((await f.production.detail(f.owner, f.id)).sheet.state, 'CANCELLED');
    assert.equal((await f.production.detail(f.owner, target)).sheet.state, 'READY');
    assert.equal((await f.db.query('SELECT * FROM production_revision_reversals')).length, 0);
  } finally {
    await f.db.close();
  }
});
test('a production issue on a carried sheet blocks reversal even without new work events', async () => {
  const f = await productionFixture();
  try {
    await reviseOrder(f);
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    await approve(f, target);
    const job = (await f.work.detail(f.owner, target)).job;
    await f.exceptions.report(
      f.actors.PRINTING,
      target,
      issueReportSchema.parse({
        requestId: randomUUID(),
        version: job.version,
        sheetRowVersion: job.sheetRowVersion,
        department: 'PRINTING',
        category: 'OTHER',
        mode: 'CONTINUE',
        description: 'พบปัญหาต้องตรวจ',
        affected: [{ lineIndex: 0, quantity: 1 }],
      }),
    );
    const r = await reverseInput(f, p.result.reviewId);
    assert(!r.view.canReverse);
    await assert.rejects(
      r.service.reverse(f.owner, p.result.reviewId, r.input),
      code('REVERSAL_BLOCKED'),
    );
  } finally {
    await f.db.close();
  }
});
test('prepared delivery from inherited QC goods blocks reversal without changing money or deliveries', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    await reviseOrder(f);
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    await approve(f, target);
    const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
    await new ShipmentService(f.db).prepare(
      f.owner,
      f.order.id,
      shipmentPrepareSchema.parse({
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'เตรียมส่ง',
        method: 'CUSTOMER_PICKUP',
        recipient: 'ผู้รับ',
        phone: '',
        address: '',
        carrier: '',
        tracking: '',
        notes: '',
        items: [{ lineIndex: 0, quantity: 1 }],
      }),
    );
    const r = await reverseInput(f, p.result.reviewId);
    assert(!r.view.canReverse);
    const before = await f.db.query('SELECT * FROM shipments ORDER BY id');
    await assert.rejects(
      r.service.reverse(f.owner, p.result.reviewId, r.input),
      code('REVERSAL_BLOCKED'),
    );
    assert.deepEqual(await f.db.query('SELECT * FROM shipments ORDER BY id'), before);
  } finally {
    await f.db.close();
  }
});
test('GRAPHIC and production cannot reverse; changed accounts, old checkpoints and new order revisions fail closed', async () => {
  const f = await productionFixture();
  try {
    await reviseOrder(f);
    const p = await applyPlan(f),
      r = await reverseInput(f, p.result.reviewId);
    for (const actor of [f.actors.GRAPHIC, f.actors.PRINTING]) {
      await assert.rejects(r.service.preview(actor, p.result.reviewId), code('PERMISSION_DENIED'));
      await assert.rejects(
        r.service.reverse(actor, p.result.reviewId, r.input),
        code('PERMISSION_DENIED'),
      );
    }
    await f.db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1', [f.actors.ADMIN.id]);
    await assert.rejects(
      r.service.reverse(f.actors.ADMIN, p.result.reviewId, r.input),
      code('AUTHENTICATION_REQUIRED'),
    );
    await f.db.query(
      'UPDATE production_revision_carries SET source_guard=NULL,source_state=NULL WHERE review_id=$1',
      [p.result.reviewId],
    );
    const legacy = await reverseInput(f, p.result.reviewId);
    assert(!legacy.view.canReverse);
    assert(legacy.view.blockers.some((s) => s.includes('older plan')));
    await assert.rejects(
      legacy.service.reverse(f.owner, p.result.reviewId, legacy.input),
      code('REVERSAL_BLOCKED'),
    );
    await reviseOrder(f);
    assert(
      (await r.service.preview(f.owner, p.result.reviewId)).blockers.some((s) =>
        s.includes('Order revision changed'),
      ),
    );
  } finally {
    await f.db.close();
  }
});
test('zero-reuse restores DRAFT rather than fabricating READY, while source edits block a whole-plan rollback', async () => {
  const f = await productionFixture();
  try {
    const s = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.save(f.actors.GRAPHIC, f.id, {
      ...f.sheetInput,
      rowVersion: s.rowVersion,
      notes: 'กำลังแก้ใบเดิม',
    });
    await reviseOrder(f);
    const p = await applyPlan(f, false),
      r = await reverseInput(f, p.result.reviewId);
    assert(r.view.canReverse);
    assert.equal(r.view.sheets[0].sourceState, 'DRAFT');
    await r.service.reverse(f.owner, p.result.reviewId, r.input);
    assert.equal((await f.production.detail(f.owner, f.id)).sheet.state, 'DRAFT');
    const second = await applyPlan(f, false);
    await f.db.query("UPDATE production_sheets SET notes='ข้อมูลเดิมเปลี่ยน' WHERE id=$1", [f.id]);
    const changed = await reverseInput(f, second.result.reviewId);
    assert(!changed.view.canReverse);
    await assert.rejects(
      changed.service.reverse(f.owner, second.result.reviewId, changed.input),
      code('REVERSAL_BLOCKED'),
    );
  } finally {
    await f.db.close();
  }
});
test('reversal preserves deposits and prior partial deliveries; re-review excludes already shipped units and confirmed new deliveries block reversal', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    const views = new SettlementService(f.db),
      ships = new ShipmentService(f.db);
    const base = async () => {
      const v = await views.detail(f.owner, f.order.id);
      return {
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'ทดสอบประวัติเดิม',
      };
    };
    await new PaymentService(f.db).receipt(
      f.owner,
      f.order.id,
      receiptSchema.parse({
        ...(await base()),
        purpose: 'DEPOSIT',
        currency: 'LAK',
        amount: '100000',
        method: 'CASH',
        reference: '',
        occurredAt: new Date().toISOString(),
        rateRevision: 2,
      }),
    );
    const prepare = async (quantity: number) =>
      ships.prepare(
        f.owner,
        f.order.id,
        shipmentPrepareSchema.parse({
          ...(await base()),
          method: 'CUSTOMER_PICKUP',
          recipient: 'ผู้รับ',
          phone: '',
          address: '',
          carrier: '',
          tracking: '',
          notes: '',
          items: [{ lineIndex: 0, quantity }],
        }),
      ) as Promise<{ shipmentId: string }>;
    const first = await prepare(3);
    await ships.confirm(
      f.owner,
      f.order.id,
      first.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
    const p = await applyPlan(f),
      target = p.result.sheets[0].targetSheetId!;
    assert.equal(p.result.sheets[0].reused, 8);
    await approve(f, target);
    const r = await reverseInput(f, p.result.reviewId),
      money = await f.db.query('SELECT * FROM payment_entries ORDER BY id'),
      deliveries = await f.db.query('SELECT * FROM shipments ORDER BY id');
    assert(r.view.canReverse);
    await r.service.reverse(f.owner, p.result.reviewId, r.input);
    assert.deepEqual(await f.db.query('SELECT * FROM payment_entries ORDER BY id'), money);
    assert.deepEqual(await f.db.query('SELECT * FROM shipments ORDER BY id'), deliveries);
    const current = await views.detail(f.owner, f.order.id);
    assert.equal(current.delivery.shippedQuantity, 3);
    assert.equal(current.delivery.readyQuantity, 0);
    const next = await applyPlan(f),
      nextTarget = next.result.sheets[0].targetSheetId!;
    assert.equal(next.result.sheets[0].reused, 8);
    await approve(f, nextTarget);
    const second = await prepare(1);
    await ships.confirm(
      f.owner,
      f.order.id,
      second.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    const stop = await reverseInput(f, next.result.reviewId);
    assert(!stop.view.canReverse);
    await assert.rejects(
      stop.service.reverse(f.owner, next.result.reviewId, stop.input),
      code('REVERSAL_BLOCKED'),
    );
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.shippedQuantity, 4);
  } finally {
    await f.db.close();
  }
});
