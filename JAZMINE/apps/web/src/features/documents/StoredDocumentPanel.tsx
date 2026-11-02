import { useEffect, useState } from 'react';
import type { DocumentKind, StoredDocument } from '../../../../../packages/contracts/src/documents';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import './stored-documents.css';
import { CurrentDocumentBanner, useCurrentDocumentStatus } from './CurrentDocumentStatus';
export function StoredDocumentPanel({
  kind,
  sourceId,
  version,
}: {
  kind: DocumentKind;
  sourceId: string;
  version: number;
}) {
  const [result, setResult] = useState<StoredDocument | null>(null),
    [error, setError] = useState(''),
    [reason, setReason] = useState(''),
    [tick, setTick] = useState(0),
    [frozen, setFrozen] = useState(false);
  const current = useCurrentDocumentStatus(kind, sourceId, version, tick);
  const path = `/documents/${kind}/${sourceId}/${version}`;
  const command = useRecordedCommand(() => setTick((t) => t + 1), setFrozen);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const next = await api<StoredDocument>(path);
        if (!alive) return;
        setResult(next);
        setError('');
        if (next.state !== 'ISSUED') timer = setTimeout(() => void load(), 5000);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path, tick]);
  const labels = {
    NOT_PREPARED: 'ລໍຖ້າຈັດຄິວ / Waiting for preparation',
    RENDER_PENDING: 'ລໍຖ້າສ້າງ PDF / PDF queued',
    PREPARING: 'ກຳລັງສ້າງ PDF / Preparing PDF',
    FAILED: 'ຍັງສ້າງບໍ່ສຳເລັດ / PDF preparation failed',
    ISSUED: 'ເກັບໄຟລ໌ແລ້ວ / Original PDF stored',
  };
  return (
    <section className="stored-document no-print" aria-label="Stored document">
      <h3>PDF ສະບັບທີ່ອອກ / Stored original PDF</h3>
      <CurrentDocumentBanner status={current.status} />
      {current.error && <p role="alert">{current.error}</p>}
      {(error || command.error) && <p role="alert">{error || command.error}</p>}
      {result ? (
        <>
          <p role="status">{labels[result.state]}</p>
          {result.notice && !current.status && <p className="alert warning">{result.notice}</p>}
          {result.state === 'ISSUED' ? (
            <>
              <p>
                {result.number} · v{result.version} · {result.pageCount} pages ·{' '}
                {result.renderedAt &&
                  new Date(result.renderedAt).toLocaleString('en-GB', {
                    timeZone: 'Asia/Vientiane',
                  })}
              </p>
              <a className="stored-document-download" href={'/api/v1' + path + '/file'} download>
                ດາວໂຫຼດໄຟລ໌ເດີມ / Download stored PDF
              </a>
              <p>
                <a
                  className="stored-document-download"
                  href={'/api/v1' + path + '/current-copy'}
                  download
                >
                  ສຳເນົາພ້ອມສະຖານະປັດຈຸບັນ / Download current-status copy
                </a>
              </p>
              <p>
                ສຳເນົາກວດສະຖານະໃໝ່ເມື່ອດາວໂຫຼດ ໄຟລ໌ເດີມຍັງຄົງໄວ້ / The copy checks status at
                download time; the stored original remains available for history.
              </p>
              <p>
                ເປັນໄຟລ໌ເດີມ ບໍ່ຄຳນວນລາຄາໃໝ່ / Downloads the saved file; prices are not
                recalculated.
              </p>
              {kind === 'INVOICE' && (
                <p>
                  QR ຕິດຕາມທີ່ເລືອກຕອນພິມ ໃຊ້ຈາກ Print preview / Optional tracking QR is added
                  through print preview; this stored file contains the confirmed invoice.
                </p>
              )}
            </>
          ) : (
            <p>
              {result.state === 'FAILED'
                ? 'ຂໍ້ມູນໃບຖືກບັນທຶກແລ້ວ ກວດການສ້າງ PDF / Document data is saved; PDF preparation needs attention.'
                : 'ຂໍ້ມູນໃບຖືກບັນທຶກແລ້ວ ລໍຖ້າ PDF / Document data is saved; waiting for the PDF.'}
            </p>
          )}
          {result.state === 'FAILED' && (
            <>
              <label>
                ເຫດຜົນ / Retry reason
                <input
                  aria-label="Stored PDF retry reason"
                  maxLength={500}
                  disabled={command.busy || frozen}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                disabled={command.busy || frozen || !reason.trim()}
                onClick={() =>
                  void command.send(path + '/retry', { requestId: crypto.randomUUID(), reason })
                }
              >
                ລອງສ້າງໄຟລ໌ເດີມ / Retry PDF preparation
              </button>
            </>
          )}
        </>
      ) : (
        <p role="status">Loading PDF status…</p>
      )}
      {command.pending && (
        <button disabled={command.busy} onClick={command.retry}>
          Retry same PDF request
        </button>
      )}
      <button disabled={command.busy} onClick={() => setTick((t) => t + 1)}>
        Refresh PDF status
      </button>
    </section>
  );
}
