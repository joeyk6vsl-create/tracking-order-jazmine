import { useEffect, useState } from 'react';
import type {
  QuotationSummary,
  QuotationView,
} from '../../../../../packages/contracts/src/quotations';
import { api, errorMessage } from '../../services/api';
import { QuotationDocument } from './QuotationDocument';
import { QuotationHistory } from './QuotationHistory';
export function QuotationsPage() {
  const [selected, setSelected] = useState(
      () => new URLSearchParams(location.search).get('quotation') ?? '',
    ),
    [document, setDocument] = useState<QuotationView | null>(null),
    [detailError, setDetailError] = useState(''),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [result, setResult] = useState<{ quotations: QuotationSummary[]; hasMore: boolean } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    void api<{ quotations: QuotationSummary[]; hasMore: boolean }>(
      `/quotations?search=${encodeURIComponent(query)}&page=${page}`,
    )
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
  }, [query, page]);
  useEffect(() => {
    let alive = true;
    setDocument(null);
    setDetailError('');
    if (selected)
      void api<QuotationView>('/quotations/revisions/' + encodeURIComponent(selected))
        .then((r) => {
          if (alive) setDocument(r);
        })
        .catch((e) => {
          if (alive) setDetailError(errorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [selected]);
  function open(id: string) {
    history.replaceState(null, '', '?quotation=' + id);
    setSelected(id);
  }
  return (
    <div className="quotations-page">
      <h1>ໃບສະເໜີລາຄາ / Quotations</h1>
      <section className="panel no-print">
        <p>ອອກໃບໃໝ່ໄດ້ຈາກເມນູຮ່າງອໍເດີ / Create from a saved order draft.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <label>
            Search number, name or phone
            <input
              aria-label="Quotation search"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button disabled={busy}>Search quotations</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Loading…</p>}
        {result && !busy && (
          <>
            <ul>
              {result.quotations.map((r) => (
                <li key={r.id}>
                  <button onClick={() => open(r.id)}>
                    {r.number} · Rev {r.revision} · {r.customerName}
                  </button>
                </li>
              ))}
            </ul>
            {!result.quotations.length && <p>No issued quotations</p>}
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous quotations
            </button>
            <span> {page} </span>
            <button disabled={!result.hasMore} onClick={() => setPage((p) => p + 1)}>
              Next quotations
            </button>
          </>
        )}
      </section>
      {detailError && <p role="alert">{detailError}</p>}
      {selected && !document && !detailError && <p role="status">Loading document…</p>}
      {document && (
        <>
          <section className="panel no-print">
            <p>
              {document.revision === document.latestRevision
                ? 'Latest issued quotation'
                : 'Superseded quotation'}{' '}
              · Draft v{document.draftVersion} (saved draft now v{document.currentDraftVersion})
            </p>
            {document.draftVersion !== document.currentDraftVersion && (
              <p className="alert warning">
                ຮ່າງປ່ຽນແລ້ວ ໃບນີ້ເກັບລາຄາເກົ່າ / The draft changed; this document keeps its issued
                prices.
              </p>
            )}
            <p>
              Issued by {document.actorName} ·{' '}
              {new Date(document.issuedAt).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })}{' '}
              · {document.reason}
            </p>
            <QuotationHistory key={document.id} draftId={document.draftId} />
          </section>
          <QuotationDocument key={document.id} document={document} />
        </>
      )}
    </div>
  );
}
