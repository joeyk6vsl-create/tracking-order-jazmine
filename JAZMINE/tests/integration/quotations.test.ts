import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { fixturePng } from './helpers/revise-order';
import { QuotationService } from '../../apps/server/src/orders/quotation-service';
import { PricingService } from '../../apps/server/src/pricing/pricing-service';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { SearchService } from '../../apps/server/src/search/search-service';
import { businessDate } from '../../packages/contracts/src/customers';
import {
  quotationCheckSchema,
  quotationIssueSchema,
} from '../../packages/contracts/src/quotations';
import { AppError } from '../../apps/server/src/errors';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const terms = (version = 1) => ({
  draftVersion: version,
  validUntil: businessDate(),
  notes: 'ราคาตามรายการที่เสนอ',
});
async function setup() {
  const f = await productionFixture(),
    draftId = randomUUID(),
    service = new QuotationService(f.db);
  await f.drafts.save(f.owner, draftId, f.input);
  return { ...f, proposalDraftId: draftId, service };
}
async function issue(f: Awaited<ReturnType<typeof setup>>, version = 1) {
  const t = terms(version),
    checked = await f.service.check(f.owner, f.proposalDraftId, t);
  assert(checked.ready, JSON.stringify(checked));
  const result = await f.service.issue(f.owner, f.proposalDraftId, {
    ...t,
    requestId: randomUUID(),
    checkToken: checked.checkToken,
    reason: 'ส่งใบเสนอราคา',
  });
  return f.service.detail(f.owner, result.revisionId);
}

test('quotation contracts reject price injection, empty reasons, invalid dates, extra fields and invalid versions', () => {
  const good = {
    ...terms(),
    requestId: randomUUID(),
    checkToken: 'a'.repeat(64),
    reason: 'เสนอราคา',
  };
  assert(quotationIssueSchema.safeParse(good).success);
  for (const input of [
    { ...good, total: 1 },
    { ...good, reason: ' ' },
    { ...good, validUntil: '2026-02-30' },
    { ...good, draftVersion: 0 },
    { ...good, checkToken: 'invalid' },
  ])
    assert(!quotationIssueSchema.safeParse(input).success);
  assert(!quotationCheckSchema.safeParse({ ...terms(), orderId: randomUUID() }).success);
});

test('admin issues without graphic approval; quotation check and QR reads create no sale, payment, order or production', async () => {
  const f = await setup();
  try {
    const tables = [
      'orders',
      'order_revisions',
      'payment_entries',
      'production_sheets',
      'shipments',
      'production_stage_work',
    ];
    const counts = async () =>
      Promise.all(
        tables.map(
          async (table) => (await f.db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n,
        ),
      );
    const before = await counts(),
      counters = await f.db.query('SELECT * FROM business_counters ORDER BY family');
    const confirm = await f.orders.check(f.owner, {
      draftId: f.proposalDraftId,
      rowVersion: 1,
      dueDate: businessDate(),
    });
    assert(!confirm.ready);
    const check = await f.service.check(f.actors.ADMIN, f.proposalDraftId, terms());
    assert(check.ready);
    assert.deepEqual(await f.db.query('SELECT * FROM business_counters ORDER BY family'), counters);
    const created = await f.service.issue(f.actors.ADMIN, f.proposalDraftId, {
        ...terms(),
        requestId: randomUUID(),
        checkToken: check.checkToken,
        reason: 'เสนอราคาก่อนรับไฟล์',
      }),
      view = await f.service.detail(f.actors.ADMIN, created.revisionId);
    assert.match(view.number, /^QT-\d{8}-00001$/);
    assert.equal(view.revision, 1);
    assert.equal(view.linkedOrderId, null);
    assert.equal(view.snapshot.pricing.total, 1100000);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(
      await f.db.query("SELECT * FROM business_counters WHERE family<>'QT' ORDER BY family"),
      counters,
    );
    const audit = await f.db.query('SELECT * FROM audit_events ORDER BY id');
    for (let i = 0; i < 3; i++) await f.service.detail(f.actors.ADMIN, created.revisionId);
    assert.deepEqual(await f.db.query('SELECT * FROM audit_events ORDER BY id'), audit);
    for (const actor of [f.actors.GRAPHIC, f.actors.PRINTING]) {
      await assert.rejects(
        f.service.check(actor, f.proposalDraftId, terms()),
        code('PERMISSION_DENIED'),
      );
      await assert.rejects(f.service.detail(actor, created.revisionId), code('PERMISSION_DENIED'));
      await assert.rejects(f.service.list(actor, ''), code('PERMISSION_DENIED'));
    }
  } finally {
    await f.db.close();
  }
});

test('concurrent retries issue one immutable revision and one QT number; reusing the request for changed content fails', async () => {
  const f = await setup();
  try {
    const checked = await f.service.check(f.owner, f.proposalDraftId, terms()),
      input = {
        ...terms(),
        requestId: randomUUID(),
        checkToken: checked.checkToken,
        reason: 'คำขอเดิม',
      };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => f.service.issue(f.owner, f.proposalDraftId, input)),
    );
    assert(results.every((r) => r.revisionId === results[0].revisionId));
    assert.equal((await f.service.history(f.owner, f.proposalDraftId)).revisions.length, 1);
    assert.equal(
      (await f.db.query("SELECT id FROM audit_events WHERE action='QUOTATION_ISSUED'")).length,
      1,
    );
    assert.equal(
      (await f.db.query("SELECT last_value FROM business_counters WHERE family='QT'"))[0]
        .last_value,
      1,
    );
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, { ...input, reason: 'เปลี่ยนคำขอ' }),
      code('REQUEST_CONFLICT'),
    );
  } finally {
    await f.db.close();
  }
});

