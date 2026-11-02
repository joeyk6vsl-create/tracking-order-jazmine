import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { resolvedIssue } from './helpers/resolved-issue';
import { IssueCorrectionService } from '../../apps/server/src/production/issue-correction-service';
import {
  issueCorrectionSchema,
  type CorrectionRow,
} from '../../packages/contracts/src/issue-corrections';
import {
  replacementSchema,
  issueReportSchema,
  issueResolveSchema,
} from '../../packages/contracts/src/production-exceptions';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { ExceptionService } from '../../apps/server/src/production/exception-service';
import { Database } from '../../apps/server/src/database';
import { unpackDump } from '../../apps/server/src/backups/archive';
import { AppError } from '../../apps/server/src/errors';
import { ShipmentService } from '../../apps/server/src/settlements/shipment-service';
import {
  shipmentPrepareSchema,
  shipmentConfirmSchema,
} from '../../packages/contracts/src/settlement';
import { reviseOrder } from './helpers/revise-order';
import { RevisionReviewService } from '../../apps/server/src/production/revision-review-service';
import { revisionReviewSchema } from '../../packages/contracts/src/production-revisions';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
const row = (scrapQty: number, usableQty = 0, releaseQty = 0): CorrectionRow => ({
  lineIndex: 0,
  scrapQty,
  usableQty,
  releaseQty,
  ignoredQty: 0,
});
async function command(
  service: IssueCorrectionService,
  f: Awaited<ReturnType<typeof productionFixture>>,
  issueId: string,
  rows: CorrectionRow[],
) {
  const view = await service.preview(f.owner, issueId);
  return {
    view,
    input: issueCorrectionSchema.parse({
      requestId: randomUUID(),
      rowVersion: view.rowVersion,
      sheetRowVersion: view.sheetRowVersion,
      checkToken: view.checkToken,
      reason: 'ตรวจจำนวนจริงและแก้บันทึกผิด',
      verifiedStock: true,
      rows,
    }),
  };
}
async function ship(f: Awaited<ReturnType<typeof productionFixture>>, quantity: number) {
  const service = new ShipmentService(f.db),
    views = new SettlementService(f.db);
  const base = async () => {
    const v = await views.detail(f.owner, f.order.id);
    return {
      requestId: randomUUID(),
      expectedVersion: v.version,
      orderRevision: v.revision,
      reason: 'ตรวจสินค้าส่งจริง',
    };
  };
  const prepared = (await service.prepare(
    f.actors.ADMIN,
    f.order.id,
    shipmentPrepareSchema.parse({
      ...(await base()),
      method: 'CUSTOMER_PICKUP',
      recipient: 'ผู้รับทดสอบ',
      phone: '',
      address: '',
      carrier: '',
      tracking: '',
      notes: '',
      items: [{ lineIndex: 0, quantity }],
    }),
  )) as { shipmentId: string };
  await service.confirm(
    f.actors.ADMIN,
    f.order.id,
    prepared.shipmentId,
    shipmentConfirmSchema.parse({ ...(await base()), confirmedEarly: false }),
  );
}

