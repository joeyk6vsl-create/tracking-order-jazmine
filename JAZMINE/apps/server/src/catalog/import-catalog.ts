import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import type { Database } from '../database';
import { recordAudit } from '../shared/audit';

const entriesSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string().min(1).max(120),
    kind: z.enum(['PRODUCT', 'FABRIC', 'COMPONENT']),
    section: z.enum(['COLLAR', 'PART', 'FABRIC']),
    group: z.number().int(),
    position: z.number().int(),
    file: z
      .string()
      .regex(/^image-\d+-\d+\.png$/)
      .nullable(),
  }),
);
/** Import the reviewed attachment once, preserving later owner edits. Same DB connection as server. */
export async function importAttachedCatalog(db: Database) {
  const root = resolve('database/catalog-import');
  const entries = entriesSchema.parse(
    JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8')),
  );
  const prepared = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      image: entry.file
        ? 'data:image/png;base64,' + (await readFile(resolve(root, entry.file))).toString('base64')
        : null,
    })),
  );
  return db.transaction(async (sql) => {
    const owner = (
      await sql.query(
        "SELECT id FROM users WHERE role='ADMIN_PROMAX' AND status='ACTIVE' ORDER BY id LIMIT 1",
      )
    )[0];
    if (!owner) return 0;
    let imported = 0;
    for (const entry of prepared) {
      const result = await sql.query(
        'INSERT INTO catalog_items(id,kind,name,notes,created_by,image_data,section,display_group,display_order,source_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(source_key) DO NOTHING RETURNING id',
        [
          uuidv7(),
          entry.kind,
          entry.name,
          '',
          owner.id,
          entry.image,
          entry.section,
          entry.group,
          entry.position,
          'pic-v1/' + entry.key,
        ],
      );
      if (result.length) {
        imported++;
        await recordAudit(
          sql,
          String(owner.id),
          'CATALOG_ATTACHMENT_IMPORTED',
          String(result[0].id),
          undefined,
          { source: entry.key },
        );
      }
    }
    return imported;
  });
}
