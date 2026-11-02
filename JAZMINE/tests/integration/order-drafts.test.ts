import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { seedPricing } from '../../apps/server/src/pricing/seed-pricing';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { DraftService } from '../../apps/server/src/orders/draft-service';
import { draftSchema } from '../../packages/contracts/src/orders';
import { quoteSchema } from '../../packages/contracts/src/pricing';

test('automatic freebies count paid quantity only; guest drafts persist once, audit revisions and deny production staff', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true);
    await auth.bootstrap({
      username: 'draft.owner',
      displayName: 'Owner',
      password: 'Draft-strong-password-123',
    });
    const actor = (await auth.login('draft.owner', 'Draft-strong-password-123', '127.0.0.1')).user;
    await importAttachedCatalog(db);
    await seedPricing(db);
    const product = (await db.query("SELECT id FROM catalog_items WHERE name='ຄໍມົນ'"))[0];
    const fabric = (await db.query("SELECT id FROM catalog_items WHERE kind='FABRIC' LIMIT 1"))[0];
    const choices = new CatalogChoicesService(db);
    await choices.save(actor, String(product.id), {
      rowVersion: 1,
      sizes: ['M'],
      fabricIds: [String(fabric.id)],
    });
    const pricing = new PricingService(db),
      drafts = new DraftService(db, pricing);
    const original = await pricing.current(actor);
    const input = quoteSchema.parse({
      productId: product.id,
      fabricId: fabric.id,
      size: 'M',
      group: 'RETAIL',
      quantity: 10,
      applyBuyGet: true,
    });
    await assert.rejects(pricing.quote(actor, input));
    const config = structuredClone(original.config);
    config.buyGet = { buy: 10, get: 1 };
    config.adjustments[String(fabric.id)] = 0;
    await pricing.save(actor, 1, config, 'ตั้งซื้อ10แถม1');
    for (const [quantity, expected] of [
      [9, 0],
      [10, 1],
      [11, 1],
      [20, 2],
    ]) {
      const result = await pricing.quote(actor, { ...input, quantity });
      assert.equal(result.automaticFreeQuantity, expected);
      assert.equal(result.productionQuantity, quantity + expected);
    }
    await assert.rejects(pricing.quote(actor, { ...input, freeQuantity: 1 }));
    const id = randomUUID(),
      data = draftSchema.parse({
        rowVersion: 0,
        reason: 'สร้างร่าง',
        customerName: 'ลูกค้าขาจร',
        phone: '02055551234',
        quote: input,
      });
    const first = await drafts.save(actor, id, data);
    assert.equal(first.draft.pricing.freeQuantity, 1);
    await drafts.save(actor, id, data);
    assert.equal((await drafts.list(actor)).drafts.length, 1);
    assert.equal((await db.query('SELECT id FROM customers')).length, 0);
    const changed = {
      ...data,
      rowVersion: 1,
      reason: 'เพิ่มจำนวนซื้อ',
      quote: { ...input, quantity: 20 },
    };
    await drafts.save(actor, id, changed);
    assert.equal((await drafts.list(actor)).drafts[0].rowVersion, 2);
    await assert.rejects(drafts.save(actor, id, data));
    const second = (await drafts.list(actor)).drafts[0];
    assert.equal((second.pricing as { freeQuantity: number }).freeQuantity, 2);
    assert.equal(
      (await db.query("SELECT id FROM audit_events WHERE action LIKE 'ORDER_DRAFT_%'")).length,
      2,
    );
    assert.equal(draftSchema.safeParse({ ...changed, reason: '' }).success, false);
    await choices.save(actor, String(product.id), {
      rowVersion: 2,
      sizes: ['M', 'L'],
      fabricIds: [String(fabric.id)],
    });
    const multiple = draftSchema.parse({
      ...data,
      rowVersion: 2,
      reason: 'แบ่งหลายไซซ์และจัดของแถม',
      quote: { ...input, percent: 10, fixed: 50000 },
      lines: [
        { ...input, quantity: 6, freeQuantity: 0, applyBuyGet: false },
        { ...input, size: 'L', quantity: 4, freeQuantity: 1, applyBuyGet: false },
      ],
      brandingType: 'JAZMINE_STANDARD',
      assetNotes: 'รอไฟล์ป้ายคอ',
    });
    const preview = await drafts.preview(actor, multiple);
    assert.equal(preview.total, 940000);
    assert.equal(preview.freeQuantity, 1);
    assert.equal(preview.productionQuantity, 11);
    assert.equal(preview.linePricing?.length, 2);
    await assert.rejects(
      drafts.preview(actor, {
        ...multiple,
        lines: multiple.lines.map((l) => ({ ...l, freeQuantity: 0 })),
      }),
    );
    await assert.rejects(
      drafts.preview(actor, {
        ...multiple,
        lines: [{ ...multiple.lines[0], fixed: 1 }, multiple.lines[1]],
      }),
    );
    await assert.rejects(
      drafts.preview(actor, {
        ...multiple,
        lines: [{ ...multiple.lines[0], group: 'AGENT_LEVEL_1' }, multiple.lines[1]],
      }),
    );
    const multiSaved = await drafts.save(actor, id, multiple);
    assert.equal(multiSaved.draft.rowVersion, 3);
    assert.equal(multiSaved.draft.input.lines[1].size, 'L');
    const history = (
      await db.query(
        "SELECT detail FROM audit_events WHERE action='ORDER_DRAFT_UPDATED' ORDER BY id DESC LIMIT 1",
      )
    )[0].detail as {
      before: { input: { quote: { quantity: number } } };
      after: { input: { lines: unknown[] } };
    };
    assert.equal(history.before.input.quote.quantity, 20);
    assert.equal(history.after.input.lines.length, 2);
    assert.equal(first.draft.pricing.quantity, 10);
    await db.query("UPDATE users SET role='STAFF',department='ADMIN' WHERE id=$1", [actor.id]);
    const admin = { ...actor, role: 'STAFF' as const, department: 'ADMIN' as const };
    await drafts.list(admin);
    await db.query("UPDATE users SET department='PRINTING' WHERE id=$1", [actor.id]);
    await assert.rejects(drafts.list({ ...admin, department: 'PRINTING' }));
  } finally {
    await db.close();
  }
});