test('changed prices, terms, catalog and drafts require a fresh check; rejected issue consumes no number', async () => {
  const f = await setup();
  try {
    const checked = await f.service.check(f.owner, f.proposalDraftId, terms()),
      input = {
        ...terms(),
        requestId: randomUUID(),
        checkToken: checked.checkToken,
        reason: 'ทดสอบข้อมูลเปลี่ยน',
      };
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, { ...input, notes: 'เปลี่ยนเงื่อนไข' }),
      code('QUOTATION_CHANGED'),
    );
    await f.db.query(
      'UPDATE catalog_items SET name=name||$2,row_version=row_version+1 WHERE id=$1',
      [f.input.quote.productId, ' updated'],
    );
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, input),
      code('QUOTATION_CHANGED'),
    );
    const current = await f.service.check(f.owner, f.proposalDraftId, terms()),
      pricing = new PricingService(f.db),
      p = await pricing.current(f.owner);
    p.config.base.RETAIL[0] += 1000;
    await pricing.save(f.owner, p.revision, p.config, 'ราคาใหม่');
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, { ...input, checkToken: current.checkToken }),
      code('QUOTATION_CHANGED'),
    );
    assert.equal((await f.db.query("SELECT * FROM business_counters WHERE family='QT'")).length, 0);
    const next = await f.service.check(f.owner, f.proposalDraftId, terms());
    assert(next.warnings.length > 0);
    assert.equal(next.snapshot!.pricing.total, 1110000);
    await f.drafts.save(f.owner, f.proposalDraftId, {
      ...f.input,
      rowVersion: 1,
      reason: 'เปลี่ยนจำนวน',
      quote: { ...f.input.quote, quantity: 3 },
    });
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, { ...input, checkToken: next.checkToken }),
      code('STALE_STATE'),
    );
    assert(
      !(
        await f.service.check(f.owner, f.proposalDraftId, { ...terms(2), validUntil: '2000-01-01' })
      ).ready,
    );
    assert.equal((await f.service.history(f.owner, f.proposalDraftId)).revisions.length, 0);
  } finally {
    await f.db.close();
  }
});

test('reissue keeps QT identity and old prices, discounts, gifts, FX and catalog names; confirmation remains a separate action', async () => {
  const f = await setup();
  try {
    const pricing = new PricingService(f.db),
      p = await pricing.current(f.owner);
    p.config.fx.THB = '700';
    await pricing.save(f.owner, p.revision, p.config, 'เรทเจ้าของ');
    await f.drafts.save(f.owner, f.proposalDraftId, {
      ...f.input,
      rowVersion: 1,
      reason: 'ส่วนลดพร้อมของแถม',
      quote: { ...f.input.quote, percent: 10, fixed: 100, freeQuantity: 2, currency: 'THB' },
    });
    const v1 = await issue(f, 2),
      frozen = structuredClone(v1.snapshot);
    assert.equal(v1.snapshot.pricing.total, 989900);
    assert.equal(v1.snapshot.pricing.convertedTotal, '1414.14');
    assert.equal(v1.snapshot.pricing.productionQuantity, 12);
    const p2 = await pricing.current(f.owner);
    p2.config.fx.THB = '800';
    p2.config.base.RETAIL[0] = 120000;
    await pricing.save(f.owner, p2.revision, p2.config, 'เปลี่ยนราคาและเรท');
    await f.db.query('UPDATE catalog_items SET name=$2,row_version=row_version+1 WHERE id=$1', [
      f.input.quote.productId,
      'New product name',
    ]);
    await f.drafts.save(f.owner, f.proposalDraftId, {
      ...f.input,
      rowVersion: 2,
      reason: 'แก้จำนวนและชื่อลูกค้า',
      customerName: 'Quotation changed',
      quote: { ...f.input.quote, quantity: 12 },
    });
    const v2 = await issue(f, 3);
    assert.equal(v1.number, v2.number);
    assert.equal(v2.revision, 2);
    assert.equal(v2.snapshot.pricing.total, 1440000);
    assert.deepEqual((await f.service.detail(f.owner, v1.id)).snapshot, frozen);
    assert.equal((await f.service.detail(f.owner, v1.id)).latestRevision, 2);
    const assets = new AssetService(f.db);
    for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) {
      const id = randomUUID();
      await assets.upload(f.actors.GRAPHIC, id, {
        draftId: f.proposalDraftId,
        kind,
        filename: kind + '.png',
        base64: fixturePng,
      });
      await assets.review(f.actors.GRAPHIC, id, 'APPROVED', 'อนุมัติไฟล์');
    }
    const request = { draftId: f.proposalDraftId, rowVersion: 3, dueDate: businessDate() },
      check = await f.orders.check(f.owner, request);
    assert(check.ready);
    const order = (
      await f.orders.confirm(f.owner, request, check.checkToken, 'ลูกค้าตกลงจึงยืนยัน')
    ).order;
    assert.match(order.orderNumber, /^JAZ-/);
    assert.match(order.invoiceNumber, /^INV-/);
    assert(!(await f.service.check(f.owner, f.proposalDraftId, terms(3))).ready);
    assert.equal((await f.service.history(f.owner, f.proposalDraftId)).linkedOrderId, order.id);
    assert.deepEqual((await f.service.detail(f.owner, v1.id)).snapshot, frozen);
  } finally {
    await f.db.close();
  }
});

