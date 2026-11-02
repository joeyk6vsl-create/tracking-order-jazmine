import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { RecoveryReport, BackupStatus } from '../../../../packages/contracts/src/backups';
import { MAX_BACKUP_BYTES, backupSchema } from '../../../../packages/contracts/src/backups';
import type { AppConfig } from '../config';
import { Database } from '../database';
import { AppError } from '../errors';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { inventory, runtimeVersion, migrationFiles } from './inventory';
import { encryptArchive, decryptArchive, unpackDump, sha256, type Manifest } from './archive';
import { RecoveryFiles } from './recovery-files';
export class BackupService {
  private auth = new ActorAuthorization();
  private busy = false;
  private files: RecoveryFiles;
  constructor(
    private db: Database,
    private config: AppConfig,
  ) {
    this.files = new RecoveryFiles(
      resolve(config.localRecoveryRoot ?? 'local-data/recovery'),
      process.cwd(),
      config.dataDir,
    );
  }
  private available() {
    return this.db.supportsLocalBackup && !this.config.production;
  }
  private async begin(actor: UserView) {
    await this.auth.require(this.db, actor, 'backups.manage');
    if (!this.available())
      throw new AppError(
        'LOCAL_BACKUP_ONLY',
        'ໃຊ້ໄດ້ໃນຮຸ່ນທົດລອງໃນເຄື່ອງ / Local database only',
        409,
      );
    if (this.busy)
      throw new AppError('BACKUP_BUSY', 'ກຳລັງສຳຮອງ/ກູ້ຄືນ ກະລຸນາລໍຖ້າ / Please wait', 409);
    this.busy = true;
  }
  async status(actor: UserView): Promise<BackupStatus> {
    await this.auth.require(this.db, actor, 'backups.manage');
    const rows = await this.db.query(
      "SELECT action,created_at,reason,detail FROM audit_events WHERE action IN ('BACKUP_CREATED','RECOVERY_COPY_VERIFIED') ORDER BY created_at DESC,id DESC LIMIT 20",
    );
    return {
      available: this.available(),
      maxFileBytes: MAX_BACKUP_BYTES,
      busy: this.busy,
      mode: this.db.supportsLocalBackup ? 'LOCAL' : 'EXTERNAL_DATABASE',
      history: rows.map((r) => ({
        action: String(r.action),
        at: new Date(r.created_at as string).toISOString(),
        reason: String(r.reason),
        detail: r.detail as BackupStatus['history'][number]['detail'],
      })),
    };
  }
  async create(actor: UserView, input: { password: string; reason: string }) {
    const valid = backupSchema.parse(input);
    await this.begin(actor);
    let snapshot: Database | undefined;
    try {
      const blob = await this.db.localSnapshot();
      if (blob.size > MAX_BACKUP_BYTES - 1024 * 1024)
        throw new AppError('BACKUP_TOO_LARGE', 'ຂໍ້ມູນເກີນຂອບເຂດຮຸ່ນນີ້ / Backup too large', 413);
      const createdAt = new Date().toISOString(),
        dump = new Uint8Array(await blob.arrayBuffer()),
        tar = await unpackDump(dump);
      snapshot = await Database.restoreSnapshot(tar);
      const tables = await inventory(snapshot),
        migrations = (await snapshot.query('SELECT name FROM schema_migrations ORDER BY name')).map(
          (r) => String(r.name),
        );
      const manifest: Manifest = {
        format: 'JAZMINE_LOCAL_V1',
        createdAt,
        runtime: await runtimeVersion(),
        postgres: String(
          (await snapshot.query("SELECT current_setting('server_version') AS version"))[0].version,
        ),
        dumpSha256: sha256(dump),
        migrations,
        tables,
      };
      await snapshot.close();
      snapshot = undefined;
      const label = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Vientiane',
        dateStyle: 'short',
        timeStyle: 'medium',
        hourCycle: 'h23',
      })
        .format(new Date(createdAt))
        .replaceAll(' ', '_')
        .replaceAll(':', '-');
      const bytes = await encryptArchive(dump, manifest, valid.password),
        filename = `JAZMINE_BACKUP_${label}_${randomUUID().slice(0, 8)}.jazbackup`;
      await this.db.transaction(async (sql) => {
        await this.auth.require(sql, actor, 'backups.manage', true);
        await recordAudit(sql, actor.id, 'BACKUP_CREATED', null, valid.reason, {
          filename,
          sha256: sha256(bytes),
          createdAt,
          tables: tables.length,
        });
      });
      return { bytes, filename };
    } finally {
      try {
        await snapshot?.close();
      } finally {
        this.busy = false;
      }
    }
  }
  async restore(
    actor: UserView,
    id: string,
    file: Uint8Array,
    input: { password: string; reason: string },
  ): Promise<RecoveryReport> {
    const valid = backupSchema.parse(input);
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new AppError('INVALID_INPUT', 'Invalid recovery id', 400);
    await this.begin(actor);
    let restored: Database | undefined,
      created = false,
      completed = false;
    try {
      const { manifest, tar } = await decryptArchive(file, valid.password),
        fileHash = sha256(file),
        runtime = await runtimeVersion(),
        known = await migrationFiles();
      if (manifest.runtime !== runtime || manifest.migrations.some((m) => !known.includes(m)))
        throw new AppError(
          'BACKUP_VERSION',
          'ຮຸ່ນໂປຣແກຣມບໍ່ກົງກັບໄຟລ໌ / Use the matching JAZMINE version',
          409,
        );
      const previous = await this.files.previous(id);
      if (previous) {
        if (
          previous.id !== id ||
          previous.operatorId !== actor.id ||
          previous.archiveSha256 !== fileHash ||
          previous.reason !== valid.reason
        )
          throw new AppError(
            'REQUEST_CONFLICT',
            'ຄຳຂໍກູ້ຄືນເກົ່າຕ່າງກັນ / Recovery request changed',
            409,
          );
        await this.auth.require(this.db, actor, 'backups.manage');
        return previous;
      }
      const folder = await this.files.create(id);
      created = true;
      restored = await Database.restoreSnapshot(tar, join(folder, 'postgres'));
      const verified = await inventory(restored),
        storedMigrations = (
          await restored.query('SELECT name FROM schema_migrations ORDER BY name')
        ).map((r) => String(r.name));
      if (
        JSON.stringify(verified) !== JSON.stringify(manifest.tables) ||
        JSON.stringify(storedMigrations) !== JSON.stringify(manifest.migrations)
      )
        throw new AppError(
          'BACKUP_MISMATCH',
          'ຂໍ້ມູນກູ້ຄືນບໍ່ກົງ / Restored data does not match',
          400,
        );
      await restored.migrate();
      if (
        !(
          await restored.query(
            "SELECT u.id FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.role='ADMIN_PROMAX' AND u.status='ACTIVE' LIMIT 1",
          )
        ).length
      )
        throw new AppError(
          'NO_RECOVERY_OWNER',
          'ບໍ່ພົບບັນຊີເຈົ້າຂອງ / No active owner in backup',
          400,
        );
      const sessions = Number(
          (
            await restored.query(
              'SELECT (SELECT count(*) FROM auth_sessions)+(SELECT count(*) FROM tracking_sessions) AS n',
            )
          )[0].n,
        ),
        links = Number(
          (
            await restored.query(
              'SELECT count(*) AS n FROM tracking_links WHERE revoked_at IS NULL',
            )
          )[0].n,
        );
      await restored.transaction(async (sql) => {
        await sql.query('DELETE FROM auth_sessions');
        await sql.query('DELETE FROM tracking_sessions');
        await sql.query('DELETE FROM login_throttle');
        await sql.query('DELETE FROM tracking_attempts');
        await sql.query('UPDATE tracking_links SET revoked_at=now() WHERE revoked_at IS NULL');
        await recordAudit(sql, null, 'DATABASE_RECOVERED', null, valid.reason, {
          operatorName: actor.displayName,
          backupCreatedAt: manifest.createdAt,
          archiveSha256: fileHash,
          invalidatedSessions: sessions,
          revokedLinks: links,
        });
      });
      const applied = (await restored.query('SELECT name FROM schema_migrations ORDER BY name'))
        .map((r) => String(r.name))
        .filter((n) => !manifest.migrations.includes(n));
      await restored.close();
      restored = undefined;
      const report: RecoveryReport = {
        id,
        createdAt: new Date().toISOString(),
        backupCreatedAt: manifest.createdAt,
        archiveSha256: fileHash,
        operatorId: actor.id,
        reason: valid.reason,
        folder,
        verifiedTables: verified,
        invalidatedSessions: sessions,
        revokedLinks: links,
        appliedMigrations: applied,
        state: 'VERIFIED_COPY',
      };
      await this.db.transaction(async (sql) => {
        await this.auth.require(sql, actor, 'backups.manage', true);
        await recordAudit(sql, actor.id, 'RECOVERY_COPY_VERIFIED', id, valid.reason, {
          recoveryId: id,
          sha256: fileHash,
          tables: verified.length,
        });
      });
      await this.files.complete(report);
      completed = true;
      return report;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        'RECOVERY_FAILED',
        'ກວດສຳເນົາບໍ່ສຳເລັດ ຂໍ້ມູນເດີມບໍ່ຖືກທັບ / Recovery failed; current data unchanged',
        400,
      );
    } finally {
      try {
        await restored?.close();
        if (created && !completed) await this.files.removeFailed(id);
      } finally {
        this.busy = false;
      }
    }
  }
  async recovery(actor: UserView, id: string) {
    await this.auth.require(this.db, actor, 'backups.manage');
    if (!this.available()) throw new AppError('LOCAL_BACKUP_ONLY', 'Local database only', 409);
    const report = await this.files.previous(id);
    if (!report) throw new AppError('NOT_FOUND', 'ບໍ່ພົບສຳເນົາ / No verified copy', 404);
    return report;
  }
}
