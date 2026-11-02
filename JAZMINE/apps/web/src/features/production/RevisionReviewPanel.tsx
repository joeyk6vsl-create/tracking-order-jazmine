import { useEffect, useState } from 'react';
import type {
  RevisionReviewView,
  RevisionReviewInput,
  RevisionReviewResult,
  RevisionSource,
} from '../../../../../packages/contracts/src/production-revisions';
import {
  WORK_STAGE_LABELS,
  WORK_STATE_LABELS,
} from '../../../../../packages/contracts/src/production-work';
import { api, errorMessage } from '../../services/api';
import { useProductionCommand } from './useProductionCommand';
import './revision-review.css';
import { RevisionReversalPanel } from './RevisionReversalPanel';
type Choice = { quantity: number; targetLineIndex: number };
function SourceChoices({
  source,
  choices,
  names,
  disabled,
  onChoice,
  onName,
}: {
  source: RevisionSource;
  choices: Record<string, Choice>;
  names: number[];
  disabled: boolean;
  onChoice: (line: number, value: Choice) => void;
  onName: (index: number, checked: boolean) => void;
}) {
  return (
    <article className="revision-source">
      <h3>
        {source.number} · Order v{source.orderRevision}
      </h3>
      <p>
        {source.stages
          .map((s) => `${WORK_STAGE_LABELS[s.department]}: ${WORK_STATE_LABELS[s.state]}`)
          .join(' · ')}
      </p>
      {source.blockers.map((b) => (
        <p className="alert warning" key={b}>
          {b}
        </p>
      ))}
      <a href={`?productionWork=${source.id}`}>ກວດວຽກ/ປັນຫາເກົ່າ / Open source work</a>
      {source.lines.map((line) => {
        const c = choices[`${source.id}:${line.sourceLineIndex}`] ?? {
          quantity: 0,
          targetLineIndex: line.targets[0]?.lineIndex ?? -1,
        };
        return (
          <div className="revision-line" key={line.sourceLineIndex}>
            <p>
              <b>Size {line.size}</b> · Allocated {line.allocated} · Scrap {line.scrap} · Released{' '}
              {line.released} · Shipped {line.shipped} · ເຫຼືອ / Remaining {line.reusable}
            </p>
            <label>
              ໃຊ້ກັບລາຍການ / Target line
              <select
                aria-label={`Reuse target ${source.id} ${line.sourceLineIndex}`}
                disabled={disabled || !!source.blockers.length || !line.targets.length}
                value={c.targetLineIndex}
                onChange={(e) =>
                  onChoice(line.sourceLineIndex, { ...c, targetLineIndex: Number(e.target.value) })
                }
              >
                <option value={-1}>ບໍ່ໃຊ້ຕໍ່ / Not reused</option>
                {line.targets.map((t) => (
                  <option key={t.lineIndex} value={t.lineIndex}>
                    #{t.lineIndex + 1} · Size {t.size}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ຈຳນວນໃຊ້ຕໍ່ / Reuse quantity
              <input
                aria-label={`Reuse quantity ${source.id} ${line.sourceLineIndex}`}
                type="number"
                min={0}
                max={line.reusable}
                value={c.quantity}
                disabled={disabled || !!source.blockers.length || !line.targets.length}
                onChange={(e) =>
                  onChoice(line.sourceLineIndex, { ...c, quantity: Number(e.target.value) })
                }
              />
            </label>
            <p>ບໍ່ໃຊ້ກັບສະບັບນີ້ / Not reused: {line.reusable - c.quantity}</p>
            {!line.targets.length && (
              <p className="alert warning">
                ແບບ/ຜ້າ/Size ບໍ່ກົງ / No matching target; prepare new production
              </p>
            )}
          </div>
        );
      })}
      {!!source.names.length && (
        <details>
          <summary>ເລືອກຊື່/ເບີທີ່ໃຊ້ຕໍ່ / Retained names & numbers</summary>
          {source.names.map((n) => (
            <label className="revision-check" key={n.index}>
              <input
                type="checkbox"
                checked={names.includes(n.index)}
                disabled={disabled}
                onChange={(e) => onName(n.index, e.target.checked)}
              />
              #{n.sourceLineIndex + 1} · {n.name} · {n.number}
            </label>
          ))}
        </details>
      )}
    </article>
  );
}
function ReviewForm({
  view,
  onChanged,
  onApplied,
}: {
  view: RevisionReviewView;
  onChanged: () => void;
  onApplied: () => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({}),
    [names, setNames] = useState<Record<string, number[]>>({}),
    [reason, setReason] = useState(''),
    [files, setFiles] = useState(false),
    [remainder, setRemainder] = useState(false),
    [frozen, setFrozen] = useState(false);
  const command = useProductionCommand<RevisionReviewResult>(() => {}, setFrozen);
  const disabled = frozen || command.busy;
  const decisions = view.sources.map((s) => ({
    sheetId: s.id,
    nameIndexes: names[s.id] ?? [],
    rows: s.lines.flatMap((l) => {
      const c = choices[`${s.id}:${l.sourceLineIndex}`];
      return c && c.quantity > 0
        ? [
            {
              sourceLineIndex: l.sourceLineIndex,
              targetLineIndex: c.targetLineIndex,
              quantity: c.quantity,
            },
          ]
        : [];
    }),
  }));
  const reused = decisions.reduce((n, d) => n + d.rows.reduce((sum, r) => sum + r.quantity, 0), 0),
    available = view.sources.reduce(
      (n, s) => n + s.lines.reduce((sum, l) => sum + l.reusable, 0),
      0,
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const input: RevisionReviewInput = {
          requestId: crypto.randomUUID(),
          orderRevision: view.context.revision,
          checkToken: view.checkToken,
          reason,
          reviewedFiles: true,
          reviewedRemainder: true,
          decisions,
        };
        void command.send(`/production-revisions/orders/${view.context.orderId}`, input, () => {
          onChanged();
          void onApplied();
        });
      }}
    >
      <fieldset disabled={disabled}>
        {view.sources.map((s) => (
          <SourceChoices
            key={s.id}
            source={s}
            choices={choices}
            names={names[s.id] ?? []}
            disabled={disabled}
            onChoice={(line, value) => setChoices((c) => ({ ...c, [`${s.id}:${line}`]: value }))}
            onName={(index, checked) =>
              setNames((all) => ({
                ...all,
                [s.id]: checked
                  ? [...(all[s.id] ?? []), index]
                  : (all[s.id] ?? []).filter((n) => n !== index),
              }))
            }
          />
        ))}
        <p className="alert warning">
          ໃຊ້ຕໍ່ / Reused: <b>{reused}</b> · ບໍ່ໃຊ້ກັບສະບັບນີ້ / Not reused:{' '}
          <b>{available - reused}</b> · ໃບເກົ່າຈະປິດ ແລະ ເກັບປະຫວັດ / Old sheets close and remain in
          history
        </p>
        <label className="revision-check">
          <input
            aria-label="Review unchanged files"
            type="checkbox"
            required
            checked={files}
            onChange={(e) => setFiles(e.target.checked)}
          />
          ກວດແບບ ໄຟລ໌ ຊື່/ເບີ ແລະ ວຽກທີ່ເຮັດແລ້ວ / I checked artwork, retained names and completed
          work
        </label>
        <label className="revision-check">
          <input
            aria-label="Review unused quantities"
            type="checkbox"
            required
            checked={remainder}
            onChange={(e) => setRemainder(e.target.checked)}
          />
          ກວດຈຳນວນໃຊ້ຕໍ່/ບໍ່ໃຊ້ຕໍ່ແລ້ວ / I checked reused and unused quantities
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Revision review reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!reason.trim() || !files || !remainder}>
          ຢືນຢັນແຜນໃຊ້ງານຕໍ່ / Confirm production review
        </button>
      </fieldset>
      {command.error && (
        <p className="alert error" role="alert">
          {command.error}
        </p>
      )}
      {command.error && !command.pending && (
        <button type="button" disabled={command.busy} onClick={onChanged}>
          ເປີດຂໍ້ມູນລ່າສຸດ / Reload review
        </button>
      )}
      {command.busy && <p role="status">ກຳລັງບັນທຶກ / Saving…</p>}
      {command.pending && (
        <button type="button" disabled={command.busy} onClick={() => void command.retry()}>
          ກວດຄຳຂໍເດີມ / Retry production review
        </button>
      )}
    </form>
  );
}
export function RevisionReviewPanel({
  orderId,
  revision,
  onApplied,
}: {
  orderId: string;
  revision: number;
  onApplied: () => Promise<void>;
}) {
  const [view, setView] = useState<RevisionReviewView | null>(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    void api<RevisionReviewView>(`/production-revisions/orders/${orderId}`)
      .then((v) => {
        if (active) {
          setView(v);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [orderId, revision, tick]);
  if (error)
    return (
      <p className="alert error" role="alert">
        {error}
      </p>
    );
  if (!view || (!view.sources.length && !view.history.length)) return null;
  return (
    <section
      className="panel pricing-panel revision-review"
      aria-label="Production revision review"
    >
      <h2>ກວດວຽກຈາກ Order ສະບັບເກົ່າ / Review previous production</h2>
      <p>
        ໃບໃໝ່ລໍຖ້າ Graphic/Owner ອະນຸມັດ ກ່ອນໃຊ້ສະຖານະເກົ່າ / New PS awaits graphic or owner
        approval before progress is continued
      </p>
      <p>
        Order v{revision} · ໃຊ້ຕໍ່ໄດ້ເມື່ອແບບ ຜ້າ Size ແລະ ໄຟລ໌ກົງກັນ · New production starts
        separately
      </p>
      {view.sources.length > 0 &&
        (view.canReview ? (
          <ReviewForm
            key={view.checkToken}
            view={view}
            onChanged={() => setTick((t) => t + 1)}
            onApplied={onApplied}
          />
        ) : (
          <p className="alert warning">
            ໃຫ້ Owner/Admin ກວດແລະຢືນຢັນ / Owner or ADMIN must review first
          </p>
        ))}
      {view.history.map((h) => (
        <details key={h.id} open={view.history[0]?.id === h.id}>
          <summary>
            ທົບທວນແລ້ວ / Reviewed Order v{h.revision} · {h.actorName}
          </summary>
          <p>{h.reason}</p>
          {h.reversal && (
            <p className="alert warning">
              ຍົກເລີກແຜນແລ້ວ / Plan reversed · {h.reversal.actorName} ·{' '}
              {new Date(h.reversal.at).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })} ·{' '}
              {h.reversal.reason}
            </p>
          )}
          {h.result.sheets.map((s) => (
            <p key={s.sourceSheetId}>
              Planned reuse {s.reused} · Not reused {s.notReused}{' '}
              {s.targetSheetId && (
                <a href={`?prepareSheet=${s.targetSheetId}`}>
                  {s.number ?? 'New PS'} · Graphic review
                </a>
              )}
            </p>
          ))}
          {view.canReview && !h.reversal && (
            <RevisionReversalPanel
              reviewId={h.id}
              onApplied={() => {
                setTick((t) => t + 1);
                void onApplied();
              }}
            />
          )}
        </details>
      ))}
    </section>
  );
}
