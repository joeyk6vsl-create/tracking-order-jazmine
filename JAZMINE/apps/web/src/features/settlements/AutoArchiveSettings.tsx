import { useEffect, useState } from 'react';
import type { ArchiveSettingsView } from '../../../../../packages/contracts/src/order-lifecycle';
import { useSession } from '../auth/SessionProvider';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
function SettingsForm({ view, onSaved }: { view: ArchiveSettingsView; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(view.enabled),
    [reason, setReason] = useState(''),
    [frozen, setFrozen] = useState(false);
  const command = useRecordedCommand(onSaved, setFrozen);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void command.send('/archive-settings', {
          requestId: crypto.randomUUID(),
          rowVersion: view.rowVersion,
          enabled,
          reason,
        });
      }}
    >
      <p>
        ເລີ່ມນັບ 15 ວັນເມື່ອລະບົບກວດພົບວ່າງານ ແລະເງິນຄົບ ຖ້າມີວຽກປ່ຽນຈະນັບໃໝ່ / Starts a 15-day wait
        when clear work and finances are first observed. New activity restarts the wait.
      </p>
      <p>
        ຂໍ້ມູນ ແລະ PDF ຍັງຄົງຢູ່ ຄົ້ນໃນ Archive ໄດ້ / Keeps all records and PDFs; archived orders
        remain searchable.
      </p>
      <fieldset disabled={frozen || command.busy} style={{ minWidth: 0, border: 0, padding: 0 }}>
        <label>
          <input
            aria-label="Enable automatic archive"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          ເປີດການເກັບອໍເດີອັດຕະໂນມັດ / Enable automatic archive
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Automatic archive reason"
            maxLength={1000}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button disabled={!reason.trim()}>ບັນທຶກ / Save archive settings</button>
      </fieldset>
      {command.error && <p role="alert">{command.error}</p>}
      {command.pending && (
        <button type="button" disabled={command.busy} onClick={command.retry}>
          Retry archive settings
        </button>
      )}
      <p>
        ກຳລັງລໍຖ້າ / Waiting: {view.waiting} · {view.actorName} · {view.reason}
      </p>
      <p>
        ກວດຄັ້ງລ່າສຸດ / Last scan:{' '}
        {view.lastRunAt
          ? new Date(view.lastRunAt).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })
          : 'Not started'}
      </p>
    </form>
  );
}
export function AutoArchiveSettings() {
  const { session } = useSession(),
    allowed = !!session?.permissions.includes('archive.manage');
  const [open, setOpen] = useState(false),
    [view, setView] = useState<ArchiveSettingsView | null>(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    if (!allowed || !open) return;
    let active = true;
    void api<ArchiveSettingsView>('/archive-settings')
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
  }, [allowed, open, tick]);
  if (!allowed) return null;
  return (
    <section className="panel pricing-panel" aria-label="Automatic archive settings">
      <h2>ເກັບອໍເດີເກົ່າ / Automatic archive</h2>
      <button onClick={() => setOpen((o) => !o)}>ຕັ້ງຄ່າເຈົ້າຂອງ / Owner archive settings</button>
      {open && (
        <>
          {error && <p role="alert">{error}</p>}
          {view ? (
            <SettingsForm key={view.rowVersion} view={view} onSaved={() => setTick((t) => t + 1)} />
          ) : (
            <p role="status">Loading…</p>
          )}
          <button onClick={() => setTick((t) => t + 1)}>Reload archive settings</button>
        </>
      )}
    </section>
  );
}