test('corrections append signed changes and retain the original report/resolution; retries and restored copies preserve exact current stock', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f),
      service = new IssueCorrectionService(f.db),
      views = new SettlementService(f.db),
      p = await command(service, f, issueId, [row(1, 2)]);
    await assert.rejects(service.preview(f.actors.GRAPHIC, issueId), code('PERMISSION_DENIED'));
    await assert.rejects(
      service.correct(f.actors.PRINTING, issueId, p.input),
      code('PERMISSION_DENIED'),
    );
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.correct(f.actors.ADMIN, issueId, p.input)),
    );
    assert(results.every((r) => r.issueVersion === 3));
    const detail = await f.exceptions.detail(f.owner, f.id),
      issue = detail.issues.find((i) => i.id === issueId)!;
    assert.equal(issue.affected[0].quantity, 3);
    assert.equal(issue.resolutionHistory!.length, 2);
    assert.equal(issue.resolutionHistory![0].rows[0].scrapQty, 3);
    assert.equal(issue.resolutionHistory![1].rows[0].scrapQty, 1);
    assert.equal(issue.resolverName, 'ADMIN');
    assert.equal(
      Number(
        (
          await f.db.query('SELECT scrap_qty FROM production_losses WHERE issue_id=$1', [issueId])
        )[0].scrap_qty,
      ),
      3,
    );
    assert.equal(
      Number(
        (
          await f.db.query(
            'SELECT scrap_delta FROM production_loss_adjustments WHERE issue_id=$1',
            [issueId],
          )
        )[0].scrap_delta,
      ),
      -2,
    );
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.readyQuantity, 10);
    await assert.rejects(
      service.correct(f.actors.ADMIN, issueId, { ...p.input, reason: 'คำขอเดิมเปลี่ยน' }),
      code('REQUEST_CONFLICT'),
    );
    await assert.rejects(
      service.correct(f.actors.ADMIN, issueId, { ...p.input, requestId: randomUUID() }),
      code('CORRECTION_CHANGED'),
    );
    const next = await command(service, f, issueId, [row(2, 3)]);
    await service.correct(f.owner, issueId, next.input);
    assert.equal((await views.detail(f.owner, f.order.id)).delivery.readyQuantity, 9);
    const dump = await f.db.localSnapshot(),
      copy = await Database.restoreSnapshot(
        await unpackDump(new Uint8Array(await dump.arrayBuffer())),
      );
    try {
      const restored = await new ExceptionService(copy).detail(f.owner, f.id);
      assert.equal(restored.issues[0].resolutionHistory!.length, 3);
      assert.equal(restored.losses[0].scrap, 2);
      assert.equal(
        (await new SettlementService(copy).detail(f.owner, f.order.id)).delivery.readyQuantity,
        9,
      );
    } finally {
      await copy.close();
    }
  } finally {
    await f.db.close();
  }
});
test('an unissued replacement draft can resize atomically; committed work cannot be erased and failures leave every record unchanged', async () => {
  const f = await productionFixture();
  try {
    const { issueId, replacementId } = await resolvedIssue(f, 3, 3),
      service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [row(2, 1)]);
    await assert.rejects(service.correct(f.owner, issueId, p.input), code('REPLACEMENT_COMMITTED'));
    assert.equal(
      (await f.production.detail(f.owner, replacementId!)).sheet.allocations[0].quantity,
      3,
    );
    assert.equal((await f.exceptions.detail(f.owner, f.id)).issues[0].resolutionHistory!.length, 1);
    p.input.replacementEdits = [
      {
        sheetId: replacementId!,
        rowVersion: p.view.replacements[0].rowVersion,
        allocations: [{ lineIndex: 0, quantity: 2 }],
      },
    ];
    await service.correct(f.actors.ADMIN, issueId, p.input);
    assert.equal(
      (await f.production.detail(f.owner, replacementId!)).sheet.allocations[0].quantity,
      2,
    );
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      9,
    );
    await assert.rejects(
      f.exceptions.createReplacement(
        f.owner,
        issueId,
        replacementSchema.parse({
          requestId: randomUUID(),
          reason: 'ห้ามใช้จำนวนเดิม',
          allocations: [{ lineIndex: 0, quantity: 1 }],
        }),
      ),
      code('REPLACEMENT_LIMIT'),
    );
    await f.publish(replacementId!);
    await f.action(replacementId!, 'PRINTING', 'start');
    const next = await command(service, f, issueId, [row(1, 2)]);
    await assert.rejects(
      service.correct(f.owner, issueId, next.input),
      code('REPLACEMENT_COMMITTED'),
    );
    next.input.replacementEdits = [
      {
        sheetId: replacementId!,
        rowVersion: next.view.replacements[0].rowVersion,
        allocations: [],
      },
    ];
    await assert.rejects(
      service.correct(f.owner, issueId, next.input),
      code('REPLACEMENT_NOT_EDITABLE'),
    );
    assert.equal((await f.exceptions.detail(f.owner, f.id)).losses[0].scrap, 2);
    assert.equal((await f.work.detail(f.owner, replacementId!)).job.stages[0].state, 'IN_PROGRESS');
  } finally {
    await f.db.close();
  }
});
test('only real corrections are recorded; verified stock, reasons and strict line/quantity input are required', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f),
      service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [row(3)]);
    for (const extra of [
      { reason: '' },
      { verifiedStock: false },
      { amount: '1000' },
      { rows: [row(-1)] },
      { rows: [row(1), row(2)] },
    ])
      assert.equal(issueCorrectionSchema.safeParse({ ...p.input, ...extra }).success, false);
    await assert.rejects(service.correct(f.owner, issueId, p.input), code('NO_QUANTITY_CHANGE'));
    await assert.rejects(
      service.correct(f.owner, issueId, { ...p.input, rows: [{ ...row(1), lineIndex: 29 }] }),
      code('CORRECTION_QUANTITY'),
    );
    assert.equal((await f.db.query('SELECT * FROM production_loss_adjustments')).length, 0);
  } finally {
    await f.db.close();
  }
});

