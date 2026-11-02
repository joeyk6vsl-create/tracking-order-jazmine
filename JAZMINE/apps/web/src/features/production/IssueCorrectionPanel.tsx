import { useEffect, useState } from 'react';
import type {
  CorrectionView,
  CorrectionRow,
  IssueCorrectionInput,
  IssueCorrectionResult,
} from '../../../../../packages/contracts/src/issue-corrections';
import { api, errorMessage } from '../../services/api';
import { useProductionCommand } from './useProductionCommand';
import './issue-corrections.css';
type Actions = { disabled: boolean; onChanged: () => void; onFreeze: (frozen: boolean) => void };
const fields = [
  ['usableQty', 'ໃຊ້ໄດ້ / Usable'],
  ['scrapQty', 'ເສຍ / Scrap'],
  ['releaseQty', 'ຍັງບໍ່ເຮັດ ປ່ອຍຄືນ / Release'],
  ['ignoredQty', 'ນັບຊ້ຳ/ບໍ່ນັບ / Dismiss'],
] as const;
const empty = (lineIndex: number): CorrectionRow => ({
  lineIndex,
  usableQty: 0,
  scrapQty: 0,
  releaseQty: 0,
  ignoredQty: 0,
});
const sorted = (rows: { lineIndex: number; quantity: number }[]) =>
  [...rows].sort((a, b) => a.lineIndex - b.lineIndex);
