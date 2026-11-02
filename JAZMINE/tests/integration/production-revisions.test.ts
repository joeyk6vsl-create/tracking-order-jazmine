import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { reviseOrder } from './helpers/revise-order';
import { RevisionReviewService } from '../../apps/server/src/production/revision-review-service';
import {
  revisionReviewSchema,
  type RevisionReviewResult,
} from '../../packages/contracts/src/production-revisions';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import {
  receiptSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { AppError } from '../../apps/server/src/errors';
import { Database } from '../../apps/server/src/database';
import { WorkService } from '../../apps/server/src/production/work-service';
import { unpackDump } from '../../apps/server/src/backups/archive';
import type { SheetSnapshot } from '../../packages/contracts/src/production';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import {
  issueReportSchema,
  issueResolveSchema,
} from '../../packages/contracts/src/production-exceptions';
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
async function approveCarried(
  f: Awaited<ReturnType<typeof productionFixture>>,
  result: RevisionReviewResult,
) {
  for (const row of result.sheets) {
    if (!row.targetSheetId) continue;
    const sheet = (await f.production.detail(f.owner, row.targetSheetId)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      row.targetSheetId,
      sheet.rowVersion,
      'กราฟิกตรวจแผนและไฟล์ตรงกันแล้ว',
      'ready',
    );
  }
}
async function plan(f: Awaited<ReturnType<typeof productionFixture>>) {
  const service = new RevisionReviewService(f.db),
    v = await service.preview(f.owner, f.order.id);
  return {
    service,
    v,
    input: revisionReviewSchema.parse({
      requestId: randomUUID(),
      orderRevision: v.context.revision,
      checkToken: v.checkToken,
      reason: 'ตรวจงานที่ใช้กับฉบับใหม่',
      reviewedFiles: true,
      reviewedRemainder: true,
      decisions: v.sources.map((s) => ({
        sheetId: s.id,
        rows: s.lines
          .filter((l) => l.targets.length)
          .map((l) => ({
            sourceLineIndex: l.sourceLineIndex,
            targetLineIndex: l.targets[0].lineIndex,
            quantity: l.reusable,
          }))
          .filter((r) => r.quantity > 0),
      })),
    }),
  };
}
test('carry QC goods after partial shipment without rewriting history or money; new quantities require fresh production and cannot ship twice', async () => {
  const f = await productionFixture();
  try {
    await f.finish(f.id);
    const views = new SettlementService(f.db),
      pay = new PaymentService(f.db),
      ships = new ShipmentService(f.db);
    const base = async () => {
      const v = await views.detail(f.owner, f.order.id);
      return {
        requestId: randomUUID(),
        expectedVersion: v.version,
        orderRevision: v.revision,
        reason: 'ตรวจย้ายงานหลังส่งบางส่วน',
      };
    };
    await pay.receipt(
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
    const prepare = async (qty: number) =>
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
          items: [{ lineIndex: 0, quantity: qty }],
        }),
      ) as Promise<{ shipmentId: string }>;
    const first = await prepare(3);
    await ships.confirm(
      f.owner,
      f.order.id,
      first.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
    );
    const oldHistory = await f.production.history(f.owner, f.id),
      oldEvents = await f.db.query(
        'SELECT * FROM production_stage_events WHERE sheet_id=$1 ORDER BY id',
        [f.id],
      );
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
    const p = await plan(f);
    assert.equal(p.v.sources[0].lines[0].reusable, 8);
    const [result, replay] = await Promise.all([
      p.service.apply(f.actors.ADMIN, f.order.id, p.input),
      p.service.apply(f.actors.ADMIN, f.order.id, p.input),
    ]);
    assert.deepEqual(result, replay);
    const target = result.sheets[0].targetSheetId!;
    assert(target);
    assert.equal(result.sheets[0].reused, 8);
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.readyQuantity, 0);
    assert.equal(
      (await f.work.queue(f.actors.PRINTING, { state: 'ACTIVE', search: '' })).pendingReviews
        ?.length,
      1,
    );
    const waiting = (await f.production.detail(f.owner, target)).sheet;
    await assert.rejects(
      f.production.action(f.actors.ADMIN, target, waiting.rowVersion, 'พยายามข้ามกราฟิก', 'ready'),
      code('PERMISSION_DENIED'),
    );
    await approveCarried(f, result);
    const history = await f.production.history(f.owner, f.id);
    assert.deepEqual(history.versions, oldHistory.versions);
    assert.equal(history.state, 'CANCELLED');
    assert.deepEqual(
      await f.db.query('SELECT * FROM production_stage_events WHERE sheet_id=$1 ORDER BY id', [
        f.id,
      ]),
      oldEvents,
    );
    const carriedSnapshot = (await f.production.history(f.owner, target)).versions[0]
      .snapshot as SheetSnapshot;
    const file = carriedSnapshot.files[0];
    assert.equal(
      Number(
        (
          await f.db.query(
            'SELECT sum(octet_length(file_data)) AS bytes FROM production_part_files WHERE sheet_id=$1',
            [target],
          )
        )[0].bytes,
      ),
      0,
    );
    const originalFile = (oldHistory.versions.at(-1)!.snapshot as SheetSnapshot).files.find(
      (p) => p.part === file.part,
    )!;
    const originalBytes = (await f.work.content(f.owner, f.id, 1, originalFile.id, 'part')).bytes;
    assert.deepEqual(
      (await f.work.content(f.owner, target, 1, file.id, 'part')).bytes,
      originalBytes,
    );
    const dump = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await dump.arrayBuffer())),
      );
    try {
      assert.deepEqual(
        (await new WorkService(copy).content(f.owner, target, 1, file.id, 'part')).bytes,
        originalBytes,
      );
      assert.equal(
        (await new SettlementService(copy).detail(f.owner, f.order.id)).delivery.readyQuantity,
        8,
      );
    } finally {
      await copy.close();
    }
    let v = await views.detail(f.owner, f.order.id);
    assert.equal(v.money.netPaid, '100000');
    assert.equal(v.delivery.shippedQuantity, 3);
    assert.equal(v.delivery.readyQuantity, 8);
    assert.equal((await f.work.detail(f.owner, target)).job.carriedFrom?.sheetId, f.id);
    const second = await prepare(8);
    await ships.confirm(
      f.owner,
      f.order.id,
      second.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: true }),
    );
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.readyQuantity, 0);
    const newId = randomUUID();
    await f.production.save(f.actors.GRAPHIC, newId, {
      ...f.sheetInput,
      orderRevision: 2,
      allocations: [{ lineIndex: 0, quantity: 4 }],
    });
    await f.publish(newId);
    assert(
      (await f.work.detail(f.owner, newId)).job.stages.every((s) => s.state === 'NOT_STARTED'),
    );
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.readyQuantity, 0);
    await f.finish(newId);
    const third = await prepare(4);
    await ships.confirm(
      f.owner,
      f.order.id,
      third.shipmentId,
      shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: true }),
    );
    v = await views.detail(f.owner, f.order.id);
    assert.equal(v.delivery.shippedQuantity, 15);
    assert.equal(v.delivery.readyQuantity, 0);
    assert.equal(v.money.netPaid, '100000');
    assert.equal((await f.db.query('SELECT id FROM production_revision_reviews')).length, 1);
    await assert.rejects(
      p.service.apply(f.actors.ADMIN, f.order.id, { ...p.input, reason: 'เปลี่ยนคำขอ' }),
      code('REQUEST_CONFLICT'),
    );
  } finally {
    await f.db.close();
  }
});

