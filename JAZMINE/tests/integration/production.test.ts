import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../apps/server/src/identity/application/user-service';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { CatalogService } from '../../apps/server/src/catalog/catalog-service';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { seedPricing } from '../../apps/server/src/pricing/seed-pricing';
import { DraftService } from '../../apps/server/src/orders/draft-service';
import { ConfirmationService } from '../../apps/server/src/orders/confirmation-service';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { ProductionService } from '../../apps/server/src/production/production-service';
import { draftSchema } from '../../packages/contracts/src/orders';
import {
  sheetSchema,
  PARTS,
  OPTIONAL_PARTS,
  type SheetSnapshot,
} from '../../packages/contracts/src/production';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('production preparation splits fulfillment without exceeding it, gates ready on files, versions edits and detects new order revisions', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true),
      password = 'Production-strong-password-123';
    await auth.bootstrap({ username: 'ps.owner', displayName: 'Owner', password });
    const owner = (await auth.login('ps.owner', password, '127.0.0.1')).user;
    const users = new UserService(db, auth),
      actors = [];
    for (const department of ['GRAPHIC', 'ADMIN', 'PRINTING'] as const) {
      const username = 'ps.' + department.toLowerCase();
      let actor = await users.create(owner, {
        username,
        displayName: department,
        password,
        role: 'STAFF',
        department,
      });
      await auth.changePassword(actor, {
        currentPassword: password,
        newPassword: password + 'new',
      });
      actor = (await auth.login(username, password + 'new', '127.0.0.1')).user;
      actors.push(actor);
    }
    const [graphic, admin, printing] = actors;
    await importAttachedCatalog(db);
    await seedPricing(db);
    const product = (await db.query("SELECT id FROM catalog_items WHERE name='ຄໍມົນ'"))[0],
      fabric = (await db.query("SELECT id FROM catalog_items WHERE kind='FABRIC' LIMIT 1"))[0],
      parts = await db.query(
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
    await pricing.save(owner, 1, config, 'กำหนดราคาทดสอบ');
    const drafts = new DraftService(db, pricing),
      orders = new ConfirmationService(db),
      assets = new AssetService(db),
      production = new ProductionService(db),
      draftId = randomUUID();
    const data = draftSchema.parse({
      rowVersion: 0,
      reason: 'สร้างร่าง',
      customerName: 'Sports Team',
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
    await drafts.save(owner, draftId, data);
    async function graphicFile(kind: 'NECK_LABEL' | 'NECK_TAPE' | 'MOCKUP') {
      const id = randomUUID();
      await assets.upload(graphic, id, { draftId, kind, filename: kind + '.png', base64: png });
      await assets.review(graphic, id, 'APPROVED', 'ตรวจแล้ว');
    }
    for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) await graphicFile(kind);
    const request = { draftId, rowVersion: 1, dueDate: businessDate() },
      ready = await orders.check(owner, request),
      order = (await orders.confirm(owner, request, ready.checkToken, 'ยืนยัน')).order;
    const queue = await production.queue(graphic);
    assert.equal('pricing' in queue.orders[0], false);
    assert.equal('phone' in queue.orders[0], false);
    assert.equal(queue.orders[0].lines[0].quantity, 11);
    await assert.rejects(production.queue(printing));
    await assert.rejects(
      production.upload(admin, randomUUID(), randomUUID(), {
        part: 'BODY',
        filename: 'x.png',
        base64: png,
      }),
      (e) => e instanceof AppError && e.getStatus() === 403,
    );
    await assert.rejects(
      production.action(admin, randomUUID(), 1, 'ไม่ใช่หน้าที่', 'cancel'),
      (e) => e instanceof AppError && e.getStatus() === 403,
    );
    await production.queue(admin);
    const one = randomUUID(),
      two = randomUUID(),
      input = sheetSchema.parse({
        orderId: order.id,
        orderRevision: 1,
        rowVersion: 0,
        allocations: [{ lineIndex: 0, quantity: 6 }],
        notes: 'ชุดแรก',
        printDetails: {
          priority: 'URGENT',
          names: [{ lineIndex: 0, name: 'ສົມພອນ', number: '07' }],
        },
        reason: 'แบ่งผลิต',
      });
    await assert.rejects(production.save(admin, one, input));
    await production.save(graphic, one, input);
    await production.save(graphic, one, input);
    await assert.rejects(
      production.save(graphic, one, {
        ...input,
        rowVersion: 1,
        printDetails: {
          priority: 'NORMAL',
          names: Array.from({ length: 7 }, () => ({ lineIndex: 0, name: 'เกิน', number: '' })),
        },
      }),
      (e) => e instanceof AppError && e.code === 'NAMES_EXCEED_ALLOCATION',
    );
    assert.equal((await production.list(owner, order.id)).sheets.length, 1);
    await assert.rejects(
      production.save(graphic, two, { ...input, allocations: [{ lineIndex: 0, quantity: 6 }] }),
    );
    await production.save(graphic, two, {
      ...input,
      allocations: [{ lineIndex: 0, quantity: 5 }],
      notes: 'ชุดสอง',
    });
    await assert.rejects(production.action(graphic, one, 1, 'ยังไม่มีไฟล์', 'ready'));
    const requiredParts = PARTS.filter((p) => !(OPTIONAL_PARTS as readonly string[]).includes(p));
    assert.deepEqual(
      new Set((await production.detail(owner, one)).requiredParts),
      new Set(requiredParts),
    );
    for (const part of requiredParts) {
      const fileId = randomUUID(),
        file = { part, filename: part + '.png', base64: png };
      await production.upload(graphic, one, fileId, file);
      await production.upload(graphic, one, fileId, file);
    }
    let detail = await production.detail(graphic, one);
    assert.equal(detail.sheet.rowVersion, 9);
    await production.action(graphic, one, 9, 'ตรวจครบ', 'ready');
    await production.action(graphic, one, 9, 'คำขอเดิม', 'ready');
    detail = await production.detail(graphic, one);
    assert.match(detail.sheet.sheetNumber!, /^PS-\d{8}-00001$/);
    assert.equal(detail.sheet.issuedVersion, 1);
    assert.equal(
      (await db.query('SELECT status FROM production_preparations'))[0].status,
      'PARTIALLY_PREPARED',
    );
    await assert.rejects(
      production.upload(graphic, one, randomUUID(), {
        part: 'BODY',
        filename: 'new.png',
        base64: png,
      }),
    );
    await production.save(graphic, one, {
      ...input,
      rowVersion: 10,
      notes: 'แก้หมายเหตุฉบับใหม่',
      reason: 'แก้คำสั่ง',
      printDetails: { priority: 'NORMAL', names: [] },
    });
    await assert.rejects(production.action(graphic, one, 10, 'ฉบับเก่า', 'ready'));
    await production.action(graphic, one, 11, 'ตรวจฉบับใหม่', 'ready');
    const history = await production.history(admin, one);
    assert.equal(history.versions.length, 2);
    const original = history.versions.find((v) => v.version === 1)!.snapshot as SheetSnapshot;
    assert.equal(original.printDetails?.names[0].name, 'ສົມພອນ');
    assert.equal(original.printDetails?.priority, 'URGENT');
    assert.equal(original.version, 1);
    assert.equal(original.createdBy, 'GRAPHIC');
    assert.ok(original.createdAt);
    assert.ok(original.context.confirmedAt);
    assert.equal(original.allocations[0].quantity, 6);
    assert.equal(original.context.lines[0].quantity, 11);
    assert.equal(history.currentVersion, 2);
    assert.equal(history.state, 'READY');
    assert.equal(JSON.stringify(original).includes('phone'), false);
    assert.equal(JSON.stringify(original).includes('pricing'), false);
    assert.equal(
      (history.versions.find((v) => v.version === 1)!.snapshot as { notes: string }).notes,
      'ชุดแรก',
    );
    assert.equal((await production.detail(owner, one)).sheet.sheetNumber, detail.sheet.sheetNumber);
    await production.action(graphic, two, 1, 'ยกเลิกชุดที่สอง', 'cancel');
    await production.save(graphic, randomUUID(), {
      ...input,
      allocations: [{ lineIndex: 0, quantity: 5 }],
      notes: 'ชุดทดแทนที่ยังไม่เริ่มผลิต',
    });
    await drafts.save(owner, draftId, {
      ...data,
      rowVersion: 1,
      reason: 'เพิ่มจำนวน',
      quote: { ...data.quote, quantity: 12 },
    });
    await graphicFile('MOCKUP');
    const next = { ...request, rowVersion: 2 },
      checked = await orders.check(owner, next);
    await orders.confirm(owner, next, checked.checkToken, 'แก้จำนวน');
    assert.equal((await production.detail(graphic, one)).stale, true);
    await assert.rejects(production.save(graphic, randomUUID(), { ...input, orderRevision: 2 }));
    await production.action(graphic, one, 12, 'ออเดอร์เปลี่ยน ต้องจัดใหม่', 'cancel');
    const cancelled = await production.history(owner, one);
    assert.equal(cancelled.versions.length, 2);
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal(cancelled.stale, true);
  } finally {
    await db.close();
  }
});
