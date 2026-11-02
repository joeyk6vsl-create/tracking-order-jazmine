import { uuidv7 } from 'uuidv7';
import type { Sql } from '../database';

export async function recordAudit(
  sql: Sql,
  actor: string | null,
  action: string,
  entity: string | null,
  reason?: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await sql.query(
    'INSERT INTO audit_events(id,actor_id,action,entity_id,reason,detail) VALUES($1,$2,$3,$4,$5,$6)',
    [uuidv7(), actor, action, entity, reason ?? null, JSON.stringify(detail)],
  );
}
export async function recordEvent(sql: Sql, type: string, id: string): Promise<void> {
  await sql.query('INSERT INTO outbox_events(id,type,aggregate_id) VALUES($1,$2,$3)', [
    uuidv7(),
    type,
    id,
  ]);
}