test('in-progress work resumes from inherited stage states, while obsolete commands and unprivileged reviewers are refused', async () => {
  const f = await productionFixture();
  try {
    await f.action(f.id, 'PRINTING', 'start');
    await f.action(f.id, 'PRINTING', 'complete');
    await f.action(f.id, 'HEAT_TRANSFER', 'start');
    const before = (await f.work.detail(f.owner, f.id)).job;
    await reviseOrder(f);
    const p = await plan(f);
    await assert.rejects(
      p.service.preview(f.actors.PRINTING, f.order.id),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      p.service.apply(f.actors.GRAPHIC, f.order.id, p.input),
      code('PERMISSION_DENIED'),
    );
    const result = await p.service.apply(f.owner, f.order.id, p.input),
      target = result.sheets[0].targetSheetId!;
    await approveCarried(f, result);
    const current = (await f.work.detail(f.actors.HEAT_TRANSFER, target)).job;
    assert.equal(current.stages[0].state, 'IN_PROGRESS');
    assert.equal(
      current.stages[0].startedAt,
      before.stages.find((s) => s.department === 'HEAT_TRANSFER')!.startedAt,
    );
    const all = (await f.work.detail(f.owner, target)).job;
    assert.equal(all.stages[0].state, 'COMPLETED');
    assert.equal(all.stages[2].state, 'NOT_STARTED');
    assert.equal(all.blocked, null);
    await assert.rejects(f.action(f.id, 'HEAT_TRANSFER', 'complete'), code('INSTRUCTIONS_CHANGED'));
    await f.finish(target);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      11,
    );
    const v3 = await reviseOrder(f);
    assert.equal(v3.revision, 3);
    const second = await plan(f);
    const next = await second.service.apply(f.owner, f.order.id, second.input);
    await approveCarried(f, next);
    assert.equal(
      (await f.work.detail(f.owner, next.sheets[0].targetSheetId!)).job.carriedFrom?.sheetId,
      target,
    );
  } finally {
    await f.db.close();
  }
});

