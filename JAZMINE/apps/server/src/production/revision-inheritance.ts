import { createHash } from 'node:crypto';
import type { Sql } from '../database';
import type { SheetInput } from '../../../../packages/contracts/src/production';
import { AppError } from '../errors';
export async function carryFingerprint(sql: Sql, id: string) {
  const sheet = (
    await sql.query('SELECT allocations,notes,print_details FROM production_sheets WHERE id=$1', [
      id,
    ])
  )[0];
  const files = await sql.query(
    'SELECT DISTINCT ON(part) part,sha256 FROM production_part_files WHERE sheet_id=$1 ORDER BY part,revision DESC',
    [id],
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        allocations: sheet.allocations,
        notes: sheet.notes,
        names: (sheet.print_details as SheetInput['printDetails']).names,
        files,
      }),
    )
    .digest('hex');
}
export async function validateInheritance(sql: Sql, id: string, issuedVersion: number) {
  if (issuedVersion !== 0) return null;
  const carry = (
    await sql.query(
      'SELECT source_sheet_id,source_version,target_fingerprint,review_id FROM production_revision_carries WHERE target_sheet_id=$1 AND active',
      [id],
    )
  )[0];
  if (carry && carry.target_fingerprint !== (await carryFingerprint(sql, id)))
    throw new AppError(
      'REUSE_PLAN_CHANGED',
      'ແຜນ/ຊື່/ໄຟລ໌ປ່ຽນ ໃຫ້ກວດໃໝ່ ຫຼືຜະລິດໃໝ່ / Reuse plan changed; prepare fresh production',
      409,
    );
  return carry;
}
export async function inheritStages(sql: Sql, id: string, source: Record<string, unknown>) {
  await sql.query(
    'INSERT INTO production_stage_work(sheet_id,sheet_version,department,state,row_version,started_at,started_by,completed_at,completed_by) SELECT $1,1,department,state,row_version,started_at,started_by,completed_at,completed_by FROM production_stage_work WHERE sheet_id=$2 AND sheet_version=$3',
    [id, source.source_sheet_id, source.source_version],
  );
}
