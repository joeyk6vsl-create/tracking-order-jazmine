import { randomUUID, createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { PDFDocument } from 'pdf-lib';
import type { DocumentSource } from '../../../../packages/contracts/src/documents';
import { Database } from '../database';
import { backfillDocuments } from './queue-document';
import { pinnedAssets, renderStoredPdf, type PdfRenderer } from './pdf-renderer';
import { recordAudit } from '../shared/audit';
export class DocumentProcessor {
  private backfilled = false;
  constructor(
    private db: Database,
    private origin: string,
    private render: PdfRenderer = renderStoredPdf,
  ) {}
  async processOne() {
    if (!this.backfilled)
      this.backfilled = (await this.db.transaction((sql) => backfillDocuments(sql))) < 20;
    const token = randomUUID();
    const job = await this.db.transaction(async (sql) => {
      await sql.query(
        "UPDATE document_jobs SET state='FAILED',last_error='PDF_WORKER_INTERRUPTED',lease_token=NULL,lease_until=NULL WHERE state='PREPARING' AND lease_until<now() AND attempts>=max_attempts",
      );
      const row = (
        await sql.query(
          "SELECT * FROM document_jobs WHERE attempts<max_attempts AND ((state IN ('RENDER_PENDING','FAILED') AND available_at<=now()) OR (state='PREPARING' AND lease_until<now())) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
      )[0];
      if (!row) return null;
      return (
        await sql.query(
          "UPDATE document_jobs SET state='PREPARING',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '2 minutes',render_origin=COALESCE(render_origin,$3),last_error=NULL WHERE id=$1 RETURNING *",
          [row.id, token, this.origin],
        )
      )[0];
    });
    if (!job) return false;
    try {
      const source = job.payload as DocumentSource;
      if (job.template_version !== 'archive-v1') throw new Error('TEMPLATE_UNAVAILABLE');
      const bytes = Buffer.from(
        await this.render({
          source,
          origin: String(job.render_origin),
          assets: await pinnedAssets(this.db, source),
          templateVersion: 'archive-v1',
        }),
      );
      if (bytes.length > 64 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
        throw new Error('INVALID_RENDERED_FILE');
      const pdf = await PDFDocument.load(bytes),
        pages = pdf.getPageCount();
      if (pages < 1 || pages > 200) throw new Error('INVALID_PAGE_COUNT');
      const hash = createHash('sha256').update(bytes).digest('hex');
      await this.db.transaction(async (sql) => {
        const current = (
          await sql.query(
            "SELECT id FROM document_jobs WHERE id=$1 AND state='PREPARING' AND lease_token=$2 AND lease_until>now() FOR UPDATE",
            [job.id, token],
          )
        )[0];
        if (!current) return;
        await sql.query(
          'INSERT INTO document_files(id,job_id,file_data,sha256,byte_length,page_count) VALUES($1,$2,$3,$4,$5,$6)',
          [uuidv7(), job.id, bytes, hash, bytes.length, pages],
        );
        await sql.query(
          "UPDATE document_jobs SET state='ISSUED',rendered_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=$1",
          [job.id],
        );
        await recordAudit(sql, null, 'DOCUMENT_PDF_STORED', String(job.id), undefined, {
          kind: job.kind,
          sourceId: job.source_id,
          version: job.source_version,
          sha256: hash,
          pageCount: pages,
          templateVersion: job.template_version,
          renderedBy: 'system-worker',
        });
      });
    } catch {
      await this.db.query(
        "UPDATE document_jobs SET state='FAILED',last_error='PDF_PREPARATION_FAILED',available_at=now()+interval '15 seconds',lease_token=NULL,lease_until=NULL WHERE id=$1 AND state='PREPARING' AND lease_token=$2",
        [job.id, token],
      );
    }
    return true;
  }
}