function CorrectionForm({
  view,
  reload,
  ...actions
}: Actions & { view: CorrectionView; reload: () => void }) {
  const [rows, setRows] = useState<CorrectionRow[]>(() =>
      view.lines.map(
        (l) => view.currentRows.find((r) => r.lineIndex === l.lineIndex) ?? empty(l.lineIndex),
      ),
    ),
    [reason, setReason] = useState(''),
    [verified, setVerified] = useState(false),
    [counts, setCounts] = useState<Record<string, Record<number, number>>>(() =>
      Object.fromEntries(
        view.replacements.map((r) => [
          r.id,
          Object.fromEntries(r.allocations.map((a) => [a.lineIndex, a.quantity])),
        ]),
      ),
    );
  const command = useProductionCommand<IssueCorrectionResult>(() => {}, actions.onFreeze);
  const busy = actions.disabled || command.busy || !!command.pending;
  const edits = view.replacements
    .filter((s) => s.editable)
    .flatMap((s) => {
      const allocations = view.lines.flatMap((l) =>
        (counts[s.id]?.[l.lineIndex] ?? 0) > 0
          ? [{ lineIndex: l.lineIndex, quantity: counts[s.id][l.lineIndex] }]
          : [],
      );
      return JSON.stringify(sorted(allocations)) !== JSON.stringify(sorted(s.allocations))
        ? [{ sheetId: s.id, rowVersion: s.rowVersion, allocations }]
        : [];
    });
  return (
    <form
      aria-label="Correct resolved issue quantities"
      onSubmit={(e) => {
        e.preventDefault();
        const input: IssueCorrectionInput = {
          requestId: crypto.randomUUID(),
          rowVersion: view.rowVersion,
          sheetRowVersion: view.sheetRowVersion,
          checkToken: view.checkToken,
          reason,
          verifiedStock: true,
          rows,
          replacementEdits: edits,
        };
        void command.send(
          `/production-exceptions/issues/${view.issueId}/corrections`,
          input,
          () => {
            actions.onChanged();
            reload();
          },
        );
      }}
    >
      <fieldset disabled={busy}>
        <p>
          ກວດຈຳນວນຈິງກ່ອນຢືນຢັນ / Check physical quantities before saving. Original report and
          earlier resolutions remain in history.
        </p>
        {view.lines.map((line, index) => {
          const current = rows[index],
            before =
              view.currentRows.find((r) => r.lineIndex === line.lineIndex) ?? empty(line.lineIndex),
            net = line.allocated - line.otherLoss - current.scrapQty - current.releaseQty;
          return (
            <div className="correction-line" key={line.lineIndex}>
              <h4>
                Size {line.size} · Line {line.lineIndex + 1}
              </h4>
              <p>
                ລາຍງານເດີມ / Reported {line.reported} · Allocated {line.allocated} · Shipped{' '}
                {line.shipped} · Continued {line.carried}
              </p>
              <p>
                ກ່ອນແກ້ / Before: Usable {before.usableQty} · Scrap {before.scrapQty} · Release{' '}
                {before.releaseQty} · Dismiss {before.ignoredQty}
              </p>
              <div className="correction-grid">
                {fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`Correction ${key} line ${line.lineIndex + 1}`}
                      type="number"
                      min={0}
                      max={key === 'ignoredQty' ? 300000 : line.reviewLimit}
                      required
                      value={current[key]}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r, i) =>
                            i === index ? { ...r, [key]: Number(e.target.value) } : r,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <p>
                ຫຼັງແກ້ / After review:{' '}
                {current.usableQty + current.scrapQty + current.releaseQty + current.ignoredQty} ·
                ຈຳນວນສຸດທິໃນໃບ / Net in sheet: <b>{net}</b> (includes shipped/continued goods)
              </p>
              <p>
                ວຽກທົດແທນທີ່ຜູກໄວ້ / Committed replacement:{' '}
                {view.replacementUsage.find((r) => r.lineIndex === line.lineIndex)?.quantity ?? 0}
              </p>
            </div>
          );
        })}
        {!!view.replacements.length && <h4>ວຽກທົດແທນ / Replacement work</h4>}
        {view.replacements.map((child) => (
          <div className="correction-line" key={child.id}>
            <b>
              {child.number} · {child.id.slice(-8)} · {child.state}
            </b>
            {child.editable ? (
              <>
                <p>
                  ແກ້ຮ່າງພ້ອມກັນໄດ້ ໃສ່ 0 ທຸກລາຍການເພື່ອປິດຮ່າງ / Unissued draft: resize here, or
                  set all quantities to zero to cancel.
                </p>
                <div className="correction-grid">
                  {view.lines.map((line) => (
                    <label key={line.lineIndex}>
                      Size {line.size}
                      <input
                        aria-label={`Correct replacement ${child.id} line ${line.lineIndex + 1}`}
                        type="number"
                        min={0}
                        max={300000}
                        value={counts[child.id]?.[line.lineIndex] ?? 0}
                        onChange={(e) =>
                          setCounts((all) => ({
                            ...all,
                            [child.id]: {
                              ...all[child.id],
                              [line.lineIndex]: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p>
                ວຽກນີ້ແກ້ຈຳນວນໃນຟອມນີ້ບໍ່ໄດ້ / Review issued, cancelled or continued work
                separately.
              </p>
            )}
            <a href={`?prepareSheet=${child.id}`} target="_blank" rel="noreferrer">
              ກວດໃບຜະລິດ / Review sheet
            </a>
          </div>
        ))}
        {!!edits.length && (
          <p className="alert warning">
            ຈະແກ້ Draft ທົດແທນ / Replacement draft changes:{' '}
            {edits
              .map(
                (e) =>
                  `${e.sheetId.slice(-8)}: ${e.allocations.reduce((n, a) => n + a.quantity, 0)} pcs`,
              )
              .join(' · ')}
            . No replacement is created automatically.
          </p>
        )}
        <label className="correction-check">
          <input
            type="checkbox"
            aria-label="Verified corrected physical stock"
            checked={verified}
            required
            onChange={(e) => setVerified(e.target.checked)}
          />
          ກວດຊິ້ນງານ ຈຳນວນຈິງ ວຽກທົດແທນ ແລະ ຈຳນວນສົ່ງແລ້ວ / I checked physical stock, replacement
          work and shipped/continued quantities
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Issue correction reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!reason.trim() || !verified}>
          ບັນທຶກແກ້ຈຳນວນ / Save quantity correction
        </button>
      </fieldset>
      {command.error && (
        <p className="alert error" role="alert">
          {command.error}
        </p>
      )}
      {command.busy && <p role="status">ກຳລັງບັນທຶກ / Saving…</p>}
      {command.pending && (
        <button type="button" disabled={command.busy} onClick={() => void command.retry()}>
          ກວດຄຳຂໍເດີມ / Retry quantity correction
        </button>
      )}
      {command.error && !command.pending && (
        <button type="button" disabled={command.busy} onClick={reload}>
          ເປີດຂໍ້ມູນລ່າສຸດ / Reload correction
        </button>
      )}
    </form>
  );
}
export function IssueCorrectionPanel({
  issueId,
  rowVersion,
  ...actions
}: Actions & { issueId: string; rowVersion: number }) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<CorrectionView | null>(null),
    [tick, setTick] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void api<CorrectionView>(`/production-exceptions/issues/${issueId}/correction`)
      .then((v) => {
        if (active) {
          setView(v);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [issueId, rowVersion, open, tick]);
  return (
    <div className="issue-correction">
      <button type="button" disabled={actions.disabled} onClick={() => setOpen((v) => !v)}>
        ແກ້ຈຳນວນທີ່ປິດແລ້ວ / Correct recorded quantities
      </button>
      {open && (
        <>
          <h3>ແກ້ຈຳນວນ ແລະ ເກັບປະຫວັດ / Correct quantities with history</h3>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          {loading && <p role="status">Loading…</p>}
          {view && (
            <CorrectionForm
              key={view.checkToken}
              view={view}
              {...actions}
              disabled={actions.disabled || loading}
              reload={() => setTick((t) => t + 1)}
            />
          )}
        </>
      )}
    </div>
  );
}
