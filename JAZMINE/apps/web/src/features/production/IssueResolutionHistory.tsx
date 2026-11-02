import type { ResolutionHistory } from '../../../../../packages/contracts/src/issue-corrections';
export function IssueResolutionHistory({ history }: { history: ResolutionHistory[] }) {
  if (!history.length) return null;
  return (
    <details className="issue-correction-history">
      <summary>ປະຫວັດຢືນຢັນ/ແກ້ຈຳນວນ / Resolution & correction history ({history.length})</summary>
      {history.map((entry) => (
        <article key={entry.issueVersion} className="correction-line">
          <b>
            {entry.kind === 'INITIAL'
              ? 'ຢືນຢັນຄັ້ງທຳອິດ / Initial resolution'
              : 'ແກ້ຈຳນວນ / Quantity correction'}
          </b>
          <p>
            {entry.actorName} ·{' '}
            {new Date(entry.at).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })} · Lao time
          </p>
          <p className="work-notes">{entry.reason}</p>
          {entry.rows.map((r) => (
            <p key={r.lineIndex}>
              Line {r.lineIndex + 1}: Usable {r.usableQty} · Scrap {r.scrapQty} · Release{' '}
              {r.releaseQty} · Dismiss {r.ignoredQty}
            </p>
          ))}
          {entry.replacementChanges.map((c) => (
            <p key={c.sheetId}>
              Replacement {c.sheetId.slice(-8)}:{' '}
              {c.before.allocations.reduce((n, a) => n + a.quantity, 0)} →{' '}
              {c.after.state === 'CANCELLED'
                ? 0
                : c.after.allocations.reduce((n, a) => n + a.quantity, 0)}{' '}
              · {c.after.state}
            </p>
          ))}
        </article>
      ))}
    </details>
  );
}