test('a smaller order cannot reuse too much; rollback preserves every source and selected names remain exact', async () => {
  const f = await productionFixture();
  try {
    const old = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.save(f.actors.GRAPHIC, f.id, {
      ...f.sheetInput,
      rowVersion: old.rowVersion,
      printDetails: {
        priority: 'URGENT',
        names: Array.from({ length: 11 }, (_, i) => ({
          lineIndex: 0,
          name: 'Player ' + i,
          number: String(i + 1),
        })),
      },
    });
    await f.publish(f.id);
    await f.finish(f.id);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 5 } });
    const p = await plan(f);
    p.input.decisions[0].nameIndexes = Array.from({ length: 11 }, (_, i) => i);
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('OVER_ALLOCATION'));
    assert.equal((await f.production.detail(f.owner, f.id)).sheet.state, 'READY');
    assert.equal((await f.db.query('SELECT id FROM production_revision_reviews')).length, 0);
    p.input.decisions[0].rows[0].quantity = 6;
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('REUSE_NAMES'));
    p.input.decisions[0].nameIndexes = [1, 3, 5, 7, 9, 10];
    const result = await p.service.apply(f.owner, f.order.id, p.input);
    assert.equal(result.sheets[0].notReused, 5);
    await approveCarried(f, result);
    const target = (await f.production.history(f.owner, result.sheets[0].targetSheetId!))
      .versions[0].snapshot as SheetSnapshot;
    assert.deepEqual(
      target.printDetails!.names.map((n) => n.number),
      ['2', '4', '6', '8', '10', '11'],
    );
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      6,
    );
  } finally {
    await f.db.close();
  }
});

test('reordered lines match physical goods rather than old positions; changed artwork requires new production', async () => {
  const f = await productionFixture();
  try {
    const productId = f.input.quote.productId,
      version = Number(
        (await f.db.query('SELECT row_version FROM catalog_items WHERE id=$1', [productId]))[0]
          .row_version,
      );
    await new CatalogChoicesService(f.db).save(f.owner, productId, {
      rowVersion: version,
      sizes: ['M', 'L'],
      fabricIds: [f.input.quote.fabricId],
    });
    await f.finish(f.id);
    await reviseOrder(f, {
      lines: [
        { ...f.input.quote, size: 'L', quantity: 2, freeQuantity: 0 },
        { ...f.input.quote, size: 'M', quantity: 10, freeQuantity: 1 },
      ],
    });
    let p = await plan(f);
    assert.equal(p.v.sources[0].lines[0].targets[0].lineIndex, 1);
    const result = await p.service.apply(f.owner, f.order.id, p.input);
    const target = result.sheets[0].targetSheetId!;
    await approveCarried(f, result);
    const v = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(v.delivery.lines[0].ready, 0);
    assert.equal(v.delivery.lines[1].ready, 11);
    const different =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    await reviseOrder(f, {}, different);
    p = await plan(f);
    assert(p.v.sources[0].blockers.some((b) => b.includes('Artwork changed')));
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('REUSE_NOT_ALLOWED'));
    const before = (await f.production.detail(f.owner, target)).sheet;
    assert.equal(before.state, 'READY');
    p.input.decisions = p.v.sources.map((s) => ({ sheetId: s.id, rows: [], nameIndexes: [] }));
    const closed = await p.service.apply(f.owner, f.order.id, p.input);
    assert.equal(closed.sheets[0].targetSheetId, null);
    assert.equal(closed.sheets[0].notReused, 11);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      0,
    );
  } finally {
    await f.db.close();
  }
});

test('all old sheets are reviewed atomically, and partial reuse cannot inherit progress from a different source', async () => {
  const f = await productionFixture();
  try {
    const source = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.save(f.actors.GRAPHIC, f.id, {
      ...f.sheetInput,
      rowVersion: source.rowVersion,
      allocations: [{ lineIndex: 0, quantity: 6 }],
    });
    await f.publish(f.id);
    await f.finish(f.id);
    const other = randomUUID();
    await f.production.save(f.actors.GRAPHIC, other, {
      ...f.sheetInput,
      allocations: [{ lineIndex: 0, quantity: 5 }],
    });
    await f.publish(other);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 7 } });
    const p = await plan(f);
    await assert.rejects(
      p.service.apply(f.owner, f.order.id, {
        ...p.input,
        decisions: p.input.decisions.slice(0, 1),
      }),
      code('REVIEW_INCOMPLETE'),
    );
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('OVER_ALLOCATION'));
    assert.equal((await f.db.query('SELECT id FROM production_revision_reviews')).length, 0);
    assert.equal(
      (await f.db.query("SELECT id FROM production_sheets WHERE state='CANCELLED'")).length,
      0,
    );
    p.input.decisions.find((d) => d.sheetId === other)!.rows[0].quantity = 2;
    const result = await p.service.apply(f.owner, f.order.id, p.input);
    assert.equal(result.sheets.length, 2);
    await approveCarried(f, result);
    const done = result.sheets.find((s) => s.sourceSheetId === f.id)!,
      fresh = result.sheets.find((s) => s.sourceSheetId === other)!;
    assert.equal(fresh.notReused, 3);
    assert(
      (await f.work.detail(f.owner, done.targetSheetId!)).job.stages.every(
        (s) => s.state === 'COMPLETED',
      ),
    );
    assert(
      (await f.work.detail(f.owner, fresh.targetSheetId!)).job.stages.every(
        (s) => s.state === 'NOT_STARTED',
      ),
    );
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      6,
    );
    await f.finish(fresh.targetSheetId!);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      8,
    );
  } finally {
    await f.db.close();
  }
});

