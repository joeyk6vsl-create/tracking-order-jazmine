import { useState } from 'react';
import type { SearchView } from '../../../../../packages/contracts/src/search';
import { api, errorMessage } from '../../services/api';
import './search.css';
export function SearchPage() {
  const [query, setQuery] = useState(''),
    [applied, setApplied] = useState(''),
    [result, setResult] = useState<SearchView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  async function run(q: string, cursor?: string) {
    setBusy(true);
    setError('');
    try {
      setResult(
        await api<SearchView>(
          `/search?q=${encodeURIComponent(q)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        ),
      );
      setApplied(q);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel pricing-panel">
      <h1>ຄົ້ນຫາ / Search</h1>
      <p>ຄົ້ນຫາຈາກຕົ້ນຊື່ ເບີໂທ ຫຼື ເລກເອກະສານ · ສະແດງຕາມສິດຂອງທ່ານ</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setCursors([undefined]);
          void run(query.trim());
        }}
      >
        <label>
          ຄຳຄົ້ນ / Query
          <input
            aria-label="Global search query"
            required
            minLength={2}
            maxLength={100}
            disabled={busy}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy || query.trim().length < 2}>
          ຄົ້ນຫາ / Search all
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading…</p>}
      {result && !result.results.length && <p>No matching results</p>}
      <ul className="search-results">
        {result?.results.map((r) => (
          <li key={r.kind + ':' + r.id}>
            <a href={r.href}>
              <span className="badge">{r.kind}</span> <strong>{r.reference}</strong>
              <br />
              {r.label}
            </a>
          </li>
        ))}
      </ul>
      {result && (
        <div>
          <button
            disabled={busy || cursors.length <= 1}
            onClick={() => {
              const next = cursors.slice(0, -1);
              setCursors(next);
              void run(applied, next.at(-1));
            }}
          >
            Previous results
          </button>
          <span> {cursors.length} </span>
          <button
            disabled={busy || !result.nextCursor}
            onClick={() => {
              if (result.nextCursor) {
                setCursors((c) => [...c, result.nextCursor!]);
                void run(applied, result.nextCursor);
              }
            }}
          >
            Next results
          </button>
        </div>
      )}
    </section>
  );
}
