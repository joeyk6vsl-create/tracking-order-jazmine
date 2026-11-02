import { useEffect, useState } from 'react';
import type { QuotationHistory as History } from '../../../../../packages/contracts/src/quotations';
import { api, errorMessage } from '../../services/api';
export function QuotationHistory({ draftId }: { draftId: string }) {
  const [page, setPage] = useState(1),
    [result, setResult] = useState<History | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    void api<History>(`/quotations/drafts/${draftId}?page=${page}`)
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [draftId, page]);
  return (
    <section className="quotation-history">
      <h3>ປະຫວັດ / Quotation history</h3>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading…</p>}
      {result && !busy && (
        <>
          {result.linkedOrderId && (
            <p>
              ຢືນຢັນອໍເດີແລ້ວ / Confirmed ·{' '}
              <a href={'?confirmedOrder=' + result.linkedOrderId}>Open invoice</a>
            </p>
          )}
          {!result.revisions.length && <p>No issued quotations</p>}
          <ul>
            {result.revisions.map((r) => (
              <li key={r.id}>
                <a target="_blank" rel="noreferrer" href={'?quotation=' + r.id}>
                  {r.number} · Rev {r.revision}
                </a>{' '}
                · {r.revision === r.latestRevision ? 'Latest issued' : 'Superseded'} · Draft v
                {r.draftVersion} · {r.total} LAK
                <br />
                {r.actorName} ·{' '}
                {new Date(r.issuedAt).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })} ·{' '}
                {r.reason}
              </li>
            ))}
          </ul>
          <button disabled={busy || page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous history
          </button>
          <span> {page} </span>
          <button disabled={busy || !result.hasMore} onClick={() => setPage((p) => p + 1)}>
            Next history
          </button>
        </>
      )}
    </section>
  );
}
