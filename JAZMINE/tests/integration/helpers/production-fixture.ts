import { randomUUID } from 'node:crypto';
import { Database } from '../../../apps/server/src/database';
import { AuthService } from '../../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../../apps/server/src/identity/application/user-service';
import { importAttachedCatalog } from '../../../apps/server/src/catalog/import-catalog';
import { CatalogService } from '../../../apps/server/src/catalog/catalog-service';
import { CatalogChoicesService } from '../../../apps/server/src/catalog/catalog-choices-service';
import { PricingService } from '../../../apps/server/src/pricing/pricing-service';
import { seedPricing } from '../../../apps/server/src/pricing/seed-pricing';
import { DraftService } from '../../../apps/server/src/orders/draft-service';
import { ConfirmationService } from '../../../apps/server/src/orders/confirmation-service';
import { AssetService } from '../../../apps/server/src/assets/asset-service';
import { ProductionService } from '../../../apps/server/src/production/production-service';
import { WorkService } from '../../../apps/server/src/production/work-service';
import { ExceptionService } from '../../../apps/server/src/production/exception-service';
import { draftSchema } from '../../../packages/contracts/src/orders';
import { sheetSchema } from '../../../packages/contracts/src/production';
import {
  WORK_STAGES,
  type WorkStage,
  workActionSchema,
} from '../../../packages/contracts/src/production-work';
import { businessDate } from '../../../packages/contracts/src/customers';
import type { UserView } from '../../../packages/contracts/src/identity';
export async function productionFixture() {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true),
      password = 'Fixture-production-password-123';
    await auth.bootstrap({ username: 'fixture.owner', displayName: 'เจ้าของทดสอบ', password });
    const owner = (await auth.login('fixture.owner', password, '127.0.0.1')).user,
      users = new UserService(db, auth),
      actors = {} as Record<WorkStage | 'ADMIN' | 'GRAPHIC', UserView>;
    for (const department of [...WORK_STAGES, 'ADMIN', 'GRAPHIC'] as const) {
      const user = await users.create(owner, {
        username: 'fixture.' + department.toLowerCase(),
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
    await pricing.save(owner, 1, config, 'ราคาทดสอบ');
    const drafts = new DraftService(db, pricing),
      orders = new ConfirmationService(db),
      assets = new AssetService(db),
      production = new ProductionService(db),
      work = new WorkService(db),
      exceptions = new ExceptionService(db),
      draftId = randomUUID();
    const input = draftSchema.parse({
      rowVersion: 0,
      reason: 'สร้างร่าง',
      customerName: 'ทีมทดสอบปัญหา',
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
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) {
      const id = randomUUID();
      await assets.upload(actors.GRAPHIC, id, {
        draftId,
        kind,
        filename: kind + '.png',
        base64: png,
      });
      await assets.review(actors.GRAPHIC, id, 'APPROVED', 'ตรวจแล้ว');
    }
    const request = { draftId, rowVersion: 1, dueDate: businessDate() },
      checked = await orders.check(owner, request),
      order = (await orders.confirm(owner, request, checked.checkToken, 'ยืนยัน')).order;
    const id = randomUUID(),
      sheetInput = sheetSchema.parse({
        orderId: order.id,
        orderRevision: 1,
        rowVersion: 0,
        allocations: [{ lineIndex: 0, quantity: 11 }],
        notes: 'ทดสอบปัญหา',
        reason: 'เตรียม',
      });
    await production.save(actors.GRAPHIC, id, sheetInput);
    async function publish(sheetId: string) {
      for (const part of (await production.detail(owner, sheetId)).requiredParts)
        await production.upload(actors.GRAPHIC, sheetId, randomUUID(), {
          part,
          filename: part + '.png',
          base64: png,
        });
      const sheet = (await production.detail(owner, sheetId)).sheet;
      await production.action(actors.GRAPHIC, sheetId, sheet.rowVersion, 'ตรวจครบ', 'ready');
    }
    await publish(id);
    async function action(sheetId: string, department: WorkStage, action: 'start' | 'complete') {
      const job = (await work.detail(owner, sheetId)).job,
        stage = job.stages.find((s) => s.department === department)!;
      return work.action(
        actors[department],
        sheetId,
        department,
        workActionSchema.parse({
          requestId: randomUUID(),
          version: job.version,
          sheetRowVersion: job.sheetRowVersion,
          stageRowVersion: stage.rowVersion,
          action,
        }),
      );
    }
    async function finish(sheetId: string) {
      for (const stage of WORK_STAGES) {
        const state = (await work.detail(owner, sheetId)).job.stages.find(
          (s) => s.department === stage,
        )!.state;
        if (state === 'NOT_STARTED') await action(sheetId, stage, 'start');
        if (state !== 'COMPLETED') await action(sheetId, stage, 'complete');
      }
    }
    return {
      db,
      auth,
      users,
      owner,
      actors,
      drafts,
      orders,
      production,
      work,
      exceptions,
      id,
      order,
      sheetInput,
      input,
      draftId,
      publish,
      action,
      finish,
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
