import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as derive,
} from 'node:crypto';
import { gunzip as decompress } from 'node:zlib';
import { promisify } from 'node:util';
import { z } from 'zod';
import { MAX_BACKUP_BYTES, backupPasswordSchema } from '../../../../packages/contracts/src/backups';
import { AppError } from '../errors';
const MAGIC = Buffer.from('JAZMINE-BACKUP-01\n');
const MAX_TAR_BYTES = 256 * 1024 * 1024;
const key = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    derive(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  );
const gunzip = promisify(decompress);
export const sha256 = (data: Uint8Array | string) =>
  createHash('sha256').update(data).digest('hex');
export const manifestSchema = z
  .object({
    format: z.literal('JAZMINE_LOCAL_V1'),
    createdAt: z.iso.datetime(),
    runtime: z.string().max(50),
    postgres: z.string().max(50),
    dumpSha256: z.string().regex(/^[0-9a-f]{64}$/),
    migrations: z.array(z.string().regex(/^\d{4}_[a-z0-9_]+\.sql$/)).max(1000),
    tables: z
      .array(
        z
          .object({
            table: z.string().regex(/^[a-z][a-z0-9_]*$/),
            rows: z.string().regex(/^\d+$/),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;
const rejected = () =>
  new AppError(
    'INVALID_BACKUP',
    'ລະຫັດບໍ່ຖືກ ຫຼື ໄຟລ໌ສຳຮອງໃຊ້ບໍ່ໄດ້ / Incorrect password or invalid backup',
    400,
  );
export async function encryptArchive(dump: Uint8Array, manifest: Manifest, password: string) {
  backupPasswordSchema.parse(password);
  const json = Buffer.from(JSON.stringify(manifestSchema.parse(manifest))),
    length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  if (json.length > 1024 * 1024 || dump.length + json.length + 128 > MAX_BACKUP_BYTES)
    throw new AppError('BACKUP_TOO_LARGE', 'ໄຟລ໌ເກີນ 64 MB / Backup exceeds 64 MB', 413);
  const salt = randomBytes(16),
    iv = randomBytes(12),
    header = Buffer.concat([MAGIC, salt, iv]),
    secret = await key(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    cipher.setAAD(header);
    const encrypted = Buffer.concat([
      cipher.update(length),
      cipher.update(json),
      cipher.update(dump),
      cipher.final(),
    ]);
    return Buffer.concat([header, cipher.getAuthTag(), encrypted]);
  } finally {
    secret.fill(0);
  }
}
export async function decryptArchive(file: Uint8Array, password: string) {
  if (file.length > MAX_BACKUP_BYTES)
    throw new AppError('BACKUP_TOO_LARGE', 'ໄຟລ໌ເກີນ 64 MB / Backup exceeds 64 MB', 413);
  if (
    file.length < MAGIC.length + 16 + 12 + 16 + 4 ||
    !Buffer.from(file.subarray(0, MAGIC.length)).equals(MAGIC)
  )
    throw rejected();
  backupPasswordSchema.parse(password);
  const buffer = Buffer.from(file),
    headerSize = MAGIC.length + 28,
    secret = await key(password, buffer.subarray(MAGIC.length, MAGIC.length + 16));
  let payload: Buffer;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      secret,
      buffer.subarray(MAGIC.length + 16, headerSize),
    );
    decipher.setAAD(buffer.subarray(0, headerSize));
    decipher.setAuthTag(buffer.subarray(headerSize, headerSize + 16));
    payload = Buffer.concat([decipher.update(buffer.subarray(headerSize + 16)), decipher.final()]);
  } catch {
    throw rejected();
  } finally {
    secret.fill(0);
  }
  try {
    const length = payload.readUInt32BE(0);
    if (length > 1024 * 1024 || length + 4 >= payload.length) throw rejected();
    const manifest = manifestSchema.parse(
        JSON.parse(payload.subarray(4, 4 + length).toString('utf8')),
      ),
      dump = payload.subarray(4 + length);
    if (sha256(dump) !== manifest.dumpSha256) throw rejected();
    const tar = await unpackDump(dump);
    return { manifest, tar };
  } catch {
    throw rejected();
  }
}
export async function unpackDump(dump: Uint8Array) {
  try {
    const tar = await gunzip(dump, { maxOutputLength: MAX_TAR_BYTES });
    validateTar(tar);
    return tar;
  } catch {
    throw rejected();
  }
}
export function validateTar(tar: Uint8Array) {
  if (tar.length > MAX_TAR_BYTES || tar.length % 512 !== 0) throw rejected();
  const roots = new Set([
    'pg_wal',
    'global',
    'pg_commit_ts',
    'pg_dynshmem',
    'pg_notify',
    'pg_serial',
    'pg_snapshots',
    'pg_subtrans',
    'pg_twophase',
    'pg_multixact',
    'base',
    'pg_replslot',
    'pg_tblspc',
    'pg_stat',
    'pg_stat_tmp',
    'pg_xact',
    'pg_logical',
    'PG_VERSION',
    'postgresql.conf',
    'postgresql.auto.conf',
    'pg_hba.conf',
    'pg_ident.conf',
    'postmaster.opts',
    'postmaster.pid',
  ]);
  const buffer = Buffer.from(tar);
  let at = 0,
    version = false,
    files = 0;
  while (at + 512 <= buffer.length) {
    const h = buffer.subarray(at, at + 512);
    if (h.every((v) => v === 0)) {
      if (!buffer.subarray(at).every((v) => v === 0)) throw rejected();
      break;
    }
    const text = (start: number, size: number) =>
      h
        .subarray(start, start + size)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const rawSize = text(124, 12).trim();
    if (!/^[0-7]+$/.test(rawSize)) throw rejected();
    const size = parseInt(rawSize, 8);
    const rawSum = text(148, 8).trim();
    if (!/^[0-7]+$/.test(rawSum)) throw rejected();
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== parseInt(rawSum, 8)) throw rejected();
    const prefix = text(345, 155),
      name = (prefix ? prefix + '/' : '') + text(0, 100),
      parts = name.replace(/^\//, '').replace(/\/$/, '').split('/');
    if (
      !name ||
      name.includes('\\') ||
      name.includes(':') ||
      parts.some((p) => !p || p === '.' || p === '..')
    )
      throw rejected();
    if (!roots.has(parts[0])) throw rejected();
    const type = h[156];
    if (
      ![0, 48, 53].includes(type) ||
      (type === 53 && size !== 0) ||
      at + 512 + size > buffer.length
    )
      throw rejected();
    if (parts.length === 1 && parts[0] === 'PG_VERSION' && type !== 53) version = true;
    files++;
    at += 512 + Math.ceil(size / 512) * 512;
  }
  if (!files || !version) throw rejected();
}
