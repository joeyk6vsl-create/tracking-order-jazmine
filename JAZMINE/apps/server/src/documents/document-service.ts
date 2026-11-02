import { createHash } from 'node:crypto';
import type {
  DocumentKind,
  StoredDocument,
  documentRetrySchema,
} from '../../../../packages/contracts/src/documents';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type { DocumentSource } from '../../../../packages/contracts/src/documents';
import type { z } from 'zod';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { currentDocumentStatus } from './current-document-status';
import { statusCopy } from './status-copy';
export class DocumentService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  private async access(sql: Sql, actor: UserView, kind: DocumentKind, lock = false) {
    await this.auth.require(
      sql,
      actor,
      kind === 'PRODUCTION'
        ? actor.department === 'GRAPHIC' || actor.role === 'ADMIN_PROMAX'
          ? 'graphic.approve'
          : 'orders.manage'
        : kind === 'RECEIPT'
          ? 'payments.record'
          : 'orders.manage',
      lock,
    );
  }
  private async read(sql: Sql, kind: DocumentKind, id: string, version: number) {
    return (
      await sql.query(
        'SELECT j.*,f.id AS file_id,f.sha256,f.byte_length,f.page_count FROM document_jobs j LEFT JOIN document_files f ON f.job_id=j.id WHERE j.kind=$1 AND j.source_id=$2 AND j.source_version=$3',
        [kind, id, version],
      )
    )[0];
  }
  async status(
    actor: UserView,
    kind: DocumentKind,
    id: string,
    version: number,
  ): Promise<StoredDocument> {
    await this.access(this.db, actor, kind);
    const r = await this.read(this.db, kind, id, version);
    let notice = '';
    if (r) {
      const live =
        kind === 'RECEIPT'
          ? (await this.db.query('SELECT state AS value FROM payment_entries WHERE id=$1', [id]))[0]
          : kind === 'INVOICE'
            ? (
                await this.db.query(
                  "SELECT business_state||'/'||latest_revision AS value FROM orders WHERE id=$1",
                  [id],
                )
              )[0]
            : kind === 'PRODUCTION'
              ? (
                  await this.db.query(
                    "SELECT state||'/'||issued_version AS value FROM production_sheets WHERE id=$1",
                    [id],
                  )
                )[0]
              : (
                  await this.db.query(
                    'SELECT q.latest_revision::text AS value FROM quotations q JOIN quotation_revisions v ON v.quotation_id=q.id WHERE v.id=$1',
                    [id],
                  )
                )[0];
      if (
        live &&
        String(live.value) !==
          (kind === 'RECEIPT'
            ? 'ACTIVE'
            : kind === 'INVOICE'
              ? 'ACTIVE/' + version
              : kind === 'PRODUCTION'
                ? 'READY/' + version
                : String(version))
      )
        notice =
          'ບັນທຶກປັດຈຸບັນປ່ຽນແລ້ວ / Current record changed; this PDF preserves the original issued revision (' +
          String(live.value) +
          ')';
      const source = r.payload as DocumentSource;
      if (source.kind === 'INVOICE')
        for (const ref of source.paymentQrs ?? []) {
          const current = (
            await this.db.query(
              'SELECT version,enabled FROM payment_qr_settings WHERE currency=$1',
              [ref.currency],
            )
          )[0];
          if (!current?.enabled || Number(current.version) !== ref.version)
            notice +=
              (notice ? ' · ' : '') +
              'ຂໍ້ມູນຮັບເງິນ ' +
              ref.currency +
              ' ປ່ຽນແລ້ວ / Payment details changed; check current shop QR before paying. This is the original file.';
        }
    }
    return {
      id: r ? String(r.id) : null,
      state: r ? (r.state as StoredDocument['state']) : 'NOT_PREPARED',
      number: r ? String(r.number) : '',
      version,
      attempts: r ? Number(r.attempts) : 0,
      error: r?.last_error ? String(r.last_error) : null,
      sha256: r?.sha256 ? String(r.sha256) : null,
      pageCount: r?.page_count ? Number(r.page_count) : null,
      byteLength: r?.byte_length ? Number(r.byte_length) : null,
      renderedAt: r?.rendered_at ? new Date(r.rendered_at as string).toISOString() : null,
      templateVersion: r ? String(r.template_version) : 'archive-v1',
      language: 'lo-en',
      notice,
    };
  }
  async file(actor: UserView, kind: DocumentKind, id: string, version: number) {
    await this.access(this.db, actor, kind);
    return this.storedFile(this.db, kind, id, version);
  }
  async currentStatus(actor: UserView, kind: DocumentKind, id: string, version: number) {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.access(sql, actor, kind);
      return currentDocumentStatus(sql, kind, id, version);
    });
  }
  async currentCopy(actor: UserView, kind: DocumentKind, id: string, version: number) {
    const source = await this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.access(sql, actor, kind);
      return {
        file: await this.storedFile(sql, kind, id, version),
        status: await currentDocumentStatus(sql, kind, id, version),
      };
    });
    const bytes = Buffer.from(await statusCopy(source.file.bytes, source.status));
    return {
      bytes,
      filename: source.file.filename.replace(/\.pdf$/, '-current-status-copy.pdf'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      checkedAt: source.status.checkedAt,
    };
  }
  private async storedFile(sql: Sql, kind: DocumentKind, id: string, version: number) {
    const r = (
      await sql.query(
        "SELECT j.number,f.file_data,f.sha256,f.page_count FROM document_jobs j JOIN document_files f ON f.job_id=j.id WHERE j.kind=$1 AND j.source_id=$2 AND j.source_version=$3 AND j.state='ISSUED'",
        [kind, id, version],
      )
    )[0];
    if (!r) throw new AppError('DOCUMENT_NOT_READY', 'ຍັງບໍ່ມີ PDF / Stored PDF is not ready', 409);
    const bytes = Buffer.from(r.file_data as Uint8Array);
    if (createHash('sha256').update(bytes).digest('hex') !== r.sha256)
      throw new AppError(
        'DOCUMENT_INTEGRITY',
        'ໄຟລ໌ຕ້ອງກວດສອບ / Stored file integrity check failed',
        409,
      );
    return {
      bytes,
      filename: `${String(r.number).replace(/[^A-Za-z0-9-]/g, '_')}-v${version}.pdf`,
      sha256: String(r.sha256),
    };
  }
  async retry(
    actor: UserView,
    kind: DocumentKind,
    id: string,
    version: number,
    input: z.infer<typeof documentRetrySchema>,
  ) {
    await this.db.transaction(async (sql) => {
      await this.access(sql, actor, kind, true);
      await sql.query('LOCK TABLE document_retry_commands IN SHARE ROW EXCLUSIVE MODE');
      const hash = createHash('sha256')
        .update(JSON.stringify({ actor: actor.id, kind, id, version, input }))
        .digest('hex');
      const row = (
        await sql.query(
          'SELECT * FROM document_jobs WHERE kind=$1 AND source_id=$2 AND source_version=$3 FOR UPDATE',
          [kind, id, version],
        )
      )[0];
      if (!row)
        throw new AppError(
          'DOCUMENT_NOT_READY',
          'ລໍຖ້າຈັດຄິວ / Waiting for document preparation',
          409,
        );
      const old = (
        await sql.query('SELECT * FROM document_retry_commands WHERE id=$1', [input.requestId])
      )[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'Request changed', 409);
        return;
      }
      if (row.state === 'FAILED') {
        await sql.query(
          "UPDATE document_jobs SET state='RENDER_PENDING',available_at=now(),max_attempts=attempts+5,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",
          [row.id],
        );
        await recordAudit(sql, actor.id, 'DOCUMENT_RETRY_REQUESTED', String(row.id), input.reason, {
          kind,
          sourceId: id,
          version,
        });
      }
      await sql.query(
        'INSERT INTO document_retry_commands(id,request_hash,job_id) VALUES($1,$2,$3)',
        [input.requestId, hash, row.id],
      );
    });
    return this.status(actor, kind, id, version);
  }
}
