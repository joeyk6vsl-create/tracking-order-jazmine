import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { productionFixture } from './helpers/production-fixture';
import { syntheticPdf } from './helpers/document-pdf';
import { lifecycleInput, receive, settlementInput } from './helpers/archive-fixture';
import { reviseOrder } from './helpers/revise-order';
import { DocumentService } from '../../apps/server/src/documents/document-service';
import { DocumentProcessor } from '../../apps/server/src/documents/document-processor';
import { OrderLifecycleService } from '../../apps/server/src/orders/order-lifecycle-service';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { QuotationService } from '../../apps/server/src/orders/quotation-service';
import { businessDate } from '../../packages/contracts/src/customers';
import { AppError } from '../../apps/server/src/errors';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
test('current document status distinguishes cancelled orders, valid receipts, voided receipts and closed production with fresh permissions', async () => {
  const f = await productionFixture();
  try {
    const d = new DocumentService(f.db),
      receipt = await receive(f, '100000');
    assert.equal((await d.currentStatus(f.owner, 'INVOICE', f.order.id, 1)).primary, 'CURRENT');
    await assert.rejects(d.currentStatus(f.owner, 'INVOICE', f.order.id, 2), code('NOT_FOUND'));
    assert.equal(
      (await d.currentStatus(f.actors.GRAPHIC, 'PRODUCTION', f.id, 1)).primary,
      'CURRENT',
    );
    await assert.rejects(
      d.currentStatus(f.actors.GRAPHIC, 'INVOICE', f.order.id, 1),
      code('PERMISSION_DENIED'),
    );
    await assert.rejects(
      d.currentStatus(f.actors.PRINTING, 'PRODUCTION', f.id, 1),
      code('PERMISSION_DENIED'),
    );
    await new OrderLifecycleService(f.db).command(
      f.owner,
      f.order.id,
      'cancel',
      await lifecycleInput(f),
    );
    assert.equal((await d.currentStatus(f.owner, 'INVOICE', f.order.id, 1)).primary, 'CANCELLED');
    assert.equal((await d.currentStatus(f.owner, 'PRODUCTION', f.id, 1)).primary, 'CANCELLED');
    const active = await d.currentStatus(f.owner, 'RECEIPT', receipt.entryId, 1);
    assert.equal(active.primary, 'CURRENT');
    assert(active.flags.includes('ORDER_CANCELLED'));
    await new PaymentService(f.db).void(
      f.actors.ADMIN,
      f.order.id,
      receipt.entryId,
      await settlementInput(f),
    );
    assert.equal((await d.currentStatus(f.owner, 'RECEIPT', receipt.entryId, 1)).primary, 'VOIDED');
    await f.db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1', [f.actors.ADMIN.id]);
    await assert.rejects(
      d.currentStatus(f.actors.ADMIN, 'RECEIPT', receipt.entryId, 1),
      code('AUTHENTICATION_REQUIRED'),
    );
  } finally {
    await f.db.close();
  }
});
test('current-status PDF copies annotate every page without changing original bytes, document numbers, money, revisions or queue state', async () => {
  const f = await productionFixture();
  try {
    const receipt = await receive(f, '100000'),
      d = new DocumentService(f.db),
      p = new DocumentProcessor(f.db, 'http://localhost:5192', async (input) => {
        const pdf = await PDFDocument.load(await syntheticPdf(input));
        pdf.addPage([595.28, 841.89]);
        return pdf.save();
      });
    while (await p.processOne()) {
      /* Drain this fixture only. */
    }
    const original = await d.file(f.owner, 'RECEIPT', receipt.entryId, 1),
      invoice = await d.file(f.owner, 'INVOICE', f.order.id, 1);
    await new PaymentService(f.db).void(
      f.owner,
      f.order.id,
      receipt.entryId,
      await settlementInput(f),
    );
    await new OrderLifecycleService(f.db).command(
      f.owner,
      f.order.id,
      'cancel',
      await lifecycleInput(f),
    );
    const counters = await f.db.query(
        'SELECT * FROM business_counters ORDER BY family,business_date',
      ),
      jobs = await f.db.query('SELECT * FROM document_jobs ORDER BY id'),
      money = await f.db.query('SELECT * FROM payment_entries ORDER BY id');
    const copy = await d.currentCopy(f.owner, 'RECEIPT', receipt.entryId, 1),
      loaded = await PDFDocument.load(copy.bytes);
    assert.equal(loaded.getPageCount(), 2);
    assert(loaded.getTitle()?.includes('VOIDED'));
    assert.notEqual(copy.sha256, original.sha256);
    assert(copy.filename.endsWith('-current-status-copy.pdf'));
    const cancelled = await d.currentCopy(f.owner, 'INVOICE', f.order.id, 1);
    assert((await PDFDocument.load(cancelled.bytes)).getTitle()?.includes('CANCELLED'));
    assert.deepEqual((await d.file(f.owner, 'RECEIPT', receipt.entryId, 1)).bytes, original.bytes);
    assert.deepEqual((await d.file(f.owner, 'INVOICE', f.order.id, 1)).bytes, invoice.bytes);
    assert.deepEqual(
      await f.db.query('SELECT * FROM business_counters ORDER BY family,business_date'),
      counters,
    );
    assert.deepEqual(await f.db.query('SELECT * FROM document_jobs ORDER BY id'), jobs);
    assert.deepEqual(await f.db.query('SELECT * FROM payment_entries ORDER BY id'), money);
    await assert.rejects(
      d.currentCopy(f.actors.GRAPHIC, 'RECEIPT', receipt.entryId, 1),
      code('PERMISSION_DENIED'),
    );
    await f.db.query("UPDATE document_files SET file_data=decode('0001','hex') WHERE sha256=$1", [
      original.sha256,
    ]);
    await assert.rejects(
      d.currentCopy(f.owner, 'RECEIPT', receipt.entryId, 1),
      code('DOCUMENT_INTEGRITY'),
    );
  } finally {
    await f.db.close();
  }
});
test('superseded commercial revisions, older order instructions and archive are distinct from voiding', async () => {
  const f = await productionFixture();
  try {
    const d = new DocumentService(f.db),
      qs = new QuotationService(f.db),
      draft = randomUUID();
    await f.drafts.save(f.owner, draft, f.input);
    const issue = async (notes: string) => {
      const terms = { draftVersion: 1, validUntil: businessDate(), notes },
        check = await qs.check(f.owner, draft, terms);
      return qs.issue(f.owner, draft, {
        ...terms,
        requestId: randomUUID(),
        checkToken: check.checkToken,
        reason: 'ทดสอบใบเสนอราคา',
      });
    };
    const quote = await issue('ฉบับแรก');
    await issue('ฉบับใหม่');
    assert.equal(
      (await d.currentStatus(f.owner, 'QUOTATION', quote.revisionId, 1)).primary,
      'SUPERSEDED',
    );
    await reviseOrder(f);
    assert.equal((await d.currentStatus(f.owner, 'INVOICE', f.order.id, 1)).primary, 'SUPERSEDED');
    assert(
      (await d.currentStatus(f.owner, 'PRODUCTION', f.id, 1)).flags.includes(
        'ORDER_REVISION_CHANGED',
      ),
    );
    await f.db.query("UPDATE orders SET storage_state='ARCHIVED' WHERE id=$1", [f.order.id]);
    const archived = await d.currentStatus(f.owner, 'INVOICE', f.order.id, 2);
    assert.equal(archived.primary, 'CURRENT');
    assert(archived.flags.includes('ARCHIVED'));
  } finally {
    await f.db.close();
  }
});
