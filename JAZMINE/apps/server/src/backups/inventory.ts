import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Sql } from '../database';
import type { TableInventory } from '../../../../packages/contracts/src/backups';
export async function runtimeVersion() {
  return String(
    JSON.parse(
      await readFile(
        resolve(dirname(require.resolve('@electric-sql/pglite')), '..', 'package.json'),
        'utf8',
      ),
    ).version,
  );
}
export async function migrationFiles() {
  return (await readdir(resolve('database/migrations')))
    .filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/.test(n))
    .sort();
}
const ident = (s: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(s)) throw new Error('Unsupported backup table');
  return '"' + s + '"';
};
export async function inventory(sql: Sql): Promise<TableInventory[]> {
  await sql.query("SET TIME ZONE 'UTC'");
  const tables = await sql.query(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const result: TableInventory[] = [];
  for (const t of tables) {
    const name = String(t.name),
      table = ident(name);
    const keys = await sql.query(
      "SELECT a.attname AS name FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,position) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE n.nspname='public' AND c.relname=$1 AND i.indisprimary ORDER BY k.position",
      [name],
    );
    if (!keys.length) throw new Error('Backup table has no stable key');
    const blob =
      (
        await sql.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND data_type='bytea' LIMIT 1",
          [name],
        )
      ).length > 0;
    const step = blob ? 1 : 64,
      hash = createHash('sha256');
    let count = 0;
    for (;;) {
      const rows = await sql.query(
        `SELECT to_jsonb(t)::text AS value FROM public.${table} t ORDER BY ${keys.map((k) => ident(String(k.name))).join(',')} LIMIT $1 OFFSET $2`,
        [step, count],
      );
      for (const row of rows) hash.update(String(row.value)).update('\n');
      count += rows.length;
      if (rows.length < step) break;
    }
    result.push({ table: name, rows: String(count), sha256: hash.digest('hex') });
  }
  return result;
}
