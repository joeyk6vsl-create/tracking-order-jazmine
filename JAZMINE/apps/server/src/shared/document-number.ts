import type { Sql } from '../database';
import { businessDate } from '../../../../packages/contracts/src/customers';
import { AppError } from '../errors';
export async function nextDocumentNumber(sql: Sql, family: string, date = businessDate()) {
  const row = (
    await sql.query(
      'INSERT INTO business_counters(family,business_date,last_value) VALUES($1,$2,1) ON CONFLICT(family,business_date) DO UPDATE SET last_value=business_counters.last_value+1 RETURNING last_value',
      [family, date],
    )
  )[0];
  if (Number(row.last_value) > 99999)
    throw new AppError(
      'NUMBER_LIMIT',
      'ເລກເອກະສານປະຈຳວັນເຕັມ / Daily document number limit reached',
      409,
    );
  return `${family}-${date.replaceAll('-', '')}-${String(row.last_value).padStart(5, '0')}`;
}