test('confirmed shipments set a hard floor; corrections recover only unshipped stock and never change money or shipping history', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f),
      service = new IssueCorrectionService(f.db);
    await ship(f, 8);
    const before = await f.db.query(
        'SELECT * FROM shipment_allocations ORDER BY shipment_id,line_index',
      ),
      settlement = await new SettlementService(f.db).detail(f.owner, f.order.id),
      invalid = await command(service, f, issueId, [row(4)]);
    await assert.rejects(
      service.correct(f.owner, issueId, invalid.input),
      code('CORRECTION_QUANTITY'),
    );
    const valid = await command(service, f, issueId, [row(2, 1)]);
    await service.correct(f.actors.ADMIN, issueId, valid.input);
    const after = await new SettlementService(f.db).detail(f.owner, f.order.id);
    assert.equal(after.delivery.readyQuantity, 1);
    assert.deepEqual(
      await f.db.query('SELECT * FROM shipment_allocations ORDER BY shipment_id,line_index'),
      before,
    );
    assert.deepEqual(after.money, settlement.money);
    assert.deepEqual(after.payments, settlement.payments);
    assert.equal((await f.exceptions.detail(f.owner, f.id)).issues[0].resolutionHistory!.length, 2);
  } finally {
    await f.db.close();
  }
});

test('continued goods remain reserved after an order revision; recovered old goods are not silently added to a new approved sheet', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 14 } });
    const reviews = new RevisionReviewService(f.db),
      v = await reviews.preview(f.owner, f.order.id);
    const result = await reviews.apply(
      f.actors.ADMIN,
      f.order.id,
      revisionReviewSchema.parse({
        requestId: randomUUID(),
        orderRevision: v.context.revision,
        checkToken: v.checkToken,
        reason: 'ใช้ต่อสินค้าที่ตรวจแล้ว',
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
    const target = result.sheets[0].targetSheetId!,
      targetSheet = (await f.production.detail(f.owner, target)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      target,
      targetSheet.rowVersion,
      'ตรวจงานใช้ต่อ',
      'ready',
    );
    const service = new IssueCorrectionService(f.db),
      invalid = await command(service, f, issueId, [row(4)]);
    assert.equal(invalid.view.lines[0].carried, 8);
    await assert.rejects(
      service.correct(f.owner, issueId, invalid.input),
      code('CORRECTION_QUANTITY'),
    );
    const valid = await command(service, f, issueId, [row(2, 1)]);
    await service.correct(f.owner, issueId, valid.input);
    assert.equal((await f.production.detail(f.owner, target)).sheet.allocations[0].quantity, 8);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      8,
    );
    assert.equal((await f.production.history(f.owner, f.id)).state, 'CANCELLED');
  } finally {
    await f.db.close();
  }
});

