import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { syntheticPdf } from './helpers/document-pdf';
import { DocumentProcessor } from '../../apps/server/src/documents/document-processor';
import { DocumentService } from '../../apps/server/src/documents/document-service';
import { queueDocument, backfillDocuments } from '../../apps/server/src/documents/queue-document';
import { QuotationService } from '../../apps/server/src/orders/quotation-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { documentRetrySchema } from '../../packages/contracts/src/documents';
import { receiptSchema } from '../../packages/contracts/src/settlement';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const origin = 'https://shop.example';
test('document retry input requires an exact request and reason and rejects uploaded PDFs, URLs and replacement snapshots', () => {
  const good = { requestId: randomUUID(), reason: 'เตรียมไฟล์เดิม' };
  assert(documentRetrySchema.safeParse(good).success);
  for (const input of [
    { ...good, reason: ' ' },
    { ...good, url: 'http://example.com' },
    { ...good, file: 'JVBER' },
    { ...good, snapshot: {} },
    { ...good, version: 2 },
  ])
    assert(!documentRetrySchema.safeParse(input).success);
});
test('four document kinds enqueue atomically with business snapshots; retries preserve one job and numbers, rendering alone never changes business state', async () => {
  const f = await productionFixture();
  try {
    const draft = randomUUID();
    await f.drafts.save(f.owner, draft, f.input);
    const qs = new QuotationService(f.db),
      terms = { draftVersion: 1, validUntil: businessDate(), notes: 'ทดสอบ' },
      check = await qs.check(f.owner, draft, terms),
      q = await qs.issue(f.owner, draft, {
        ...terms,
        requestId: randomUUID(),
        checkToken: check.checkToken,
        reason: 'เสนอราคา',
      });
    const settlement = await new SettlementService(f.db).detail(f.owner, f.order.id),
      receipt = (await new PaymentService(f.db).receipt(
        f.actors.ADMIN,
        f.order.id,
        receiptSchema.parse({
          requestId: randomUUID(),
          reason: 'รับมัดจำ',
          expectedVersion: settlement.version,
          orderRevision: 1,
          purpose: 'DEPOSIT',
          currency: 'LAK',
          amount: '100000',
          method: 'CASH',
          reference: '',
          occurredAt: new Date().toISOString(),
          rateRevision: settlement.rates.revision,
        }),
      )) as { entryId: string };
    assert.equal((await f.db.query('SELECT id FROM document_jobs')).length, 4);
    const docs = new DocumentService(f.db);
    assert.equal((await docs.status(f.owner, 'INVOICE', f.order.id, 1)).state, 'RENDER_PENDING');
    await assert.rejects(docs.file(f.owner, 'INVOICE', f.order.id, 1), code('DOCUMENT_NOT_READY'));
    const before = await f.db.query('SELECT * FROM business_counters ORDER BY family'),
      payments = await f.db.query('SELECT * FROM payment_entries'),
      orders = await f.db.query('SELECT * FROM orders');
    await f.db.transaction((sql) => queueDocument(sql, 'INVOICE', f.order.id, 1));
    assert.equal((await f.db.query('SELECT id FROM document_jobs')).length, 4);
    const worker = new DocumentProcessor(f.db, origin, syntheticPdf);
    for (let i = 0; i < 4; i++) assert(await worker.processOne());
    assert.equal(await worker.processOne(), false);
    for (const [kind, id, version] of [
      ['QUOTATION', q.revisionId, 1],
      ['INVOICE', f.order.id, 1],
      ['RECEIPT', receipt.entryId, 1],
      ['PRODUCTION', f.id, 1],
    ] as const) {
      const meta = await docs.status(f.owner, kind, id, version);
      assert.equal(meta.state, 'ISSUED');
      assert.equal(meta.pageCount, 1);
      assert(meta.sha256);
      assert((await docs.file(f.owner, kind, id, version)).bytes.length > 0);
    }
    assert.deepEqual(await f.db.query('SELECT * FROM business_counters ORDER BY family'), before);
    assert.deepEqual(await f.db.query('SELECT * FROM payment_entries'), payments);
    assert.deepEqual(await f.db.query('SELECT * FROM orders'), orders);
    assert.equal(
      (await f.db.query("SELECT id FROM audit_events WHERE action='DOCUMENT_PDF_STORED'")).length,
      4,
    );
  } finally {
    await f.db.close();
  }
});
test('failed render never issues a file, has bounded automatic retries and a reasoned idempotent manual retry for the same revision', async () => {
  const f = await productionFixture();
  try {
    await f.db.query(
      "UPDATE document_jobs SET available_at=now()+interval '1 day' WHERE kind='PRODUCTION'",
    );
    const worker = new DocumentProcessor(f.db, origin, async () => {
        throw new Error('engine unavailable');
      }),
      docs = new DocumentService(f.db);
    for (let i = 0; i < 5; i++) {
      assert(await worker.processOne());
      await f.db.query(
        "UPDATE document_jobs SET available_at=now()-interval '1 second' WHERE kind='INVOICE'",
      );
    }
    assert.equal(await worker.processOne(), false);
    const status = await docs.status(f.owner, 'INVOICE', f.order.id, 1);
    assert.equal(status.state, 'FAILED');
    assert.equal(status.attempts, 5);
    assert.equal((await f.db.query('SELECT id FROM document_files')).length, 0);
    const input = { requestId: randomUUID(), reason: 'แก้เครื่องมือแล้วลองใหม่' };
    await Promise.all(
      Array.from({ length: 8 }, () => docs.retry(f.actors.ADMIN, 'INVOICE', f.order.id, 1, input)),
    );
    assert.equal(
      (await f.db.query("SELECT id FROM audit_events WHERE action='DOCUMENT_RETRY_REQUESTED'"))
        .length,
      1,
    );
    await assert.rejects(
      docs.retry(f.owner, 'INVOICE', f.order.id, 1, input),
      code('REQUEST_CONFLICT'),
    );
    const good = new DocumentProcessor(f.db, 'https://changed.example', syntheticPdf);
    await good.processOne();
    assert.equal((await docs.status(f.owner, 'INVOICE', f.order.id, 1)).state, 'ISSUED');
    assert.equal(
      (await f.db.query("SELECT render_origin FROM document_jobs WHERE kind='INVOICE'"))[0]
        .render_origin,
      origin,
    );
    assert.equal((await f.db.query('SELECT id FROM document_jobs')).length, 2);
    const saved = await docs.file(f.owner, 'INVOICE', f.order.id, 1);
    await docs.retry(f.owner, 'INVOICE', f.order.id, 1, {
      requestId: randomUUID(),
      reason: 'ไฟล์พร้อมแล้ว',
    });
    assert.deepEqual((await docs.file(f.owner, 'INVOICE', f.order.id, 1)).bytes, saved.bytes);
  } finally {
    await f.db.close();
  }
});
test('a crashed worker is reclaimed; fencing prevents late completion from replacing an already stored file', async () => {
  const f = await productionFixture();
  try {
    await f.db.query(
      "UPDATE document_jobs SET available_at=now()+interval '1 day' WHERE kind='PRODUCTION'",
    );
    let release: () => void = () => {},
      started: () => void = () => {};
    const barrier = new Promise<void>((r) => (release = r)),
      claimed = new Promise<void>((r) => (started = r));
    const a = new DocumentProcessor(f.db, origin, async (p) => {
        started();
        await barrier;
        return syntheticPdf(p);
      }),
      running = a.processOne();
    await claimed;
    await f.db.query(
      "UPDATE document_jobs SET lease_until=now()-interval '1 second' WHERE kind='INVOICE'",
    );
    const b = new DocumentProcessor(f.db, origin, syntheticPdf);
    assert(await b.processOne());
    const doc = new DocumentService(f.db),
      stored = await doc.file(f.owner, 'INVOICE', f.order.id, 1);
    release();
    await running;
    assert.deepEqual((await doc.file(f.owner, 'INVOICE', f.order.id, 1)).bytes, stored.bytes);
    assert.equal((await f.db.query('SELECT id FROM document_files')).length, 1);
    assert.equal((await doc.status(f.owner, 'INVOICE', f.order.id, 1)).attempts, 2);
  } finally {
    await f.db.close();
  }
});
test('downloads remain byte-identical after source changes, denial/revocation is fresh, and corrupt stored bytes fail closed', async () => {
  const f = await productionFixture();
  try {
    const worker = new DocumentProcessor(f.db, origin, syntheticPdf);
    await worker.processOne();
    await worker.processOne();
    const docs = new DocumentService(f.db),
      saved = await docs.file(f.owner, 'INVOICE', f.order.id, 1),
      audit = await f.db.query('SELECT * FROM audit_events ORDER BY id');
    await f.db.query("UPDATE catalog_items SET name='เปลี่ยนชื่อ' WHERE id=$1", [
      f.input.quote.productId,
    ]);
    assert.deepEqual(
      (await docs.file(f.actors.ADMIN, 'INVOICE', f.order.id, 1)).bytes,
      saved.bytes,
    );
    assert.deepEqual(await f.db.query('SELECT * FROM audit_events ORDER BY id'), audit);
    for (const actor of [f.actors.GRAPHIC, f.actors.PRINTING])
      await assert.rejects(docs.file(actor, 'INVOICE', f.order.id, 1), code('PERMISSION_DENIED'));
    assert((await docs.file(f.actors.GRAPHIC, 'PRODUCTION', f.id, 1)).bytes.length > 0);
    await f.db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1', [f.actors.ADMIN.id]);
    await assert.rejects(
      docs.file(f.actors.ADMIN, 'INVOICE', f.order.id, 1),
      code('AUTHENTICATION_REQUIRED'),
    );
    await f.db.query(
      "UPDATE document_files SET sha256=repeat('0',64) WHERE job_id=(SELECT id FROM document_jobs WHERE kind='INVOICE')",
    );
    await assert.rejects(docs.file(f.owner, 'INVOICE', f.order.id, 1), code('DOCUMENT_INTEGRITY'));
  } finally {
    await f.db.close();
  }
});
test('legacy immutable revisions are queued once without allocating new numbers; invalid rendered bytes never become issued', async () => {
  const f = await productionFixture();
  try {
    await f.db.query('DELETE FROM document_jobs');
    const numbers = await f.db.query('SELECT * FROM business_counters ORDER BY family');
    assert.equal(await f.db.transaction((sql) => backfillDocuments(sql)), 2);
    assert.equal(await f.db.transaction((sql) => backfillDocuments(sql)), 0);
    assert.deepEqual(await f.db.query('SELECT * FROM business_counters ORDER BY family'), numbers);
    const worker = new DocumentProcessor(f.db, origin, async () => Buffer.from('not PDF'));
    await worker.processOne();
    assert.equal((await f.db.query('SELECT id FROM document_files')).length, 0);
    assert.equal((await f.db.query("SELECT id FROM document_jobs WHERE state='ISSUED'")).length, 0);
  } finally {
    await f.db.close();
  }
});
