import { useEffect, useState } from 'react';
import type { LifecycleView } from '../../../../../packages/contracts/src/order-lifecycle';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import { CommandResult, lak, shopDate } from './CommandResult';
import './order-lifecycle.css';
type Props = {
  orderId: string;
  version: number;
  disabled: boolean;
  onChanged: () => void;
  onFreeze: (v: boolean) => void;
};
const labels = {
  cancel: 'ຍົກເລີກອໍເດີ / Cancel order',
  agreement: 'ຕົກລົງຍອດຫຼັງຍົກເລີກ / Record cancellation agreement',
  archive: 'ເກັບອໍເດີເກົ່າ / Archive order',
  restore: 'ເປີດຈາກ Archive / Restore to working lists',
};
const historyLabels: Record<string, string> = {
  CANCEL: 'ຍົກເລີກອໍເດີ / Order cancelled',
  AGREEMENT: 'ຕົກລົງຍອດ / Financial agreement',
  ARCHIVE: 'ເກັບອໍເດີເກົ່າ / Archived',
  RESTORE: 'ເປີດກັບລາຍການປະຈຳ / Restored to working lists',
  AUTO_RESTORE: 'ມີວຽກໃໝ່ ເປີດກັບລາຍການປະຈຳ / Automatically restored for new activity',
};
type Operation = keyof typeof labels;
function LifecycleForm({
  view,
  reload,
  ...props
}: Props & { view: LifecycleView; reload: () => void }) {
  const [operation, setOperation] = useState<Operation>(
    view.state.storage === 'ARCHIVED'
      ? 'restore'
      : view.state.business === 'CANCELLED'
        ? 'agreement'
        : 'cancel',
  );
  const [reason, setReason] = useState(''),
    [reviewed, setReviewed] = useState(false),
    [agreed, setAgreed] = useState(view.state.agreedTotal ?? '');
  const command = useRecordedCommand(() => {}, props.onFreeze),
    busy = props.disabled || command.busy || !!command.pending;
  const allowed: Operation[] =
    view.state.storage === 'ARCHIVED'
      ? view.canManageArchive
        ? ['restore']
        : []
      : view.state.business === 'CANCELLED'
        ? view.canResolveFinance
          ? ['agreement', 'archive']
          : []
        : view.canManageArchive
          ? ['cancel', 'archive']
          : ['cancel'];
  const validAmount = /^(0|[1-9]\d{0,15})$/.test(agreed),
    paid = BigInt(view.netPaid),
    target = validAmount ? BigInt(agreed) : null;
  return (
    <>
      <p>
        <b>
          {view.state.business === 'CANCELLED'
            ? 'ຍົກເລີກແລ້ວ / Cancelled'
            : 'ອໍເດີຍັງໃຊ້ງານ / Active order'}
        </b>{' '}
        ·{' '}
        {view.state.storage === 'ARCHIVED'
          ? 'ເກັບໃນ Archive / Archived'
          : 'ຢູ່ໃນລາຍການປະຈຳ / In working lists'}
      </p>
      <div className="lifecycle-effects">
        <p>
          ຮັບສຸດທິ / Net paid: <b>{lak(view.netPaid)}</b>
        </p>
        <p>
          ສົ່ງແລ້ວ / Confirmed shipped: <b>{view.effects.shippedQuantity}</b> pcs
        </p>
        <p>
          ກຳລັງເຮັດ / Stages in progress: <b>{view.effects.inProgress}</b>
        </p>
        <p>
          ກຽມສົ່ງ / Prepared deliveries: <b>{view.effects.preparedShipments}</b>
        </p>
        <p>
          ປັນຫາຄ້າງ / Open issues: <b>{view.effects.openIssues}</b>
        </p>
        <p>
          ຄຳຂໍລູກຄ້າຄ້າງ / Open requests: <b>{view.effects.openRequests}</b>
        </p>
      </div>
      {view.state.business === 'CANCELLED' && (
        <div className={view.finance === 'CLEAR' ? 'lifecycle-clear' : 'alert warning'}>
          {view.finance === 'DECISION_REQUIRED' ? (
            <p>
              ໃຫ້ເຈົ້າຂອງລະບຸຍອດສຸດທ້າຍທີ່ຕົກລົງກັນ / Owner decision required. Cancellation does not
              refund money automatically.
            </p>
          ) : (
            <>
              <p>
                ຍອດສຸດທ້າຍທີ່ຕົກລົງໃຫ້ຮ້ານ / Agreed final amount:{' '}
                <b>{lak(view.state.agreedTotal!)}</b>
              </p>
              <p>
                ຕ້ອງຄືນ / Refund due: <b>{lak(view.refundDue!)}</b> · ຕ້ອງຮັບເພີ່ມ / Additional due:{' '}
                <b>{lak(view.additionalDue!)}</b>
              </p>
              <p>
                {view.finance === 'CLEAR'
                  ? 'ຍອດເງິນຄົບຕາມທີ່ຕົກລົງ / Finances clear'
                  : 'ໃຊ້ປຸ່ມຮັບ/ຄືນເງິນເພື່ອບັນທຶກລາຍການຈິງ / Record actual receipts or refunds below'}
              </p>
            </>
          )}
        </div>
      )}
      {!!view.productionSheets.length && (
        <details>
          <summary>ກວດໃບຜະລິດ / Review production sheets ({view.productionSheets.length})</summary>
          <ul>
            {view.productionSheets.map((s) => (
              <li key={s.id}>
                <a href={`?prepareSheet=${s.id}`} target="_blank" rel="noreferrer">
                  {s.number} · {s.state}
                </a>
                {s.unfinished
                  ? ' · ໃຫ້ Graphic/Owner ກວດແລະປິດໃບ / Review and close unfinished sheet'
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!allowed.length && (
        <form
          aria-label="Order lifecycle form"
          onSubmit={(e) => {
            e.preventDefault();
            void command.send(
              `/order-lifecycle/${props.orderId}/${operation}`,
              {
                requestId: crypto.randomUUID(),
                checkToken: view.checkToken,
                reason,
                reviewed: true,
                ...(operation === 'agreement' ? { agreedTotal: agreed } : {}),
              },
              () => {
                props.onChanged();
                reload();
              },
            );
          }}
        >
          <fieldset disabled={busy}>
            <label>
              ການດຳເນີນການ / Action
              <select
                aria-label="Order lifecycle action"
                value={operation}
                onChange={(e) => {
                  setOperation(e.target.value as Operation);
                  setReviewed(false);
                  setReason('');
                }}
              >
                {allowed.map((a) => (
                  <option key={a} value={a}>
                    {labels[a]}
                  </option>
                ))}
              </select>
            </label>
            {operation === 'cancel' && (
              <p className="alert warning">
                ຈະຢຸດວຽກໃໝ່ ແລະປິດລາຍການກຽມສົ່ງ / Stop new production and deliveries; prepared
                deliveries will be cancelled. Keep completed work, confirmed shipments, files and
                money history. Tell the departments to stop physical work. Owner must decide the
                final amount separately.
              </p>
            )}
            {operation === 'agreement' && (
              <>
                <label>
                  ຍອດສຸດທ້າຍທີ່ຕົກລົງໃຫ້ຮ້ານ (LAK) / Agreed final amount
                  <input
                    aria-label="Cancellation agreed total"
                    inputMode="numeric"
                    required
                    pattern="(0|[1-9][0-9]{0,15})"
                    maxLength={16}
                    value={agreed}
                    onChange={(e) => setAgreed(e.target.value)}
                  />
                </label>
                <p>
                  ຍອດອໍເດີເດີມ / Original order: {lak(view.originalTotal)} · Net paid:{' '}
                  {lak(view.netPaid)}
                </p>
                {target !== null && (
                  <p>
                    ຫຼັງຕົກລົງ / After agreement: Refund due{' '}
                    {lak(String(paid > target ? paid - target : 0n))} · Additional due{' '}
                    {lak(String(target > paid ? target - paid : 0n))}
                  </p>
                )}
                <p>
                  ລະບຸຍອດທີ່ຕົກລົງຈິງ ບໍ່ແມ່ນຈຳນວນຄືນ / Enter the final amount the shop should
                  receive, not the refund amount. This records the agreement; it does not move
                  money.
                </p>
              </>
            )}
            {operation === 'archive' && (
              <div>
                <p>
                  ຊ່ອນຈາກລາຍການປະຈຳ ປະຫວັດຍັງຄົ້ນໄດ້ / Hide from working lists; history remains
                  searchable.
                </p>
                {view.archive.reasons.map((r) => (
                  <p className="alert warning" key={r}>
                    {r}
                  </p>
                ))}
                {view.archive.eligibleAfter && (
                  <p>Archive after: {shopDate(view.archive.eligibleAfter)} · Lao time</p>
                )}
              </div>
            )}
            {operation === 'restore' && (
              <p>
                ກັບເຂົ້າລາຍການປະຈຳ ບໍ່ຍ້ອນການຍົກເລີກ / Restore visibility. A cancelled order stays
                cancelled.
              </p>
            )}
            <label className="lifecycle-review">
              <input
                type="checkbox"
                aria-label="Reviewed order effects"
                required
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              ກວດເງິນ ຊິ້ນງານ ການສົ່ງ ແລະແຈ້ງຜູ້ກ່ຽວຂ້ອງແລ້ວ / I reviewed money, physical work and
              deliveries, and informed the people involved
            </label>
            <label>
              ເຫດຜົນ / Reason
              <input
                aria-label="Order lifecycle reason"
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={
                !reviewed ||
                !reason.trim() ||
                (operation === 'agreement' && !validAmount) ||
                (operation === 'archive' && !view.archive.eligible)
              }
            >
              ຢືນຢັນ / Confirm {operation}
            </button>
          </fieldset>
          <CommandResult command={command} />
          {command.error && !command.pending && (
            <button type="button" disabled={command.busy} onClick={reload}>
              Reload order effects
            </button>
          )}
        </form>
      )}
      {!!view.history.length && (
        <details className="lifecycle-history">
          <summary>ປະຫວັດຍົກເລີກ/Archive / Order lifecycle history ({view.history.length})</summary>
          {view.history.map((h, i) => (
            <article key={i}>
              <b>{historyLabels[h.kind] ?? h.kind}</b>
              <p>
                {h.actorName} · {shopDate(h.at)} · Lao time
              </p>
              <p>{h.reason}</p>
              {h.kind === 'AGREEMENT' && (
                <p>
                  Agreed final amount:{' '}
                  {h.detail.before == null
                    ? 'ຍັງບໍ່ຕົກລົງ / Not decided'
                    : lak(String(h.detail.before))}{' '}
                  → {lak(String(h.detail.agreedTotal))}
                </p>
              )}
              {h.kind === 'CANCEL' && (
                <p>
                  Net paid at cancellation: {lak(String(h.detail.netPaid))} · Shipped:{' '}
                  {String(h.detail.shippedQuantity)} pcs
                </p>
              )}
            </article>
          ))}
        </details>
      )}
    </>
  );
}
export function OrderLifecyclePanel(props: Props) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<LifecycleView | null>(null),
    [tick, setTick] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    void api<LifecycleView>(`/order-lifecycle/${props.orderId}`)
      .then((v) => {
        if (active) setView(v);
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
  }, [open, props.orderId, props.version, tick]);
  return (
    <section
      className="panel pricing-panel order-lifecycle"
      aria-label="Order cancellation and archive"
    >
      <h2>ຍົກເລີກ ແລະເກັບອໍເດີເກົ່າ / Cancellation & archive</h2>
      <button type="button" disabled={props.disabled} onClick={() => setOpen((v) => !v)}>
        ກວດກ່ອນດຳເນີນການ / Review order effects
      </button>
      {open && (
        <>
          {loading && <p role="status">Loading…</p>}
          {error && <p role="alert">{error}</p>}
          {view && (
            <LifecycleForm
              key={view.checkToken}
              {...props}
              disabled={props.disabled || loading}
              view={view}
              reload={() => setTick((t) => t + 1)}
            />
          )}
        </>
      )}
    </section>
  );
}
