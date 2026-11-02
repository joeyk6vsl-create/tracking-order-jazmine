import { createHash } from 'node:crypto';
import { draftSchema } from '../../../../packages/contracts/src/orders';
import type {
  QuotationCheckInput,
  QuotationCheck,
  QuotationSnapshot,
} from '../../../../packages/contracts/src/quotations';
import type { UserView } from '../../../../packages/contracts/src/identity';
import { businessDate } from '../../../../packages/contracts/src/customers';
import type { Sql } from '../database';
import { PricingService } from '../pricing/pricing-service';
import { priceDraft } from './price-draft';
import { AppError } from '../errors';
export async function quotationSource(
  sql: Sql,
  pricing: PricingService,
  actor: UserView,
  draftId: string,
  input: QuotationCheckInput,
): Promise<QuotationCheck> {
  const draft = (
    await sql.query('SELECT row_version,input_json,quote_json FROM order_drafts WHERE id=$1', [
      draftId,
    ])
  )[0];
  if (!draft) throw new AppError('NOT_FOUND', 'ບໍ່ພົບຮ່າງ / Draft not found', 404);
  if (Number(draft.row_version) !== input.draftVersion)
    throw new AppError('STALE_STATE', 'ຮ່າງປ່ຽນແລ້ວ / Open the latest saved draft', 409);
  const data = draftSchema.parse(draft.input_json),
    missing: string[] = [],
    warnings: string[] = [],
    date = businessDate();
  const order = (
    await sql.query(
      'SELECT id,latest_revision,business_state,storage_state FROM orders WHERE draft_id=$1',
      [draftId],
    )
  )[0];
  if (order)
    missing.push('ຢືນຢັນອໍເດີແລ້ວ ໃຊ້ Invoice / This draft is confirmed; use invoice revisions');
  if (input.validUntil < date)
    missing.push('ວັນສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນອອກ / Valid-until date cannot precede issue date');
  const customer = data.customerId
    ? (
        await sql.query('SELECT name,phone,status,row_version FROM customers WHERE id=$1', [
          data.customerId,
        ])
      )[0]
    : null;
  if (
    data.customerId &&
    (!customer ||
      customer.status !== 'ACTIVE' ||
      customer.name !== data.customerName ||
      customer.phone !== data.phone)
  )
    missing.push('ຂໍ້ມູນລູກຄ້າປ່ຽນ ບັນທຶກຮ່າງໃໝ່ / Customer changed; update the saved draft');
  const lines = data.lines.length ? data.lines : [data.quote],
    ids = [
      ...new Set(
        lines.flatMap((l) => [
          l.productId,
          l.fabricId,
          ...l.parts.flatMap((p) => [p.componentId, ...(p.fabricId ? [p.fabricId] : [])]),
        ]),
      ),
    ];
  const selections = await sql.query<QuotationSnapshot['selections'][number]>(
    'SELECT id,name,kind,availability,row_version FROM catalog_items WHERE id=ANY($1::uuid[]) ORDER BY id',
    [ids],
  );
  for (const item of selections.filter(
    (i) => i.kind === 'FABRIC' && i.availability !== 'AVAILABLE',
  ))
    warnings.push(
      `${item.name}: ກວດຄວາມພ້ອມກ່ອນຢືນຢັນ / Check fabric availability before confirmation (${item.availability})`,
    );
  let snapshot: QuotationSnapshot | null = null;
  try {
    const result = await priceDraft(pricing, actor, data, sql);
    missing.push(...result.missing);
    if (Number((draft.quote_json as { revision: number }).revision) !== result.revision)
      warnings.push(
        'ຄຳນວນດ້ວຍລາຄາລ່າສຸດ ກວດຍອດກ່ອນອອກ / Recalculated with current prices; review before issuing',
      );
    snapshot = {
      input: data,
      pricing: result,
      selections,
      businessDate: date,
      validUntil: input.validUntil,
      notes: input.notes,
      templateVersion: 'quotation-v1',
    };
  } catch (e) {
    if (e instanceof AppError) missing.push(e.message);
    else throw e;
  }
  return {
    ready: missing.length === 0 && snapshot !== null && snapshot.pricing.total !== null,
    missing,
    warnings,
    snapshot,
    checkToken: createHash('sha256')
      .update(JSON.stringify({ draft, order, customer, selections, input, snapshot }))
      .digest('hex'),
  };
}
