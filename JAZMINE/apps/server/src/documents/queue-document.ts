import { uuidv7 } from 'uuidv7';
import type { DocumentKind, DocumentSource } from '../../../../packages/contracts/src/documents';
import type { QuotationSnapshot } from '../../../../packages/contracts/src/quotations';
import type { OrderSnapshot } from '../../../../packages/contracts/src/confirmation';
import type { SheetSnapshot } from '../../../../packages/contracts/src/production';
import type { PaymentEntry } from '../../../../packages/contracts/src/settlement';
import type { Sql } from '../database';
import { decimal } from '../settlements/money';
import { AppError } from '../errors';
import { currentPaymentQrs } from '../payment-qr/payment-qr-service';
const iso = (v: unknown) => new Date(v as string).toISOString();
export async function queueDocument(
  sql: Sql,
  kind: DocumentKind,
  id: string,
  version: number,
  includePaymentQrs = false,
) {
  let source: DocumentSource, number: string, actor: string;
  if (kind === 'QUOTATION') {
    const r = (
      await sql.query(
        'SELECT r.*,q.number FROM quotation_revisions r JOIN quotations q ON q.id=r.quotation_id WHERE r.id=$1 AND r.revision=$2',
        [id, version],
      )
    )[0];
    if (!r) throw new AppError('DOCUMENT_SOURCE_MISSING', 'Quotation source missing', 404);
    number = String(r.number);
    actor = String(r.actor_id);
    source = {
      kind,
      document: { id, number, revision: version, snapshot: r.snapshot as QuotationSnapshot },
    };
  } else if (kind === 'INVOICE') {
    const r = (
      await sql.query(
        'SELECT r.*,o.order_number,o.invoice_number FROM order_revisions r JOIN orders o ON o.id=r.order_id WHERE o.id=$1 AND r.revision=$2',
        [id, version],
      )
    )[0];
    if (!r) throw new AppError('DOCUMENT_SOURCE_MISSING', 'Invoice source missing', 404);
    number = String(r.invoice_number);
    actor = String(r.confirmed_by);
    source = {
      kind,
      ...(includePaymentQrs ? { paymentQrs: await currentPaymentQrs(sql, true) } : {}),
      document: {
        id,
        orderNumber: String(r.order_number),
        invoiceNumber: number,
        revision: version,
        confirmedAt: iso(r.confirmed_at),
        snapshot: r.snapshot as OrderSnapshot,
      },
    };
  } else if (kind === 'RECEIPT') {
    const r = (
      await sql.query("SELECT * FROM payment_entries WHERE id=$1 AND kind='RECEIPT'", [id])
    )[0];
    if (!r || version !== 1)
      throw new AppError('DOCUMENT_SOURCE_MISSING', 'Receipt source missing', 404);
    number = String(r.number);
    actor = String(r.actor_id);
    const document: PaymentEntry = {
      id,
      number,
      kind: 'RECEIPT',
      state: 'ACTIVE',
      purpose: r.purpose as PaymentEntry['purpose'],
      receiptId: null,
      correctsId: r.corrects_id as string | null,
      currency: r.currency as PaymentEntry['currency'],
      amount: decimal(BigInt(String(r.amount_minor))),
      lakAmount: String(r.lak_amount),
      exchangeRate: String(r.exchange_rate),
      method: r.method as PaymentEntry['method'],
      reference: String(r.reference),
      occurredAt: iso(r.occurred_at),
      recordedAt: iso(r.recorded_at),
      actorName: String(r.actor_name),
      reason: String(r.reason),
      voidReason: null,
      refundable: '0.00',
      snapshot: r.snapshot as PaymentEntry['snapshot'],
    };
    source = { kind, document, orderId: String(r.order_id) };
  } else {
    const r = (
      await sql.query('SELECT * FROM production_sheet_versions WHERE sheet_id=$1 AND version=$2', [
        id,
        version,
      ])
    )[0];
    if (!r) throw new AppError('DOCUMENT_SOURCE_MISSING', 'Production source missing', 404);
    const document = { ...(r.snapshot as SheetSnapshot), version, issuedAt: iso(r.issued_at) };
    number = String(document.sheetNumber);
    actor = String(r.issued_by);
    source = { kind, document, sheetId: id };
  }
  await sql.query(
    'INSERT INTO document_jobs(id,kind,source_id,source_version,number,payload,queued_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(kind,source_id,source_version) DO NOTHING',
    [uuidv7(), kind, id, version, number, JSON.stringify(source), actor],
  );
}
export async function backfillDocuments(sql: Sql) {
  const rows = await sql.query(
    "WITH sources AS (SELECT 'QUOTATION' AS kind,id AS source_id,revision AS version FROM quotation_revisions UNION ALL SELECT 'INVOICE',order_id,revision FROM order_revisions UNION ALL SELECT 'RECEIPT',id,1 FROM payment_entries WHERE kind='RECEIPT' UNION ALL SELECT 'PRODUCTION',sheet_id,version FROM production_sheet_versions) SELECT s.* FROM sources s WHERE NOT EXISTS(SELECT 1 FROM document_jobs j WHERE j.kind=s.kind AND j.source_id=s.source_id AND j.source_version=s.version) ORDER BY s.kind,s.source_id,s.version LIMIT 20",
  );
  for (const row of rows)
    await queueDocument(sql, row.kind as DocumentKind, String(row.source_id), Number(row.version));
  return rows.length;
}