test('graphic approval cannot inherit work after changing the reviewed instructions', async () => {
  const f = await productionFixture();
  try {
    await f.action(f.id, 'PRINTING', 'start');
    await reviseOrder(f);
    const p = await plan(f);
    const result = await p.service.apply(f.owner, f.order.id, p.input),
      id = result.sheets[0].targetSheetId!;
    const original = (await f.production.detail(f.owner, id)).sheet;
    await f.production.save(f.actors.GRAPHIC, id, {
      ...f.sheetInput,
      orderRevision: 2,
      rowVersion: original.rowVersion,
      notes: 'เปลี่ยนคำสั่งผลิตหลังเลือกใช้งานเดิม',
    });
    let changed = (await f.production.detail(f.owner, id)).sheet;
    await assert.rejects(
      f.production.action(
        f.actors.GRAPHIC,
        id,
        changed.rowVersion,
        'อนุมัติคำสั่งเปลี่ยน',
        'ready',
      ),
      code('REUSE_PLAN_CHANGED'),
    );
    assert.equal(
      (await f.db.query('SELECT * FROM production_stage_work WHERE sheet_id=$1', [id])).length,
      0,
    );
    await f.production.save(f.actors.GRAPHIC, id, {
      ...f.sheetInput,
      orderRevision: 2,
      rowVersion: changed.rowVersion,
      notes: original.notes,
    });
    changed = (await f.production.detail(f.owner, id)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      id,
      changed.rowVersion,
      'ตรวจแล้วตรงแผนเดิม',
      'ready',
    );
    assert.equal((await f.work.detail(f.owner, id)).job.stages[0].state, 'IN_PROGRESS');
  } finally {
    await f.db.close();
  }
});

test('open issues block review, resolved losses reduce reusable stock, and changed review tokens cannot mutate data', async () => {
  const f = await productionFixture();
  try {
    const job = (await f.work.detail(f.owner, f.id)).job;
    await f.exceptions.report(
      f.owner,
      f.id,
      issueReportSchema.parse({
        requestId: randomUUID(),
        version: job.version,
        sheetRowVersion: job.sheetRowVersion,
        department: 'PRINTING',
        category: 'DAMAGE',
        mode: 'CONTINUE',
        description: 'เสียหายสองตัว',
        affected: [{ lineIndex: 0, quantity: 2 }],
      }),
    );
    await reviseOrder(f);
    let p = await plan(f);
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('ISSUE_OPEN'));
    const detail = await f.exceptions.detail(f.owner, f.id),
      issue = detail.issues[0],
      sheet = (await f.production.detail(f.owner, f.id)).sheet;
    await f.exceptions.resolve(
      f.actors.ADMIN,
      issue.id,
      issueResolveSchema.parse({
        requestId: randomUUID(),
        rowVersion: issue.rowVersion,
        sheetRowVersion: sheet.rowVersion,
        reason: 'ยืนยันของเสียและไม่ใช้ต่อ',
        rows: [
          {
            lineIndex: 0,
            usableQty: 0,
            scrapQty: 1,
            releaseQty: 1,
            ignoredQty: 0,
            replacementQty: 0,
          },
        ],
      }),
    );
    await assert.rejects(p.service.apply(f.owner, f.order.id, p.input), code('REVIEW_CHANGED'));
    p = await plan(f);
    assert.equal(p.v.sources[0].lines[0].reusable, 9);
    const result = await p.service.apply(f.owner, f.order.id, p.input),
      target = result.sheets[0].targetSheetId!;
    await approveCarried(f, result);
    await f.finish(target);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      9,
    );
    assert.equal(
      (await f.db.query('SELECT scrap_qty,release_qty FROM production_losses')).length,
      1,
    );
  } finally {
    await f.db.close();
  }
});