test('unknown prices block a quotation while fabric availability warns; gift-only zero sales are valid when all prices are configured', async () => {
  const f = await setup();
  try {
    await f.db.query(
      "UPDATE catalog_items SET availability='UNKNOWN',row_version=row_version+1 WHERE id=$1",
      [f.input.quote.fabricId],
    );
    const warning = await f.service.check(f.owner, f.proposalDraftId, terms());
    assert(warning.ready);
    assert(warning.warnings.length > 0);
    const pricing = new PricingService(f.db),
      p = await pricing.current(f.owner);
    delete p.config.adjustments[f.input.quote.fabricId];
    await pricing.save(f.owner, p.revision, p.config, 'ยังไม่มีราคาผ้า');
    const missing = await f.service.check(f.owner, f.proposalDraftId, terms());
    assert(!missing.ready);
    assert.equal(missing.snapshot!.pricing.total, null);
    await assert.rejects(
      f.service.issue(f.owner, f.proposalDraftId, {
        ...terms(),
        requestId: randomUUID(),
        checkToken: missing.checkToken,
        reason: 'ห้ามเดาราคา',
      }),
      code('QUOTATION_NOT_READY'),
    );
    const p2 = await pricing.current(f.owner);
    p2.config.adjustments[f.input.quote.fabricId] = 0;
    await pricing.save(f.owner, p2.revision, p2.config, 'ยืนยันราคาเพิ่มเป็นศูนย์');
    await f.drafts.save(f.owner, f.proposalDraftId, {
      ...f.input,
      rowVersion: 1,
      reason: 'ของแถมล้วน',
      quote: { ...f.input.quote, quantity: 0, freeQuantity: 3 },
    });
    const v = await issue(f, 2);
    assert.equal(v.snapshot.pricing.total, 0);
    assert.equal(v.snapshot.pricing.productionQuantity, 3);
  } finally {
    await f.db.close();
  }
});

test('history paginates immutable revisions; search returns only latest and commercial staff; revoked actor cannot issue', async () => {
  const f = await setup();
  try {
    let first = '';
    for (let i = 0; i < 26; i++) {
      const v = await issue(f);
      first ||= v.id;
    }
    const page1 = await f.service.history(f.owner, f.proposalDraftId),
      page2 = await f.service.history(f.owner, f.proposalDraftId, 2);
    assert.equal(page1.revisions.length, 25);
    assert(page1.hasMore);
    assert.equal(page2.revisions.length, 1);
    assert(!page2.hasMore);
    assert.equal(page2.revisions[0].id, first);
    const search = new SearchService(f.db),
      number = page1.revisions[0].number,
      found = await search.read(f.actors.ADMIN, { q: number });
    assert.equal(found.results.length, 1);
    assert.equal(found.results[0].kind, 'QUOTATION');
    assert.equal(found.results[0].href, '?quotation=' + page1.revisions[0].id);
    assert.equal((await search.read(f.actors.GRAPHIC, { q: number })).results.length, 0);
    assert.equal((await search.read(f.actors.PRINTING, { q: number })).results.length, 0);
    const checked = await f.service.check(f.actors.ADMIN, f.proposalDraftId, terms());
    await f.db.query("UPDATE users SET status='DISABLED',row_version=row_version+1 WHERE id=$1", [
      f.actors.ADMIN.id,
    ]);
    await assert.rejects(
      f.service.issue(f.actors.ADMIN, f.proposalDraftId, {
        ...terms(),
        requestId: randomUUID(),
        checkToken: checked.checkToken,
        reason: 'บัญชีถูกปิดแล้ว',
      }),
      code('AUTHENTICATION_REQUIRED'),
    );
    assert.equal((await f.service.history(f.owner, f.proposalDraftId)).revisions[0].revision, 26);
  } finally {
    await f.db.close();
  }
});
