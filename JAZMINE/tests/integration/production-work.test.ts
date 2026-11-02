import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../apps/server/src/identity/application/user-service';
import { createApplication } from '../../apps/server/src/app';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { CatalogService } from '../../apps/server/src/catalog/catalog-service';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { seedPricing } from '../../apps/server/src/pricing/seed-pricing';
import { DraftService } from '../../apps/server/src/orders/draft-service';
import { ConfirmationService } from '../../apps/server/src/orders/confirmation-service';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { ProductionService } from '../../apps/server/src/production/production-service';
import { WorkService } from '../../apps/server/src/production/work-service';
import { draftSchema } from '../../packages/contracts/src/orders';
import { sheetSchema } from '../../packages/contracts/src/production';
import {
  WORK_STAGES,
  workQuerySchema,
  workActionSchema,
  type WorkStage,
} from '../../packages/contracts/src/production-work';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
import type { UserView } from '../../packages/contracts/src/identity';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const code = (value: string) => (e: unknown) => e instanceof AppError && e.code === value;

test('work action validation accepts optional notes, requires a precise version and rejects quantities and unknown stages', () => {
  assert.equal(
    workActionSchema.safeParse({
      requestId: randomUUID(),
      version: 1,
      sheetRowVersion: 1,
      stageRowVersion: 0,
      action: 'start',
      reason: '',
    }).success,
    true,
  );
  assert.equal(
    workActionSchema.safeParse({
      requestId: randomUUID(),
      version: 0,
      sheetRowVersion: 1,
      stageRowVersion: 0,
      action: 'start',
    }).success,
    false,
  );
  assert.equal(
    workActionSchema.safeParse({
      requestId: randomUUID(),
      version: 1,
      sheetRowVersion: 1,
      stageRowVersion: 0,
      action: 'start',
      reason: 'เริ่ม',
      completedQty: 1,
    }).success,
    false,
  );
  assert.equal(workQuerySchema.safeParse({ department: 'GRAPHIC' }).success, false);
});

