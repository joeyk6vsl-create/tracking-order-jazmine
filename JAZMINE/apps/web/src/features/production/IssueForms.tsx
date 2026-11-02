import { useState } from 'react';
import {
  WORK_STAGES,
  WORK_STAGE_LABELS,
} from '../../../../../packages/contracts/src/production-work';
import {
  ISSUE_CATEGORIES,
  ISSUE_LABELS,
  type IssueView,
  type IssueResolve,
  type ExceptionDetail,
} from '../../../../../packages/contracts/src/production-exceptions';
import type { WorkDetail } from '../../../../../packages/contracts/src/production-work';
import { useProductionCommand } from './useProductionCommand';
type Actions = { disabled: boolean; onChanged: () => void; onFreeze: (frozen: boolean) => void };
function Result({ command }: { command: ReturnType<typeof useProductionCommand> }) {
  return (
    <>
      {command.error && (
        <p className="alert error" role="alert">
          {command.error}
        </p>
      )}
      {command.pending && (
        <button type="button" disabled={command.busy} onClick={command.retry}>
          Retry ຄຳຂໍເດີມ
        </button>
      )}
    </>
  );
}
export function ReportIssueForm({
  detail,
  overview,
  losses,
  ...actions
}: Actions & { detail: WorkDetail; overview: boolean; losses: ExceptionDetail['losses'] }) {
  const [department, setDepartment] = useState(detail.job.stages[0].department),
    [category, setCategory] = useState<(typeof ISSUE_CATEGORIES)[number]>('OTHER'),
    [mode, setMode] = useState<'CONTINUE' | 'STOP'>('CONTINUE'),
    [description, setDescription] = useState(''),
    [counts, setCounts] = useState<Record<number, number>>({});
  const command = useProductionCommand(actions.onChanged, actions.onFreeze),
    disabled = actions.disabled || command.busy || !!command.pending || !!detail.job.blocked;
  const remaining = (line: number, quantity: number) => {
    const loss = losses.find((l) => l.lineIndex === line);
    return Math.max(0, quantity - (loss?.scrap ?? 0) - (loss?.released ?? 0));
  };
  return (
    <form
      aria-label="Report issue"
      onSubmit={(e) => {
        e.preventDefault();
        void command
          .send(`/production-exceptions/sheets/${detail.job.id}/reports`, {
            requestId: crypto.randomUUID(),
            version: detail.job.version,
            sheetRowVersion: detail.job.sheetRowVersion,
            department,
            category,
            mode,
            description,
            affected: detail.snapshot.allocations
              .filter((a) => (counts[a.lineIndex] ?? 0) > 0)
              .map((a) => ({ lineIndex: a.lineIndex, quantity: counts[a.lineIndex] })),
          })
          .then((ok) => {
            if (ok) {
              setDescription('');
              setCounts({});
            }
          });
      }}
    >
      <h3>ແຈ້ງປັນຫາ / Report issue</h3>
      <fieldset className="draft-fields" disabled={disabled}>
        {overview && (
          <label>
            ພະແນກ / Department
            <select
              aria-label="Issue department"
              value={department}
              onChange={(e) => setDepartment(e.target.value as typeof department)}
            >
              {WORK_STAGES.map((s) => (
                <option key={s} value={s}>
                  {WORK_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          ປະເພດ / Category
          <select
            aria-label="Issue category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ISSUE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          ການເຮັດວຽກ / Action
          <select
            aria-label="Issue mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="CONTINUE">ລາຍງານ ແລະເຮັດຕໍ່ / Continue</option>
            <option value="STOP">ລາຍງານ ແລະຢຸດ / Stop</option>
          </select>
        </label>
        <label>
          ລາຍລະອຽດ / Description
          <textarea
            aria-label="Issue description"
            required
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p>ຈຳນວນທີ່ພົບປັນຫາ · ຖ້າບໍ່ແມ່ນປັນຫາຈຳນວນ ໃຫ້ເວັ້ນເປັນ 0</p>
        {detail.snapshot.allocations.map((a) => (
          <label key={a.lineIndex}>
            Size {detail.snapshot.context.lines[a.lineIndex].size} · ຄົງເຫຼືອ / Remaining{' '}
            {remaining(a.lineIndex, a.quantity)} pcs
            <input
              aria-label={`Affected line ${a.lineIndex + 1}`}
              type="number"
              min={0}
              max={remaining(a.lineIndex, a.quantity)}
              value={counts[a.lineIndex] ?? 0}
              onChange={(e) => setCounts((p) => ({ ...p, [a.lineIndex]: Number(e.target.value) }))}
            />
          </label>
        ))}
        <button
          className="primary"
          disabled={
            !description.trim() ||
            (category === 'DAMAGE' && !Object.values(counts).some((n) => n > 0))
          }
        >
          ບັນທຶກປັນຫາ / Report
        </button>
      </fieldset>
      <Result command={command} />
    </form>
  );
}
export function ResolveIssueForm({
  issue,
  detail,
  ...actions
}: Actions & { issue: IssueView; detail: WorkDetail }) {
  const [reason, setReason] = useState(''),
    [rows, setRows] = useState<IssueResolve['rows']>(() =>
      issue.affected.map((a) => ({
        lineIndex: a.lineIndex,
        usableQty: 0,
        scrapQty: 0,
        releaseQty: 0,
        ignoredQty: 0,
        replacementQty: 0,
      })),
    );
  const command = useProductionCommand(actions.onChanged, actions.onFreeze);
  const fields = [
    ['usableQty', 'ໃຊ້ໄດ້ / Usable'],
    ['scrapQty', 'ເສຍ / Scrap'],
    ['releaseQty', 'ຍັງບໍ່ເຮັດ ປ່ອຍຄືນ / Release'],
    ['ignoredQty', 'ລາຍງານຊ້ຳ / Dismiss'],
    ['replacementQty', 'ສ້າງທົດແທນ / Replacement'],
  ] as const;
  return (
    <form
      aria-label={`Resolve ${issue.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        void command.send(`/production-exceptions/issues/${issue.id}/resolve`, {
          requestId: crypto.randomUUID(),
          rowVersion: issue.rowVersion,
          sheetRowVersion: detail.job.sheetRowVersion,
          reason,
          rows,
        });
      }}
    >
      <fieldset
        className="draft-fields"
        disabled={actions.disabled || command.busy || !!command.pending}
      >
        {rows.map((row, index) => (
          <div className="draft-line" key={row.lineIndex}>
            <strong>
              Size {detail.snapshot.context.lines[row.lineIndex]?.size} · Reported{' '}
              {issue.affected[index].quantity}
            </strong>
            <div className="issue-quantities">
              {fields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={`${key} line ${row.lineIndex + 1}`}
                    type="number"
                    min={0}
                    max={issue.affected[index].quantity}
                    value={row[key]}
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
            <button
              type="button"
              onClick={() =>
                setRows((all) =>
                  all.map((r, i) =>
                    i === index
                      ? {
                          ...r,
                          usableQty: 0,
                          scrapQty: issue.affected[index].quantity,
                          releaseQty: 0,
                          ignoredQty: 0,
                          replacementQty: issue.affected[index].quantity,
                        }
                      : r,
                  ),
                )
              }
            >
              ເສຍທັງໝົດ ແລະຜະລິດທົດແທນ / Replace all affected
            </button>
          </div>
        ))}
        <p>
          Usable + Scrap + Release + Dismiss = Reported · Replacement ບໍ່ເກີນ Scrap + Release ·
          Usable ຍັງຕ້ອງຜ່ານ QC
        </p>
        <label>
          ເຫດຜົນ / Resolution reason
          <textarea
            aria-label="Resolution reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!reason.trim()}>
          ຢືນຢັນ ແລະປິດປັນຫາ / Resolve
        </button>
      </fieldset>
      <Result command={command} />
    </form>
  );
}
export function MoreReplacementForm({ issue, ...actions }: Actions & { issue: IssueView }) {
  const [reason, setReason] = useState(''),
    [counts, setCounts] = useState<Record<number, number>>({});
  const command = useProductionCommand(actions.onChanged, actions.onFreeze);
  const available = (issue.resolutionRows ?? [])
    .map((r) => ({
      ...r,
      remaining:
        r.scrapQty +
        r.releaseQty -
        (issue.replacementUsage?.find((u) => u.lineIndex === r.lineIndex)?.quantity ??
          issue.replacements
            .filter((s) => s.state !== 'CANCELLED')
            .flatMap((s) => s.allocations)
            .filter((a) => a.lineIndex === r.lineIndex)
            .reduce((n, a) => n + a.quantity, 0)),
    }))
    .filter((r) => r.remaining > 0);
  if (!available.length) return null;
  return (
    <details>
      <summary>ສ້າງ Draft ທົດແທນເພີ່ມ / Additional replacement</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void command
            .send(`/production-exceptions/issues/${issue.id}/replacements`, {
              requestId: crypto.randomUUID(),
              reason,
              allocations: available
                .filter((r) => (counts[r.lineIndex] ?? 0) > 0)
                .map((r) => ({ lineIndex: r.lineIndex, quantity: counts[r.lineIndex] })),
            })
            .then((ok) => {
              if (ok) {
                setReason('');
                setCounts({});
              }
            });
        }}
      >
        <fieldset
          className="draft-fields"
          disabled={actions.disabled || command.busy || !!command.pending}
        >
          {available.map((r) => (
            <label key={r.lineIndex}>
              Line {r.lineIndex + 1} · ທົດແທນໄດ້ອີກ / Remaining {r.remaining}
              <input
                aria-label={`Replacement line ${r.lineIndex + 1}`}
                type="number"
                min={0}
                max={r.remaining}
                value={counts[r.lineIndex] ?? 0}
                onChange={(e) =>
                  setCounts((p) => ({ ...p, [r.lineIndex]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <label>
            ເຫດຜົນ / Reason
            <input
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={!reason.trim() || !Object.values(counts).some((n) => n > 0)}>
            ສ້າງ Draft / Create replacement
          </button>
        </fieldset>
        <Result command={command} />
      </form>
    </details>
  );
}
