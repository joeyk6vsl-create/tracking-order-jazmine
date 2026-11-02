import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../apps/server/src/identity/application/user-service';
import { CatalogService } from '../../apps/server/src/catalog/catalog-service';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { seedPricing } from '../../apps/server/src/pricing/seed-pricing';
import { DraftService } from '../../apps/server/src/orders/draft-service';
import { ConfirmationService } from '../../apps/server/src/orders/confirmation-service';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { draftSchema } from '../../packages/contracts/src/orders';
import { businessDate } from '../../packages/contracts/src/customers';
import { readinessSchema } from '../../packages/contracts/src/confirmation';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('confirmation checks current data atomically, prevents duplicate numbers and preserves invoice and asset revisions', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true),
      password = 'Confirm-strong-password-123';
    await auth.bootstrap({ username: 'confirm.owner', displayName: 'Owner', password });
    const owner = (await auth.login('confirm.owner', password, '127.0.0.1')).user;
    const users = new UserService(db, auth),
      actors = [];
    for (const department of ['ADMIN', 'GRAPHIC'] as const) {
      const username = 'confirm.' + department.toLowerCase();
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
    const [admin, graphic] = actors;
    await importAttachedCatalog(db);
    await seedPricing(db);
    const product = (await db.query("SELECT id FROM catalog_items WHERE name='ຄໍມົນ'"))[0],
      fabric = (await db.query("SELECT id FROM catalog_items WHERE kind='FABRIC' LIMIT 1"))[0];
    const catalog = new CatalogService(db),
      choices = new CatalogChoicesService(db),
      pricing = new PricingService(db),
      assets = new AssetService(db),
      drafts = new DraftService(db, pricing),
      orders = new ConfirmationService(db);
    await choices.save(owner, String(product.id), {
      rowVersion: 1,
      sizes: ['M'],
      fabricIds: [String(fabric.id)],
    });
    const config = (await pricing.current(owner)).config;
    const requiredParts = await db.query(
      "SELECT id FROM catalog_items WHERE name IN ('ແຂນສັ້ນ','ບ່າທຳມະດາ','ປາຍແຂນປ່ອຍ') ORDER BY id",
    );
    assert.equal(requiredParts.length, 3);
    for (const part of requiredParts) config.components[String(part.id)] = 0;
    config.adjustments[String(fabric.id)] = 0;
    await pricing.save(owner, 1, config, 'กำหนดราคาผ้าทดสอบ');
    const id = randomUUID();
    const data = draftSchema.parse({
      rowVersion: 0,
      reason: 'สร้างร่าง',
      customerName: 'Customer',
      phone: '02055551234',
      brandingType: 'JAZMINE_STANDARD',
      quote: {
        productId: product.id,
        fabricId: fabric.id,
        size: 'M',
        group: 'RETAIL',
        quantity: 2,
        parts: requiredParts.map((p) => ({ componentId: p.id })),
      },
    });
    await drafts.save(admin, id, data);
    const incompleteId = randomUUID();
    await drafts.save(admin, incompleteId, { ...data, quote: { ...data.quote, parts: [] } });
    const incompleteCheck = await orders.check(
      admin,
      readinessSchema.parse({ draftId: incompleteId, rowVersion: 1, dueDate: businessDate() }),
    );
    assert(incompleteCheck.missing.some((m) => m.includes('เลือกบ่าเสื้อ')));
    assert(incompleteCheck.missing.some((m) => m.includes('เลือกปลายแขน')));
    const request = readinessSchema.parse({ draftId: id, rowVersion: 1, dueDate: businessDate() });
    assert.equal(readinessSchema.safeParse({ ...request, dueDate: '2026-02-30' }).success, false);
    let checked = await orders.check(admin, request);
    assert.equal(checked.ready, false);
    assert(checked.missing.some((m) => m.includes('ความพร้อมของผ้า')));
    await assert.rejects(orders.confirm(admin, request, checked.checkToken, 'ยังไม่พร้อม'));
    assert.equal((await db.query('SELECT * FROM business_counters')).length, 0);
    async function stock(status: string) {
      const row = (
        await db.query('SELECT row_version FROM catalog_items WHERE id=$1', [fabric.id])
      )[0];
      await catalog.availability(
        owner,
        String(fabric.id),
        Number(row.row_version),
        status,
        'สถานะผ้าทดสอบ',
      );
    }
    await stock('LOW_STOCK');
    async function file(kind: 'NECK_LABEL' | 'NECK_TAPE' | 'MOCKUP') {
      const assetId = randomUUID();
      await assets.upload(admin, assetId, {
        draftId: id,
        kind,
        filename: kind + '.png',
        base64: png,
      });
      await assets.review(graphic, assetId, 'APPROVED', 'ตรวจแล้ว');
      return assetId;
    }
    const labelId = await file('NECK_LABEL');
    await file('NECK_TAPE');
    await file('MOCKUP');
    await stock('OUT_OF_STOCK');
    assert((await orders.check(admin, request)).missing.some((m) => m.includes('ผ้าหมด')));
    await stock('LOW_STOCK');
    checked = await orders.check(admin, request);
    assert.equal(checked.ready, true);
    assert.equal(checked.warnings.length, 1);
    const changed = structuredClone(config);
    changed.base.RETAIL[0] += 1000;
    await pricing.save(owner, 2, changed, 'เปลี่ยนราคาหลังตรวจ');
    await assert.rejects(orders.confirm(admin, request, checked.checkToken, 'ราคาเปลี่ยน'));
    assert.equal((await db.query('SELECT id FROM orders')).length, 0);
    await drafts.save(admin, id, { ...data, rowVersion: 1, reason: 'รับราคาฉบับใหม่' });
    await file('MOCKUP');
    const current = { ...request, rowVersion: 2 };
    checked = await orders.check(admin, current);
    assert.equal(checked.ready, true);
    await stock('AVAILABLE');
    await assert.rejects(orders.confirm(admin, current, checked.checkToken, 'ข้อมูลเปลี่ยน'));
    checked = await orders.check(admin, current);
    await assert.rejects(orders.check(graphic, current));
    const [one, two] = await Promise.all([
      orders.confirm(admin, current, checked.checkToken, 'ยืนยันพร้อมกัน'),
      orders.confirm(admin, current, checked.checkToken, 'ยืนยันพร้อมกัน'),
    ]);
    assert.equal(one.order.id, two.order.id);
    await assert.rejects(
      orders.confirm(
        admin,
        { ...current, dueDate: '2027-01-01' },
        checked.checkToken,
        'เปลี่ยนวันโดยไม่แก้ร่าง',
      ),
    );
    assert.match(one.order.orderNumber, /^JAZ-\d{8}-00001$/);
    assert.match(one.order.invoiceNumber, /^INV-\d{8}-00001$/);
    assert.equal(one.order.snapshot.pricing.total, 222000);
    assert.equal((await db.query('SELECT * FROM order_revisions')).length, 1);
    assert.equal((await db.query('SELECT * FROM business_counters WHERE last_value=1')).length, 2);
    assert.equal(
      (await db.query('SELECT status FROM production_preparations'))[0].status,
      'WAITING_FOR_PRODUCTION_SHEET',
    );
    await db.query(
      "UPDATE catalog_items SET name='New master name',row_version=row_version+1 WHERE id=$1",
      [product.id],
    );
    await drafts.save(admin, id, {
      ...data,
      rowVersion: 2,
      reason: 'ลูกค้าเพิ่มจำนวน',
      quote: { ...data.quote, quantity: 3 },
    });
    await file('MOCKUP');
    const next = { ...request, rowVersion: 3 };
    const ready = await orders.check(admin, next);
    assert.equal(ready.ready, true);
    const revised = await orders.confirm(admin, next, ready.checkToken, 'เพิ่มจำนวนตามลูกค้า');
    assert.equal(revised.order.orderNumber, one.order.orderNumber);
    assert.equal(revised.order.invoiceNumber, one.order.invoiceNumber);
    assert.equal(revised.order.revision, 2);
    assert.equal(revised.order.snapshot.pricing.total, 333000);
    const history = await orders.history(admin, one.order.id);
    const old = history.revisions.find((r) => r.revision === 1)!;
    assert.equal((old.snapshot as typeof one.order.snapshot).pricing.total, 222000);
    assert((old.snapshot as typeof one.order.snapshot).selections.some((i) => i.name === 'ຄໍມົນ'));
    assert((old.snapshot as typeof one.order.snapshot).assets.some((a) => a.id === labelId));
    const newLabel = randomUUID();
    await assets.upload(admin, newLabel, {
      draftId: id,
      kind: 'NECK_LABEL',
      filename: 'new.png',
      base64: png,
    });
    assert.equal((await assets.checklist(admin, id)).ready, false);
    assert.equal(
      (await orders.confirm(admin, next, ready.checkToken, 'ลองคำขอเดิม')).order.revision,
      2,
    );
    assert.equal((await db.query('SELECT * FROM order_revisions')).length, 2);
    assert.equal(
      (await db.query('SELECT last_value FROM business_counters WHERE last_value<>1')).length,
      0,
    );
    assert.equal((await assets.content(admin, labelId)).bytes.toString('base64'), png);
  } finally {
    await db.close();
  }
});
