import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AppConfig } from './config';
import { acquireDatabaseLease } from './database-lease';

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}
export class Database implements Sql {
  private constructor(
    private readonly local?: PGlite,
    private readonly pool?: Pool,
    private readonly releaseLease?: () => Promise<void>,
  ) {}
  static async open(config: Pick<AppConfig, 'databaseUrl' | 'dataDir'>): Promise<Database> {
    if (config.databaseUrl) {
      const db = new Database(
        undefined,
        new Pool({ connectionString: config.databaseUrl, max: 8 }),
      );
      await db.query('SELECT 1');
      return db;
    }
    if (config.dataDir !== ':memory:') await mkdir(config.dataDir, { recursive: true });
    const release =
      config.dataDir === ':memory:' ? undefined : await acquireDatabaseLease(config.dataDir);
    const local = config.dataDir === ':memory:' ? new PGlite() : new PGlite(config.dataDir);
    try {
      await local.waitReady;
      return new Database(local, undefined, release);
    } catch (e) {
      await local.close().catch(() => {});
      await release?.();
      throw e;
    }
  }
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (this.local) return (await this.local.query<T>(text, params)).rows;
    return (await this.pool!.query(text, params)).rows as T[];
  }
  async transaction<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
    if (this.local)
      return this.local.transaction(async (tx) =>
        run({
          query: async <R extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query<R>(text, params)).rows,
        }),
      );
    const client: PoolClient = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      const result = await run({
        query: async <R extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await client.query(text, params)).rows as R[],
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async migrate(): Promise<void> {
    await this.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const dir = resolve('database/migrations');
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
      await this.transaction(async (sql) => {
        await sql.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
        if ((await sql.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).length)
          return;
        // Migration files are reviewed local sources, never user input.
        const source = await readFile(resolve(dir, name), 'utf8');
        for (const statement of source
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean))
          await sql.query(statement);
        await sql.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      });
    }
  }
  async close(): Promise<void> {
    if (this.local) {
      await this.local.close();
      await this.releaseLease?.();
    } else await this.pool!.end();
  }
  get supportsLocalBackup() {
    return !!this.local;
  }
  async localSnapshot(): Promise<Blob> {
    if (!this.local) throw new Error('Local snapshots require PGlite');
    // รอรายการที่กำลังบันทึกให้ commit/rollback ก่อน และกันรายการใหม่ระหว่างถ่ายสำเนา
    const local = this.local;
    return local.transaction(() => local.dumpDataDir('gzip'));
  }
  static async restoreSnapshot(
    snapshot: Uint8Array,
    dataDir: string = ':memory:',
  ): Promise<Database> {
    // ปฏิเสธทุกโฟลเดอร์ที่มีอยู่แล้ว ไม่เขียนทับฐานข้อมูลเดิม
    if (dataDir !== ':memory:') await mkdir(dataDir, { recursive: false, mode: 0o700 });
    const release = dataDir === ':memory:' ? undefined : await acquireDatabaseLease(dataDir);
    const local = new PGlite({
      ...(dataDir !== ':memory:' ? { dataDir } : {}),
      loadDataDir: new Blob([new Uint8Array(snapshot)]),
    });
    try {
      await local.waitReady;
      return new Database(local, undefined, release);
    } catch (e) {
      await local.close().catch(() => {});
      await release?.();
      throw e;
    }
  }
}
