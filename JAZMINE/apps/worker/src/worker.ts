import type { Database } from '../../server/src/database';
import { DocumentProcessor } from '../../server/src/documents/document-processor';
import { renderStoredPdf, type PdfRenderer } from '../../server/src/documents/pdf-renderer';
import { ArchiveAutomationService } from '../../server/src/orders/archive-automation-service';

export async function processEvents(db: Database): Promise<number> {
  return db.transaction(async (sql) => {
    const events = await sql.query(
      "SELECT id FROM outbox_events WHERE processed_at IS NULL AND type IN ('UserCreated','UserAuthorityChanged') ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    );
    for (const event of events) {
      await sql.query('INSERT INTO worker_receipts(event_id) VALUES($1) ON CONFLICT DO NOTHING', [
        event.id,
      ]);
      await sql.query('UPDATE outbox_events SET processed_at=now() WHERE id=$1', [event.id]);
    }
    return events.length;
  });
}
export function startWorker(
  db: Database,
  origin = process.env.WEB_ORIGIN || 'http://localhost:5173',
  renderer: PdfRenderer = renderStoredPdf,
): () => Promise<void> {
  const documents = new DocumentProcessor(db, origin, renderer);
  const archive = new ArchiveAutomationService(db);
  let nextArchiveAt = 0;
  let running: Promise<unknown> | null = null;
  const timer = setInterval(() => {
    if (running) return;
    running = processEvents(db)
      .then(() => documents.processOne())
      .then(async () => {
        if (Date.now() >= nextArchiveAt) {
          nextArchiveAt = Date.now() + 60_000;
          await archive.processBatch();
        }
      })
      .catch(() => console.error('งานเบื้องหลังยังไม่สำเร็จ จะลองใหม่'))
      .finally(() => {
        running = null;
      });
  }, 3_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