test('department work preserves handoffs, idempotency, permissions, immutable version context and stale-order safety', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true),
      password = 'Work-stage-password-123';
    await auth.bootstrap({ username: 'work.owner', displayName: 'เจ้าของทดสอบ', password });
    const owner = (await auth.login('work.owner', password, '127.0.0.1')).user;
    const users = new UserService(db, auth),
      actors = {} as Record<WorkStage | 'ADMIN' | 'GRAPHIC', UserView>;
    for (const department of [...WORK_STAGES, 'ADMIN', 'GRAPHIC'] as const) {
      const user = await users.create(owner, {
        username: 'work.' + department.toLowerCase(),
        displayName: department,
        password,
        role: 'STAFF',
        department,
      });
      await auth.changePassword(user, { currentPassword: password, newPassword: password + 'new' });
      actors[department] = (await auth.login(user.username, password + 'new', '127.0.0.1')).user;
    }
    await importAttachedCatalog(db);
    await seedPricing(db);
    const product = (await db.query("SELECT id FROM catalog_items WHERE name='ຄໍມົນ'"))[0],
      fabric = (await db.query("SELECT id FROM catalog_items WHERE kind='FABRIC' LIMIT 1"))[0];
    const parts = await db.query(
      "SELECT id FROM catalog_items WHERE name IN ('ແຂນສັ້ນ','ບ່າທຳມະດາ','ປາຍແຂນປ່ອຍ') ORDER BY id",
    );
    await new CatalogChoicesService(db).save(owner, String(product.id), {
      rowVersion: 1,
      sizes: ['M'],
      fabricIds: [String(fabric.id)],
    });
    await new CatalogService(db).availability(owner, String(fabric.id), 1, 'AVAILABLE', 'ทดสอบ');
    const pricing = new PricingService(db),
      config = (await pricing.current(owner)).config;
    config.adjustments[String(fabric.id)] = 0;
    for (const part of parts) config.components[String(part.id)] = 0;
    await pricing.save(owner, 1, config, 'ตั้งราคาทดสอบ');
    const drafts = new DraftService(db, pricing),
      orders = new ConfirmationService(db),
      assets = new AssetService(db),
      production = new ProductionService(db),
      work = new WorkService(db),
      draftId = randomUUID();
    const input = draftSchema.parse({
      rowVersion: 0,
      reason: 'สร้างร่าง',
      customerName: 'ทีมทดสอบงาน',
      phone: '02055551234',
      brandingType: 'JAZMINE_STANDARD',
      quote: {
        productId: product.id,
        fabricId: fabric.id,
        size: 'M',
        group: 'RETAIL',
        quantity: 10,
        freeQuantity: 1,
        parts: parts.map((p) => ({ componentId: p.id })),
      },
    });
    await drafts.save(owner, draftId, input);
    async function artwork(kind: 'NECK_LABEL' | 'NECK_TAPE' | 'MOCKUP') {
      const id = randomUUID();
      await assets.upload(actors.GRAPHIC, id, {
        draftId,
        kind,
        filename: kind + '.png',
        base64: png,
      });
      await assets.review(actors.GRAPHIC, id, 'APPROVED', 'ตรวจแล้ว');
    }
    for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) await artwork(kind);
    const confirmation = { draftId, rowVersion: 1, dueDate: businessDate() },
      checked = await orders.check(owner, confirmation),
      order = (await orders.confirm(owner, confirmation, checked.checkToken, 'ยืนยัน')).order;
    const id = randomUUID(),
      sheetInput = sheetSchema.parse({
        orderId: order.id,
        orderRevision: 1,
        rowVersion: 0,
        allocations: [{ lineIndex: 0, quantity: 11 }],
        notes: 'ทำตามฉบับนี้',
        reason: 'เตรียมผลิต',
      });
    await production.save(actors.GRAPHIC, id, sheetInput);
    assert.equal((await work.queue(actors.PRINTING, workQuerySchema.parse({}))).jobs.length, 0);
    await assert.rejects(work.detail(actors.PRINTING, id), code('NOT_FOUND'));
    for (const part of (await production.detail(owner, id)).requiredParts)
      await production.upload(actors.GRAPHIC, id, randomUUID(), {
        part,
        filename: part + '.png',
        base64: png,
      });
    const draft = await production.detail(owner, id);
    await production.action(actors.GRAPHIC, id, draft.sheet.rowVersion, 'ตรวจครบ', 'ready');
    const job = (await work.detail(actors.PRINTING, id)).job;
    const command = (
      stage: WorkStage,
      action: 'start' | 'complete',
      version = 1,
      stageRowVersion = action === 'start' ? 0 : 1,
    ) =>
      workActionSchema.parse({
        requestId: randomUUID(),
        version,
        sheetRowVersion: job.sheetRowVersion,
        stageRowVersion,
        action,
        reason: stage + ' ' + action,
      });
    const own = await work.detail(actors.LASER, id);
    assert.deepEqual(
      own.job.stages.map((s) => s.department),
      ['LASER'],
    );
    assert.equal(own.job.stages[0].previous?.department, 'HEAT_TRANSFER');
    assert.equal(JSON.stringify(own).includes('phone'), false);
    assert.equal(JSON.stringify(own).includes('pricing'), false);
    await assert.rejects(
      work.queue(actors.PRINTING, workQuerySchema.parse({ department: 'LASER' })),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      work.queue(actors.GRAPHIC, workQuerySchema.parse({})),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      work.action(actors.ADMIN, id, 'PRINTING', command('PRINTING', 'start')),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      work.action(actors.GRAPHIC, id, 'PRINTING', command('PRINTING', 'start')),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      work.action(actors.LASER, id, 'LASER', command('LASER', 'start')),
      code('HANDOFF_NOT_READY'),
    );
    await assert.rejects(
      work.action(actors.PRINTING, id, 'PRINTING', command('PRINTING', 'complete', 1, 0)),
      code('HANDOFF_NOT_COMPLETE'),
    );
    const start = command('PRINTING', 'start');
    const concurrent = await Promise.allSettled([
      work.action(actors.PRINTING, id, 'PRINTING', start),
      work.action(owner, id, 'PRINTING', command('PRINTING', 'start')),
    ]);
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
    // ฝั่งพนักงานเริ่มก่อนตามลำดับ transaction ในฐานทดสอบ; ส่งคำขอเดิมซ้ำต้องไม่มี event เพิ่ม
    if (concurrent[0].status === 'fulfilled')
      assert.deepEqual(
        await work.action(actors.PRINTING, id, 'PRINTING', start),
        concurrent[0].value,
      );
    else
      await assert.rejects(
        work.action(actors.PRINTING, id, 'PRINTING', start),
        code('STALE_STATE'),
      );
    assert.equal((await db.query('SELECT * FROM production_stage_events')).length, 1);
    await work.action(actors.HEAT_TRANSFER, id, 'HEAT_TRANSFER', command('HEAT_TRANSFER', 'start'));
    await work.action(actors.LASER, id, 'LASER', command('LASER', 'start'));
    await assert.rejects(
      work.action(actors.HEAT_TRANSFER, id, 'HEAT_TRANSFER', command('HEAT_TRANSFER', 'complete')),
      code('HANDOFF_NOT_COMPLETE'),
    );
    await assert.rejects(
      work.action(actors.PRINTING, id, 'LASER', command('LASER', 'complete')),
      code('PERMISSION_DENIED'),
    );
    assert.equal((await work.detail(actors.HEAT_TRANSFER, id)).events.length, 1);
    assert.equal((await work.detail(actors.PRINTING, id)).job.stages[0].state, 'IN_PROGRESS');
    for (const stage of WORK_STAGES) {
      if (!['PRINTING', 'HEAT_TRANSFER', 'LASER'].includes(stage))
        await work.action(actors[stage], id, stage, command(stage, 'start'));
      await work.action(actors[stage], id, stage, command(stage, 'complete'));
    }
    assert.equal((await work.queue(actors.PRINTING, workQuerySchema.parse({}))).jobs.length, 0);
    assert.equal(
      (await work.queue(actors.PRINTING, workQuerySchema.parse({ state: 'COMPLETED' }))).jobs
        .length,
      1,
    );
    assert.equal((await work.detail(owner, id)).events.length, 12);
    const file = own.snapshot.files[0];
    assert.equal(
      (await work.content(actors.PRINTING, id, 1, file.id, 'part')).bytes.length,
      Buffer.from(png, 'base64').length,
    );
    await assert.rejects(
      work.content(actors.PRINTING, id, 1, randomUUID(), 'part'),
      code('NOT_FOUND'),
    );
    assert.equal((await production.detail(owner, id)).hasWork, true);
    // แก้ PS หลังเริ่มงานได้ แต่สถานะ v1 ห้ามถูกย้ายมาเป็นงานสำเร็จของ v2
    await production.save(actors.GRAPHIC, id, {
      ...sheetInput,
      rowVersion: job.sheetRowVersion,
      notes: 'คำสั่งฉบับใหม่',
      reason: 'แก้หลังเริ่ม',
    });
    assert.match(
      (await work.detail(actors.PRINTING, id)).job.blocked!,
      /Instructions being revised/,
    );
    const edited = await production.detail(owner, id);
    await production.action(actors.GRAPHIC, id, edited.sheet.rowVersion, 'ตรวจฉบับใหม่', 'ready');
    const next = await work.detail(actors.PRINTING, id);
    assert.equal(next.job.version, 2);
    assert.equal(next.job.stages[0].state, 'NOT_STARTED');
    assert.equal(next.job.previousWork, true);
    const old = await work.detail(actors.PRINTING, id, 1);
    assert.equal(old.events.length, 2);
    assert.equal(old.job.stages[0].state, 'COMPLETED');
    assert.equal(old.snapshot.notes, 'ทำตามฉบับนี้');
    assert.match(old.job.blocked!, /History only/);
    await assert.rejects(
      work.action(actors.PRINTING, id, 'PRINTING', command('PRINTING', 'start')),
      code('INSTRUCTIONS_CHANGED'),
    );
    const cmd2 = { ...command('PRINTING', 'start', 2), sheetRowVersion: next.job.sheetRowVersion };
    const result = await work.action(actors.PRINTING, id, 'PRINTING', cmd2);
    assert.deepEqual(await work.action(actors.PRINTING, id, 'PRINTING', cmd2), result);
    await assert.rejects(
      work.action(actors.PRINTING, id, 'PRINTING', {
        ...cmd2,
        reason: 'คำขอเดิมแต่เปลี่ยนข้อความ',
      }),
      code('REQUEST_CONFLICT'),
    );
    const graphicId = next.snapshot.context.assets[0].id;
    assert.equal(
      (await work.content(actors.PRINTING, id, 2, graphicId, 'asset')).mime,
      'image/png',
    );
    // ตรวจเส้นทางจริงและสิทธิ์ไฟล์: พนักงานดูงานได้ แต่ยังเปิดออเดอร์การค้าไม่ได้
    const app = await createApplication(
      { production: false, port: 3100, origin: 'http://localhost:5173', dataDir: ':memory:' },
      db,
      false,
    );
    try {
      const http = app.getHttpAdapter().getInstance(),
        token = (await auth.login('work.printing', password + 'new', '127.0.0.1')).token,
        headers = { cookie: 'jazmine_session=' + token };
      assert.equal(
        (await http.inject({ method: 'GET', url: '/api/v1/production-work/jobs', headers }))
          .statusCode,
        200,
      );
      assert.equal(
        (
          await http.inject({
            method: 'GET',
            url: `/api/v1/production-work/jobs/${id}/versions/2/part/${file.id}/content`,
            headers,
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await http.inject({
            method: 'POST',
            url: `/api/v1/production-work/jobs/${id}/stages/PRINTING`,
            headers,
            payload: cmd2,
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (await http.inject({ method: 'GET', url: '/api/v1/production/orders', headers }))
          .statusCode,
        403,
      );
      assert.equal(
        (await http.inject({ method: 'GET', url: '/api/v1/production-work/jobs' })).statusCode,
        401,
      );
    } finally {
      await app.close();
    }
    // เปลี่ยนออเดอร์ไม่ลบงานที่บันทึกไว้ และหยุดใช้คำสั่งเก่าโดยเงียบ ๆ
    await drafts.save(owner, draftId, {
      ...input,
      rowVersion: 1,
      quote: { ...input.quote, quantity: 12 },
      reason: 'แก้จำนวน',
    });
    await artwork('MOCKUP');
    const changed = { ...confirmation, rowVersion: 2 },
      check = await orders.check(owner, changed);
    await orders.confirm(owner, changed, check.checkToken, 'ยืนยันฉบับใหม่');
    assert.match((await work.detail(actors.PRINTING, id)).job.blocked!, /Order/);
    await assert.rejects(
      work.action(actors.PRINTING, id, 'PRINTING', {
        ...cmd2,
        requestId: randomUUID(),
        action: 'complete',
        stageRowVersion: 1,
      }),
      code('INSTRUCTIONS_CHANGED'),
    );
    await production.action(
      actors.GRAPHIC,
      id,
      next.job.sheetRowVersion,
      'ยกเลิกใบเก่าเพื่อจัดใหม่',
      'cancel',
    );
    assert.equal(
      (await work.queue(actors.PRINTING, workQuerySchema.parse({ state: 'ALL' }))).jobs.length,
      0,
    );
    assert.equal((await work.detail(owner, id, 1)).events.length, 12);
    await users.update(owner, actors.PRINTING.id, {
      displayName: 'ย้ายแผนก',
      role: 'STAFF',
      department: 'LASER',
      status: 'ACTIVE',
      rowVersion: actors.PRINTING.rowVersion,
      reason: 'ทดสอบเปลี่ยนสิทธิ์',
    });
    await assert.rejects(work.detail(actors.PRINTING, id), code('AUTHENTICATION_REQUIRED'));
    await assert.rejects(
      work.action(actors.PRINTING, id, 'PRINTING', cmd2),
      code('AUTHENTICATION_REQUIRED'),
    );
  } finally {
    await db.close();
  }
});
