import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import {
  issueReportSchema,
  issueResolveSchema,
  replacementSchema,
  type IssueResolve,
} from '../../packages/contracts/src/production-exceptions';
import { sheetSchema } from '../../packages/contracts/src/production';
import { AppError } from '../../apps/server/src/errors';
import { workQuerySchema } from '../../packages/contracts/src/production-work';
const code = (expected: string) => (e: unknown) => e instanceof AppError && e.code === expected;
test('exception contracts validate reasons, quantities and repeated lines without accepting financial input', () => {
  assert.equal(
    issueReportSchema.safeParse({
      requestId: randomUUID(),
      version: 1,
      sheetRowVersion: 1,
      department: 'PRINTING',
      category: 'DAMAGE',
      mode: 'CONTINUE',
      description: 'ต้องระบุจำนวนเสีย',
      affected: [],
    }).success,
    false,
  );
  assert.equal(
    issueReportSchema.safeParse({
      requestId: randomUUID(),
      version: 1,
      sheetRowVersion: 1,
      department: 'PRINTING',
      category: 'OTHER',
      mode: 'STOP',
      description: '',
      affected: [],
    }).success,
    false,
  );
  assert.equal(
    issueResolveSchema.safeParse({
      requestId: randomUUID(),
      rowVersion: 1,
      sheetRowVersion: 1,
      reason: '',
      rows: [],
    }).success,
    false,
  );
  assert.equal(
    replacementSchema.safeParse({
      requestId: randomUUID(),
      reason: 'ทดสอบ',
      allocations: [
        { lineIndex: 0, quantity: 2 },
        { lineIndex: 0, quantity: 2 },
      ],
    }).success,
    false,
  );
});
test('exceptions stop only affected/downstream work, reserve replacements exactly and require QC for readiness', async () => {
  const f = await productionFixture(),
    { db, owner, actors, production, work, exceptions, id, order } = f;
  try {
    async function report(
      sheetId: string,
      mode: 'STOP' | 'CONTINUE',
      quantity = 0,
      department: 'PRINTING' | 'HEAT_TRANSFER' = 'PRINTING',
    ) {
      const job = (await work.detail(owner, sheetId)).job;
      const input = issueReportSchema.parse({
        requestId: randomUUID(),
        version: job.version,
        sheetRowVersion: job.sheetRowVersion,
        department,
        category: quantity ? 'DAMAGE' : 'MACHINE',
        mode,
        description: quantity ? 'พบงานเสีย' : 'ตรวจเครื่อง',
        affected: quantity ? [{ lineIndex: 0, quantity }] : [],
      });
      await exceptions.report(actors[department], sheetId, input);
      await exceptions.report(actors[department], sheetId, input);
      return input.requestId;
    }
    async function resolve(issueId: string, sheetId: string, rows: IssueResolve['rows'] = []) {
      const detail = await exceptions.detail(owner, sheetId),
        issue = detail.issues.find((i) => i.id === issueId)!;
      const input = issueResolveSchema.parse({
        requestId: randomUUID(),
        rowVersion: issue.rowVersion,
        sheetRowVersion: (await work.detail(owner, sheetId)).job.sheetRowVersion,
        reason: 'ตรวจสภาพและยืนยันจำนวนแล้ว',
        rows,
      });
      const result = (await exceptions.resolve(actors.ADMIN, issueId, input)) as {
        replacementId: string | null;
      };
      assert.deepEqual(await exceptions.resolve(actors.ADMIN, issueId, input), result);
      return result.replacementId;
    }
    await f.action(id, 'PRINTING', 'start');
    const flag = await report(id, 'CONTINUE'),
      stop = await report(id, 'STOP', 0, 'HEAT_TRANSFER');
    assert.equal((await db.query('SELECT id FROM production_issues')).length, 2);
    assert.equal((await work.detail(actors.PRINTING, id)).job.stages[0].blocked, undefined);
    assert.match((await work.detail(actors.LASER, id)).job.stages[0].blocked!, /STOP/);
    await assert.rejects(f.action(id, 'HEAT_TRANSFER', 'start'), code('PRODUCTION_STOPPED'));
    await f.action(id, 'PRINTING', 'complete');
    const bad = issueResolveSchema.parse({
      requestId: randomUUID(),
      rowVersion: 1,
      sheetRowVersion: (await work.detail(owner, id)).job.sheetRowVersion,
      reason: 'ทดสอบสิทธิ์',
      rows: [],
    });
    await assert.rejects(exceptions.resolve(actors.PRINTING, stop, bad), code('PERMISSION_DENIED'));
    await resolve(stop, id);
    await f.finish(id);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 0);
    await resolve(flag, id);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 11);
    assert.equal((await exceptions.detail(actors.PRINTING, id)).readiness, null);
    const issue = await report(id, 'CONTINUE', 3);
    await assert.rejects(
      production.save(owner, id, {
        ...f.sheetInput,
        rowVersion: (await production.detail(owner, id)).sheet.rowVersion,
        allocations: [{ lineIndex: 0, quantity: 2 }],
        reason: 'ลดไม่ได้ก่อนตรวจรายงานสามตัว',
      }),
      code('OPEN_ISSUE_QUANTITY'),
    );
    assert.equal(
      (await work.queue(owner, workQuerySchema.parse({}))).jobs.some(
        (job) => job.id === id && job.openIssues === 1,
      ),
      true,
    );
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 0);
    await assert.rejects(
      resolve(issue, id, [
        {
          lineIndex: 0,
          usableQty: 1,
          scrapQty: 3,
          releaseQty: 0,
          ignoredQty: 0,
          replacementQty: 3,
        },
      ]),
      code('RESOLUTION_BALANCE'),
    );
    const child = (await resolve(issue, id, [
      { lineIndex: 0, usableQty: 1, scrapQty: 2, releaseQty: 0, ignoredQty: 0, replacementQty: 2 },
    ]))!;
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 9);
    assert.equal((await production.detail(owner, child)).sheet.state, 'DRAFT');
    assert.equal((await production.detail(owner, child)).files.length, 0);
    await assert.rejects(
      exceptions.createReplacement(
        actors.ADMIN,
        issue,
        replacementSchema.parse({
          requestId: randomUUID(),
          reason: 'ซ้ำ',
          allocations: [{ lineIndex: 0, quantity: 1 }],
        }),
      ),
      code('REPLACEMENT_LIMIT'),
    );
    await assert.rejects(
      production.save(owner, randomUUID(), {
        ...f.sheetInput,
        allocations: [{ lineIndex: 0, quantity: 1 }],
      }),
      code('OVER_ALLOCATION'),
    );
    const childDraft = (await production.detail(owner, child)).sheet;
    await assert.rejects(
      production.action(actors.GRAPHIC, child, childDraft.rowVersion, 'ยังไม่มีไฟล์', 'ready'),
      code('PART_FILES_MISSING'),
    );
    await assert.rejects(
      production.save(
        owner,
        child,
        sheetSchema.parse({
          ...f.sheetInput,
          rowVersion: childDraft.rowVersion,
          allocations: [{ lineIndex: 0, quantity: 3 }],
          reason: 'เพิ่มเกินสิทธิ์',
        }),
      ),
      code('OVER_ALLOCATION'),
    );
    await f.publish(child);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 9);
    await f.finish(child);
    assert.equal((await exceptions.detail(owner, id)).readiness?.status, 'READY_TO_SHIP');
    const childIssue = await report(child, 'STOP', 1),
      grandchild = (await resolve(childIssue, child, [
        {
          lineIndex: 0,
          usableQty: 0,
          scrapQty: 1,
          releaseQty: 0,
          ignoredQty: 0,
          replacementQty: 1,
        },
      ]))!;
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 10);
    await f.publish(grandchild);
    await f.finish(grandchild);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 11);
    // สองคำขอปิดปัญหาต่างกันไม่สามารถตัดจำนวนเดียวกันจนเกิน PS ได้
    const first = await report(id, 'CONTINUE', 9),
      second = await report(id, 'CONTINUE', 9);
    const allLost = [
      { lineIndex: 0, usableQty: 0, scrapQty: 9, releaseQty: 0, ignoredQty: 0, replacementQty: 0 },
    ];
    const results = await Promise.allSettled([
      resolve(first, id, allLost),
      resolve(second, id, allLost),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const pending = (await exceptions.detail(owner, id)).issues.find((i) => i.state === 'OPEN')!;
    await resolve(pending.id, id, [
      { lineIndex: 0, usableQty: 0, scrapQty: 0, releaseQty: 0, ignoredQty: 9, replacementQty: 0 },
    ]);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 2);
    const lossIssue = (await exceptions.detail(owner, id)).issues.find((i) =>
      i.resolutionRows?.some((r) => r.scrapQty === 9),
    )!;
    const more = replacementSchema.parse({
      requestId: randomUUID(),
      reason: 'สร้างชดเชยส่วนที่เหลือ',
      allocations: [{ lineIndex: 0, quantity: 9 }],
    });
    const replacement = (await exceptions.createReplacement(actors.ADMIN, lossIssue.id, more)) as {
      replacementId: string;
    };
    assert.deepEqual(
      await exceptions.createReplacement(actors.ADMIN, lossIssue.id, more),
      replacement,
    );
    await assert.rejects(
      production.save(owner, id, {
        ...f.sheetInput,
        rowVersion: (await production.detail(owner, id)).sheet.rowVersion,
        allocations: [{ lineIndex: 0, quantity: 10 }],
        reason: 'ห้ามลดต่ำกว่าของเสียที่ยืนยันแล้ว',
      }),
      code('BELOW_RECORDED_LOSS'),
    );
    assert.equal(
      (await db.query('SELECT latest_revision FROM orders WHERE id=$1', [order.id]))[0]
        .latest_revision,
      1,
    );
    assert.equal((await db.query('SELECT id FROM order_revisions')).length, 1);
    const amount = (await exceptions.detail(owner, id)).readiness!;
    assert.equal(amount.quantity, 11);
    assert.equal(amount.lines[0].scrap, 12);
    assert.equal(amount.lines[0].allocated, 11);
    await f.publish(replacement.replacementId);
    const releaseIssue = await report(replacement.replacementId, 'CONTINUE', 2);
    await resolve(releaseIssue, replacement.replacementId, [
      { lineIndex: 0, usableQty: 0, scrapQty: 0, releaseQty: 2, ignoredQty: 0, replacementQty: 2 },
    ]);
    assert.equal((await exceptions.detail(owner, id)).readiness?.lines[0].released, 2);
    assert.equal((await exceptions.detail(owner, id)).readiness?.readyQuantity, 2);
    await production.action(
      actors.GRAPHIC,
      child,
      (await production.detail(owner, child)).sheet.rowVersion,
      'ยกเลิกชุดที่ต้องจัดใหม่',
      'cancel',
    );
    assert.equal((await exceptions.detail(owner, id)).readiness?.lines[0].scrap, 12);
    const pendingAfterCancel = await report(id, 'STOP');
    await production.action(
      actors.GRAPHIC,
      id,
      (await production.detail(owner, id)).sheet.rowVersion,
      'ยกเลิกชุดเดิมแต่เก็บปัญหาไว้ให้ปิด',
      'cancel',
    );
    assert.equal(
      (await work.queue(actors.ADMIN, workQuerySchema.parse({}))).jobs.some(
        (job) => job.id === id && job.openIssues === 1 && !!job.blocked,
      ),
      true,
    );
    await resolve(pendingAfterCancel, id);
    assert.equal(
      (await work.queue(actors.ADMIN, workQuerySchema.parse({}))).jobs.some((job) => job.id === id),
      false,
    );
    await f.users.update(owner, actors.ADMIN.id, {
      displayName: actors.ADMIN.displayName,
      role: 'STAFF',
      department: 'ADMIN',
      status: 'DISABLED',
      rowVersion: actors.ADMIN.rowVersion,
      reason: 'ทดสอบปิดสิทธิ์',
    });
    await assert.rejects(
      exceptions.createReplacement(actors.ADMIN, lossIssue.id, more),
      code('AUTHENTICATION_REQUIRED'),
    );
  } finally {
    await db.close();
  }
});
