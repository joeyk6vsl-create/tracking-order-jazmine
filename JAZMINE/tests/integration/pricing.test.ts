import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { seedPricing } from '../../apps/server/src/pricing/seed-pricing';
import {
  PricingService,
  discountedTotal,
  convertLak,
} from '../../apps/server/src/pricing/pricing-service';
import { quoteSchema, pricingConfigSchema } from '../../packages/contracts/src/pricing';

test('discount percentage precedes fixed money, clamps at zero and freebies do not multiply', () => {
  assert.equal(discountedTotal(1000000, 10, 50000), 850000);
  assert.equal(discountedTotal(40000, 0, 50000), 0);
  assert.equal(discountedTotal(1000000, 150, 0), 0);
  assert.equal(discountedTotal(1, 50, 0), 1);
  assert.equal(quoteSchema.safeParse({}).success, false);
});
test('foreign currency uses exact decimal rates and rounds only the output to cents', () => {
  assert.equal(convertLak(940000, '600'), '1566.67');
  assert.equal(convertLak(1, '200'), '0.01');
  assert.equal(convertLak(10000, '20000.1234567890'), '0.50');
  assert.throws(() => convertLak(1, '0'));
});
test('document prices persist by version; group A differs from folder 2; missing fabric price blocks total', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    assert.equal(await seedPricing(db), false);
    const auth = new AuthService(db, true);
    await auth.bootstrap({
      username: 'pricing.owner',
      displayName: 'Owner',
      password: 'Pricing-strong-password-123',
    });
    const actor = (await auth.login('pricing.owner', 'Pricing-strong-password-123', '127.0.0.1'))
      .user;
    await importAttachedCatalog(db);
    assert.equal(await seedPricing(db), true);
    assert.equal(await seedPricing(db), false);
    const service = new PricingService(db);
    const v = await service.current(actor);
    assert.equal(Object.keys(v.config.collar).length, 16);
    assert.deepEqual(v.config.base.RETAIL, [110000, 120000, 130000, 140000]);
    assert.equal(v.config.base.AGENT_LEVEL_4[0], 80000);
    assert.equal(v.config.base.AGENT_LEVEL_3[0], 85000);
    assert.equal(v.config.size.RETAIL['10XL'], 25000);
    assert.equal(v.config.size.AGENT_LEVEL_1['2XL'], 5000);
    assert.equal(v.config.size.RETAIL.J2XL, 0);
    const product = (
      await db.query("SELECT id,source_key FROM catalog_items WHERE name='ຄໍວີຊ້ອນ'")
    )[0];
    const fabric = (await db.query("SELECT id FROM catalog_items WHERE kind='FABRIC' LIMIT 1"))[0];
    assert.equal(v.config.collar[String(product.source_key)], 'A');
    const choices = new CatalogChoicesService(db);
    await choices.save(actor, String(product.id), {
      rowVersion: 1,
      sizes: ['M', '2XL'],
      fabricIds: [String(fabric.id)],
    });
    const input = quoteSchema.parse({
      productId: product.id,
      fabricId: fabric.id,
      size: 'M',
      group: 'RETAIL',
      quantity: 10,
      freeQuantity: 1,
      percent: 10,
      fixed: 50000,
    });
    const pending = await service.quote(actor, input);
    assert.equal(pending.total, null);
    assert.equal(pending.ready, false);
    const config = structuredClone(v.config);
    config.adjustments[String(fabric.id)] = 0;
    await service.save(actor, 1, config, 'ยืนยันผ้านี้ไม่คิดเพิ่ม');
    await assert.rejects(service.save(actor, 1, config, 'ฉบับเก่า'));
    assert.equal(await seedPricing(db), false);
    const priced = await service.quote(actor, input);
    assert.equal(priced.total, 940000);
    assert.equal(priced.productionQuantity, 11);
    assert.equal(priced.revision, 2);
    assert.equal((await db.query('SELECT revision FROM pricing_versions')).length, 2);
    assert.equal(
      pricingConfigSchema.parse(
        (await db.query('SELECT config FROM pricing_versions WHERE revision=1'))[0].config,
      ).adjustments[String(fabric.id)],
      undefined,
    );
    await assert.rejects(service.quote(actor, { ...input, size: '10XL' }));
    const sleeve = (await db.query("SELECT id FROM catalog_items WHERE name='ແຂນຍາວ'"))[0];
    const cuff = (await db.query("SELECT id FROM catalog_items WHERE name='ປາຍແຂນຕໍ່'"))[0];
    for (const part of [sleeve, cuff])
      await choices.save(actor, String(part.id), {
        rowVersion: 1,
        sizes: [],
        fabricIds: [String(fabric.id)],
      });
    const parts = [
      { componentId: String(sleeve.id), fabricId: String(fabric.id) },
      { componentId: String(cuff.id), fabricId: String(fabric.id) },
    ];
    const incomplete = await service.quote(actor, { ...input, parts, currency: 'THB' });
    assert.equal(incomplete.ready, false);
    assert.equal(incomplete.total, null);
    const extended = structuredClone(config);
    extended.components[String(sleeve.id)] = 10000;
    extended.components[String(cuff.id)] = 5000;
    extended.partFabric[String(sleeve.id)] = {
      enabled: true,
      rates: { [String(fabric.id)]: 2000 },
    };
    extended.partFabric[String(cuff.id)] = { enabled: true, rates: { [String(fabric.id)]: 3000 } };
    extended.fx = { THB: '600', USD: '22000.1234567890' };
    await service.save(actor, 2, extended, 'เพิ่มส่วนประกอบและอัตราแลกเปลี่ยนทดสอบ');
    const full = await service.quote(actor, { ...input, parts, currency: 'THB' });
    assert.equal(full.componentExtra, 15000);
    assert.equal(full.partFabricExtra, 5000);
    assert.equal(full.total, 1120000);
    assert.equal(full.convertedTotal, '1866.67');
    assert.equal(full.exchangeRate, '600');
    const omittedFabric = await service.quote(actor, {
      ...input,
      parts: parts.map((p) => ({ componentId: p.componentId })),
      currency: 'THB',
    });
    assert.equal(omittedFabric.ready, false);
    assert.equal(omittedFabric.total, null);
    assert(omittedFabric.missing.some((m) => m.includes('เลือกผ้าแยก')));
    const disabled = structuredClone(extended);
    disabled.partFabric[String(cuff.id)].enabled = false;
    disabled.fx.THB = '700';
    await service.save(actor, 3, disabled, 'ปิดคิดค่าผ้าปลายแขนและเปลี่ยนอัตรา');
    assert.equal((await service.quote(actor, { ...input, parts })).partFabricExtra, 2000);
    assert.equal(full.exchangeRate, '600');
    await assert.rejects(service.quote(actor, { ...input, parts: [parts[0], parts[0]] }));
    assert.equal(
      pricingConfigSchema.safeParse({ ...disabled, fx: { THB: '0', USD: null } }).success,
      false,
    );
    await db.query("UPDATE users SET role='STAFF',department='ADMIN' WHERE id=$1", [actor.id]);
    const admin = { ...actor, role: 'STAFF' as const, department: 'ADMIN' as const };
    await service.current(admin);
    await assert.rejects(service.save(admin, 2, config, 'ไม่มีสิทธิ์'));
    await db.query("UPDATE users SET department='PRINTING' WHERE id=$1", [actor.id]);
    await assert.rejects(service.current({ ...admin, department: 'PRINTING' }));
  } finally {
    await db.close();
  }
});