test('cancelling an unissued replacement is explicit and atomic; shipped replacement work stays committed even after closing its sheet', async () => {
  const f = await productionFixture();
  try {
    const { issueId, replacementId } = await resolvedIssue(f, 3, 3),
      service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [row(0, 3)]);
    p.input.replacementEdits = [
      { sheetId: replacementId!, rowVersion: p.view.replacements[0].rowVersion, allocations: [] },
    ];
    await service.correct(f.owner, issueId, p.input);
    const closed = (await f.production.detail(f.owner, replacementId!)).sheet;
    assert.equal(closed.state, 'CANCELLED');
    assert.equal(closed.allocations[0].quantity, 3);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      11,
    );
    assert.equal(
      (await f.exceptions.detail(f.owner, f.id)).issues[0].resolutionHistory![1]
        .replacementChanges[0].after.state,
      'CANCELLED',
    );
  } finally {
    await f.db.close();
  }
  const g = await productionFixture();
  try {
    const { issueId, replacementId } = await resolvedIssue(g, 3, 3);
    await g.publish(replacementId!);
    await g.finish(replacementId!);
    await ship(g, 11);
    const child = (await g.production.detail(g.owner, replacementId!)).sheet;
    await g.production.action(
      g.actors.GRAPHIC,
      replacementId!,
      child.rowVersion,
      'ปิดงานที่ส่งครบแล้ว',
      'cancel',
    );
    const service = new IssueCorrectionService(g.db),
      p = await command(service, g, issueId, [row(2, 1)]);
    assert.equal(p.view.replacementUsage[0].quantity, 3);
    await assert.rejects(service.correct(g.owner, issueId, p.input), code('REPLACEMENT_COMMITTED'));
  } finally {
    await g.db.close();
  }
});

test('a correction cannot exceed the order when another sheet already fills released capacity; every tentative change rolls back', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f),
      other = randomUUID();
    await f.production.save(f.actors.GRAPHIC, other, {
      ...f.sheetInput,
      allocations: [{ lineIndex: 0, quantity: 3 }],
    });
    const service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [row(2, 1)]);
    await assert.rejects(
      service.correct(f.owner, issueId, p.input),
      code('CORRECTION_OVER_ALLOCATION'),
    );
    assert.equal((await f.exceptions.detail(f.owner, f.id)).losses[0].scrap, 3);
    assert.equal((await f.db.query('SELECT * FROM production_loss_adjustments')).length, 0);
    assert.equal((await f.exceptions.detail(f.owner, f.id)).issues[0].resolutionHistory!.length, 1);
    assert.equal(
      (await f.production.detail(f.owner, f.id)).sheet.rowVersion,
      p.view.sheetRowVersion,
    );
  } finally {
    await f.db.close();
  }
});

