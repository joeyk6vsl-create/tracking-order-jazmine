import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  ProductionContext,
  PartFile,
  SheetSnapshot,
} from '../../../../packages/contracts/src/production';
import type { Sql } from '../database';
import { AppError } from '../errors';
import { businessDate } from '../../../../packages/contracts/src/customers';
import { recordAudit } from '../shared/audit';
import { iso } from './production-context';
import { queueDocument } from '../documents/queue-document';
export async function issueProductionSheet(
  sql: Sql,
  actor: UserView,
  sheet: Record<string, unknown>,
  ctx: ProductionContext,
  files: PartFile[],
  parts: PartFile['part'][],
  rowVersion: number,
  reason: string,
  continuedFrom?: SheetSnapshot['continuedFrom'],
) {
  const id = String(sheet.id);
  let number = sheet.sheet_number;
  if (!number) {
    const date = businessDate(),
      next = Number(
        (
          await sql.query(
            "INSERT INTO business_counters(family,business_date,last_value) VALUES('PS',$1,1) ON CONFLICT(family,business_date) DO UPDATE SET last_value=business_counters.last_value+1 RETURNING last_value",
            [date],
          )
        )[0].last_value,
      );
    if (next > 99999) throw new AppError('NUMBER_LIMIT', 'เลขใบผลิตประจำวันเต็ม', 409);
    number = `PS-${date.replaceAll('-', '')}-${String(next).padStart(5, '0')}`;
  }
  const version = Number(sheet.issued_version) + 1,
    versionId = uuidv7();
  const creator = (
    await sql.query('SELECT display_name FROM users WHERE id=$1', [sheet.created_by])
  )[0];
  const issuedAt = iso((await sql.query('SELECT now() AS at'))[0].at);
  const snapshot = {
    ...(continuedFrom ? { continuedFrom } : {}),
    context: ctx,
    allocations: sheet.allocations,
    notes: sheet.notes,
    files,
    requiredParts: parts,
    sheetNumber: number,
    printDetails: sheet.print_details,
    version,
    issuedAt,
    createdBy: creator?.display_name,
    createdAt: sheet.created_at ? iso(sheet.created_at) : null,
  };
  await sql.query(
    'INSERT INTO production_sheet_versions(id,sheet_id,version,snapshot,issued_by,issued_at) VALUES($1,$2,$3,$4,$5,$6)',
    [versionId, id, version, JSON.stringify(snapshot), actor.id, issuedAt],
  );
  for (const file of files)
    await sql.query(
      'INSERT INTO production_sheet_version_files(version_id,file_id) VALUES($1,$2)',
      [versionId, file.id],
    );
  await sql.query(
    "UPDATE production_sheets SET state='READY',sheet_number=$2,issued_version=$3,ready_input_version=$4,row_version=row_version+1,updated_by=$5 WHERE id=$1",
    [id, number, version, rowVersion, actor.id],
  );
  await recordAudit(sql, actor.id, 'PRODUCTION_SHEET_READY', id, reason, {
    version,
    orderRevision: sheet.order_revision,
  });

  await queueDocument(sql, 'PRODUCTION', id, version);
  return { number: String(number), version };
}
