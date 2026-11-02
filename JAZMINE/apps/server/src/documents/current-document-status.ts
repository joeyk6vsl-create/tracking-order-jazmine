import type {
  DocumentKind,
  DocumentCurrentStatus,
  DocumentSource,
} from '../../../../packages/contracts/src/documents';
import type { Sql } from '../database';
import { AppError } from '../errors';
export async function currentDocumentStatus(
  sql: Sql,
  kind: DocumentKind,
  id: string,
  version: number,
): Promise<DocumentCurrentStatus> {
  const query =
    kind === 'INVOICE'
      ? 'SELECT o.business_state,o.storage_state,o.latest_revision AS latest FROM orders o JOIN order_revisions v ON v.order_id=o.id AND v.revision=$2 WHERE o.id=$1'
      : kind === 'PRODUCTION'
        ? 'SELECT s.state,o.business_state,o.storage_state,s.order_revision,o.latest_revision AS order_latest,s.issued_version AS latest FROM production_sheets s JOIN orders o ON o.id=s.order_id JOIN production_sheet_versions v ON v.sheet_id=s.id AND v.version=$2 WHERE s.id=$1'
        : kind === 'RECEIPT'
          ? "SELECT p.state,p.void_reason,o.business_state,o.storage_state,1 AS latest FROM payment_entries p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND p.kind='RECEIPT' AND $2::integer=1"
          : "SELECT q.latest_revision AS latest,v.snapshot->>'validUntil' AS valid_until FROM quotation_revisions v JOIN quotations q ON q.id=v.quotation_id WHERE v.id=$1 AND v.revision=$2";
  const row = (await sql.query(query, [id, version]))[0];
  if (!row) throw new AppError('NOT_FOUND', 'Document revision not found', 404);
  const clock = (
    await sql.query("SELECT now() AS at,(now() AT TIME ZONE 'Asia/Vientiane')::date::text AS today")
  )[0];
  const flags: DocumentCurrentStatus['flags'] = [];
  if (kind === 'INVOICE') {
    const source = (
      await sql.query(
        "SELECT payload FROM document_jobs WHERE kind='INVOICE' AND source_id=$1 AND source_version=$2",
        [id, version],
      )
    )[0]?.payload as DocumentSource | undefined;
    if (source?.kind === 'INVOICE') {
      const settings = await sql.query('SELECT currency,version,enabled FROM payment_qr_settings');
      if (
        (source.paymentQrs ?? []).some(
          (ref) =>
            !settings.some(
              (s) => s.currency === ref.currency && Number(s.version) === ref.version && s.enabled,
            ),
        )
      )
        flags.push('PAYMENT_DETAILS_CHANGED');
    }
  }
  if (row.business_state === 'CANCELLED') flags.push('ORDER_CANCELLED');
  if (row.storage_state === 'ARCHIVED') flags.push('ARCHIVED');
  if (kind === 'PRODUCTION' && Number(row.order_revision) !== Number(row.order_latest))
    flags.push('ORDER_REVISION_CHANGED');
  if (kind === 'QUOTATION' && row.valid_until && String(row.valid_until) < String(clock.today))
    flags.push('EXPIRED');
  let primary: DocumentCurrentStatus['primary'] = 'CURRENT';
  if (Number(row.latest) !== version) primary = 'SUPERSEDED';
  if (kind === 'PRODUCTION' && row.state === 'DRAFT') primary = 'UNDER_REVIEW';
  if (
    (kind === 'INVOICE' || kind === 'PRODUCTION') &&
    (row.business_state === 'CANCELLED' || row.state === 'CANCELLED')
  )
    primary = 'CANCELLED';
  if (kind === 'RECEIPT' && row.state === 'VOIDED') primary = 'VOIDED';
  return {
    checkedAt: new Date(clock.at as string).toISOString(),
    primary,
    flags,
    reason: row.void_reason ? String(row.void_reason) : null,
    latestVersion: Number(row.latest),
  };
}
