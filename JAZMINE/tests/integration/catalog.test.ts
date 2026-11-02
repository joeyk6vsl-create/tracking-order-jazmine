import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { CatalogService } from '../../apps/server/src/catalog/catalog-service';
import { catalogInput } from '../../packages/contracts/src/catalog';
import { importAttachedCatalog } from '../../apps/server/src/catalog/import-catalog';
import { CatalogChoicesService } from '../../apps/server/src/catalog/catalog-choices-service';
import { choicesSchema } from '../../packages/contracts/src/catalog-choices';

test('product choices validate fabrics, preserve size order and reject stale or unauthorized edits', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true);
    await auth.bootstrap({
      username: 'choices.owner',
      displayName: 'Owner',
      password: 'Choices-strong-password-123',
    });
    const actor = (await auth.login('choices.owner', 'Choices-strong-password-123', '127.0.0.1'))
      .user;
    const catalog = new CatalogService(db),
      choices = new CatalogChoicesService(db);
    const product = randomUUID(),
      fabric = randomUUID(),
      component = randomUUID();
    for (const [id, kind] of [
      [product, 'PRODUCT'],
      [fabric, 'FABRIC'],
      [component, 'COMPONENT'],
    ] as const)
      await catalog.save(actor, id, catalogInput.parse({ name: kind, kind }));
    assert.deepEqual((await choices.get(actor, product)).sizes, []);
    const input = choicesSchema.parse({
      rowVersion: 1,
      sizes: ['M', 'XS', 'XL'],
      fabricIds: [fabric],
    });
    await choices.save(actor, product, input);
    assert.deepEqual((await choices.get(actor, product)).sizes, ['M', 'XS', 'XL']);
    await assert.rejects(choices.save(actor, product, input));
    assert.equal(choicesSchema.safeParse({ ...input, sizes: ['M', 'm'] }).success, false);
    assert.equal(choicesSchema.safeParse({ ...input, fabricIds: [fabric, fabric] }).success, false);
    await assert.rejects(
      choices.save(actor, product, { ...input, rowVersion: 2, fabricIds: [component] }),
    );
    await catalog.save(
      actor,
      fabric,
      catalogInput.parse({ name: 'FABRIC', kind: 'FABRIC', active: false }),
      1,
    );
    await assert.rejects(choices.save(actor, product, { ...input, rowVersion: 2 }));
    assert.deepEqual((await choices.get(actor, product)).sizes, ['M', 'XS', 'XL']);
    await assert.rejects(choices.save(actor, component, input));
    await choices.save(actor, product, { rowVersion: 2, sizes: [], fabricIds: [] });
    assert.equal(
      (await db.query("SELECT id FROM audit_events WHERE action='CATALOG_CHOICES_UPDATED'")).length,
      2,
    );
    await db.query("UPDATE users SET role='STAFF',department='ADMIN' WHERE id=$1", [actor.id]);
    const admin = { ...actor, role: 'STAFF' as const, department: 'ADMIN' as const };
    assert.deepEqual((await choices.get(admin, product)).sizes, []);
    await assert.rejects(
      choices.save(admin, product, { rowVersion: 3, sizes: ['M'], fabricIds: [] }),
    );
  } finally {
    await db.close();
  }
});

test('attachment imports 42 records once, preserves owner edits and folder ordering across pages', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    assert.equal(await importAttachedCatalog(db), 0);
    const auth = new AuthService(db, true);
    await auth.bootstrap({
      username: 'import.owner',
      displayName: 'Owner',
      password: 'Import-strong-password-123',
    });
    const actor = (await auth.login('import.owner', 'Import-strong-password-123', '127.0.0.1'))
      .user;
    assert.equal(await importAttachedCatalog(db), 42);
    const service = new CatalogService(db);
    const options = (await service.options(actor)).items;
    assert.equal(options.filter((i) => i.section === 'COLLAR').length, 16);
    assert.equal(options.filter((i) => i.kind === 'FABRIC').length, 20);
    assert.equal(options.filter((i) => i.kind === 'COMPONENT').length, 6);
    assert.deepEqual(
      options.filter((i) => i.section === 'COLLAR').map((i) => i.displayGroup),
      [...Array(7).fill(1), ...Array(5).fill(2), ...Array(4).fill(3)],
    );
    const first = await service.list(actor);
    const second = await service.list(actor, String(first.next));
    assert.equal(new Set([...first.items, ...second.items].map((i) => i.id)).size, 42);
    const id = String(options[0].id);
    await db.query("UPDATE catalog_items SET name='Owner revised',active=false WHERE id=$1", [id]);
    assert.equal(await importAttachedCatalog(db), 0);
    assert.equal(
      (await db.query('SELECT name,active FROM catalog_items WHERE id=$1', [id]))[0].name,
      'Owner revised',
    );
    assert.match(String((await service.image(actor, id)).image), /^data:image\/png;base64,/);
    assert.equal(
      (await db.query("SELECT id FROM audit_events WHERE action='CATALOG_ATTACHMENT_IMPORTED'"))
        .length,
      42,
    );
  } finally {
    await db.close();
  }
});

test('catalog persists, protects edits, rejects stale image/version and unsafe images', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true);
    await auth.bootstrap({
      username: 'owner',
      displayName: 'Owner',
      password: 'Catalog-strong-password-123',
    });
    const actor = (await auth.login('owner', 'Catalog-strong-password-123', '127.0.0.1')).user;
    const service = new CatalogService(db);
    const id = randomUUID();
    const data = catalogInput.parse({ kind: 'PRODUCT', name: 'เสื้อกีฬา' });
    const first = await service.save(actor, id, data);
    assert.equal(first.item.name, data.name);
    await service.save(actor, id, data);
    assert.equal((await service.list(actor)).items.length, 1);
    await assert.rejects(service.save(actor, id, { ...data, name: 'แก้ทับ' }, 1 + 1));
    await assert.rejects(service.setImage(actor, id, 'data:image/svg+xml;base64,PHN2Zz4=', 1));
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await service.setImage(actor, id, image, 1);
    assert.equal((await service.image(actor, id)).image, image);
    await assert.rejects(service.setImage(actor, id, null, 1));
    await service.save(actor, id, { ...data, active: false }, 2);
    assert.equal((await service.list(actor)).items[0].active, false);
    const restricted = { ...actor, role: 'STAFF' as const, department: 'PRINTING' as const };
    await db.query("UPDATE users SET role='STAFF',department='PRINTING' WHERE id=$1", [actor.id]);
    await assert.rejects(service.list(restricted));
    await assert.rejects(service.save(restricted, randomUUID(), data));
    assert.equal(
      (await db.query("SELECT id FROM audit_events WHERE action='CATALOG_CREATED'")).length,
      1,
    );
  } finally {
    await db.close();
  }
});
