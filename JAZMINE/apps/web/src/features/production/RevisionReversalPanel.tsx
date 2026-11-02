import { useEffect, useState } from 'react';
import type {
  RevisionReversalView,
  RevisionReversalResult,
} from '../../../../../packages/contracts/src/production-revisions';
import { api, errorMessage } from '../../services/api';
import { useProductionCommand } from './useProductionCommand';
function ReversalForm({
  view,
  onApplied,
  onReload,
}: {
  view: RevisionReversalView;
  onApplied: () => void;
  onReload: () => void;
}) {
  const [reason, setReason] = useState(''),
    [checked, setChecked] = useState(false),
    [frozen, setFrozen] = useState(false);
  const command = useProductionCommand<RevisionReversalResult>(() => {}, setFrozen);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void command.send(
          `/production-revisions/reviews/${view.reviewId}/reversal`,
          {
            requestId: crypto.randomUUID(),
            checkToken: view.checkToken,
            reason,
            reviewedEffects: true,
          },
          onApplied,
        );
      }}
    >
      <p className="alert warning">
        ໃບໃໝ່ຈາກແຜນນີ້ຈະປິດ ແລະ ຄືນໃບເກົ່າໃຫ້ກວດໃໝ່ / Close the new sheets and restore the old
        sheets for a new review. Money, deliveries and order revisions stay unchanged.
      </p>
      <fieldset disabled={frozen || command.busy || !view.canReverse}>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Production reversal reason"
            value={reason}
            maxLength={1000}
            required
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="revision-check">
          <input
            type="checkbox"
            aria-label="Review production reversal effects"
            required
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          ກວດທຸກໃບ ແລະ ຢືນຢັນວ່າຍັງບໍ່ມີວຽກ/ການສົ່ງເພີ່ມ / I checked every sheet and confirmed no
          additional physical work or delivery has occurred
        </label>
        <button disabled={!checked || !reason.trim()}>
          ຍົກເລີກແຜນທັງຊຸດ / Reverse entire reuse plan
        </button>
      </fieldset>
      {command.error && (
        <p className="alert error" role="alert">
          {command.error}
        </p>
      )}
      {command.busy && <p role="status">ກຳລັງບັນທຶກ / Saving…</p>}
      {command.pending ? (
        <button type="button" disabled={command.busy} onClick={() => void command.retry()}>
          ກວດຄຳຂໍເດີມ / Retry plan reversal
        </button>
      ) : (
        <button type="button" disabled={command.busy} onClick={onReload}>
          ກວດໃໝ່ / Check reversal again
        </button>
      )}
    </form>
  );
}
export function RevisionReversalPanel({
  reviewId,
  onApplied,
}: {
  reviewId: string;
  onApplied: () => void;
}) {
  const [view, setView] = useState<RevisionReversalView | null>(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!tick) return;
    let active = true;
    void api<RevisionReversalView>(`/production-revisions/reviews/${reviewId}/reversal`)
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
  }, [reviewId, tick]);
  const check = () => {
    setLoading(true);
    setView(null);
    setError('');
    setTick((t) => t + 1);
  };
  return (
    <section className="revision-source" aria-label={'Reverse production plan ' + reviewId}>
      {!view && (
        <button type="button" disabled={loading} onClick={check}>
          ກວດກ່ອນຍົກເລີກແຜນ / Check plan reversal
        </button>
      )}
      {loading && <p role="status">ກຳລັງກວດ / Checking…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {view && (
        <>
          <h3>ຜົນທີ່ຈະປ່ຽນ / Reversal effects</h3>
          {view.sheets.map((s) => (
            <p key={s.sourceSheetId}>
              ຄືນ / Restore: {s.sourceNumber} → {s.sourceState ?? 'Unknown'}
              {s.targetSheetId && (
                <>
                  {' '}
                  · ປິດ / Close: {s.targetNumber} ({s.targetState})
                </>
              )}
            </p>
          ))}
          <p>
            ໃບເກົ່າຍັງເປັນ Order ສະບັບເກົ່າ ຕ້ອງຢືນຢັນແຜນໃໝ່ກ່ອນເຮັດຕໍ່ / Restored sheets belong to
            the older order revision; review a new plan before continuing work.
          </p>
          {view.blockers.map((b) => (
            <p className="alert warning" key={b}>
              {b}
            </p>
          ))}
          {!view.reversal && (
            <ReversalForm
              key={view.checkToken}
              view={view}
              onReload={check}
              onApplied={() => {
                onApplied();
                check();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