test('a wrong size can be corrected within the original sheet; original reporting and issued documents remain unchanged', async () => {
  const f = await productionFixture();
  try {
    const old = (await f.production.detail(f.owner, f.id)).sheet;
    await f.production.action(
      f.actors.GRAPHIC,
      f.id,
      old.rowVersion,
      'ปิดใบก่อนเริ่มงาน',
      'cancel',
    );
    const version = Number(
      (
        await f.db.query('SELECT row_version FROM catalog_items WHERE id=$1', [
          f.input.quote.productId,
        ])
      )[0].row_version,
    );
    await new CatalogChoicesService(f.db).save(f.owner, f.input.quote.productId, {
      rowVersion: version,
      sizes: ['M', 'L'],
      fabricIds: [f.input.quote.fabricId],
    });
    await reviseOrder(f, {
      lines: [
        { ...f.input.quote, size: 'M', quantity: 10, freeQuantity: 1 },
        { ...f.input.quote, size: 'L', quantity: 5, freeQuantity: 0 },
      ],
    });
    const source = randomUUID();
    await f.production.save(f.actors.GRAPHIC, source, {
      ...f.sheetInput,
      orderRevision: 2,
      allocations: [
        { lineIndex: 0, quantity: 11 },
        { lineIndex: 1, quantity: 5 },
      ],
    });
    await f.publish(source);
    await f.finish(source);
    const job = (await f.work.detail(f.owner, source)).job,
      issueId = randomUUID();
    await f.exceptions.report(
      f.actors.PRINTING,
      source,
      issueReportSchema.parse({
        requestId: issueId,
        version: job.version,
        sheetRowVersion: job.sheetRowVersion,
        department: 'PRINTING',
        category: 'DAMAGE',
        mode: 'CONTINUE',
        description: 'รายงานไซซ์ผิด',
        affected: [{ lineIndex: 0, quantity: 2 }],
      }),
    );
    const issue = (await f.exceptions.detail(f.owner, source)).issues[0];
    await f.exceptions.resolve(
      f.actors.ADMIN,
      issueId,
      issueResolveSchema.parse({
        requestId: randomUUID(),
        rowVersion: issue.rowVersion,
        sheetRowVersion: (await f.production.detail(f.owner, source)).sheet.rowVersion,
        reason: 'ยืนยันตามรายงาน',
        rows: [{ ...row(2), replacementQty: 0 }],
      }),
    );
    const before = await f.production.history(f.owner, source),
      service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [{ ...row(2), lineIndex: 1 }]);
    await service.correct(f.owner, issueId, p.input);
    const ready = (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.lines;
    assert.equal(ready[0].ready, 11);
    assert.equal(ready[1].ready, 3);
    const corrected = (await f.exceptions.detail(f.owner, source)).issues[0];
    assert.equal(corrected.affected[0].lineIndex, 0);
    assert.equal(corrected.resolutionHistory![0].rows[0].lineIndex, 0);
    assert.equal(corrected.resolutionHistory![1].rows[0].lineIndex, 1);
    assert.deepEqual((await f.production.history(f.owner, source)).versions, before.versions);
  } finally {
    await f.db.close();
  }
});

test('upgrading a pre-correction database backfills the original resolution without changing current losses or original timestamps', async () => {
  const f = await productionFixture();
  try {
    const { issueId } = await resolvedIssue(f),
      before = (await f.db.query('SELECT * FROM production_issues WHERE id=$1', [issueId]))[0];
    // This fixture is an isolated in-memory database, never the shop database.
    for (const sql of [
      'DROP VIEW production_current_losses',
      'DROP TABLE production_loss_adjustments',
      'DROP TABLE production_issue_resolutions',
    ])
      await f.db.query(sql);
    await f.db.query('DELETE FROM schema_migrations WHERE name=$1', [
      '0018_production_issue_corrections.sql',
    ]);
    await f.db.migrate();
    await f.db.migrate();
    const issue = (await f.exceptions.detail(f.owner, f.id)).issues[0];
    assert.equal(issue.resolutionHistory!.length, 1);
    assert.equal(issue.resolutionHistory![0].kind, 'INITIAL');
    assert.equal(
      issue.resolutionHistory![0].at,
      new Date(before.resolved_at as string).toISOString(),
    );
    assert.equal(issue.resolutionHistory![0].actorName, before.resolver_name);
    assert.deepEqual(issue.resolutionHistory![0].rows, before.resolution_rows);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      8,
    );
    const service = new IssueCorrectionService(f.db),
      p = await command(service, f, issueId, [row(2, 1)]);
    await service.correct(f.owner, issueId, p.input);
    assert.equal(
      (await new SettlementService(f.db).detail(f.owner, f.order.id)).delivery.readyQuantity,
      9,
    );
    assert.deepEqual(
      (
        await f.db.query(
          'SELECT affected,resolved_at,resolver_name FROM production_issues WHERE id=$1',
          [issueId],
        )
      )[0],
      {
        affected: before.affected,
        resolved_at: before.resolved_at,
        resolver_name: before.resolver_name,
      },
    );
  } finally {
    await f.db.close();
  }
});
