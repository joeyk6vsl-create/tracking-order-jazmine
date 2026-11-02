import { useEffect, useState } from 'react';
import type {
  PaymentQrCurrency,
  PaymentQrView,
} from '../../../../../packages/contracts/src/payment-qr';
import { api, errorMessage } from '../../services/api';
import { SettingsForm } from './PaymentQrSettingsForm';
import './payment-qr.css';
function History({ currency }: { currency: PaymentQrCurrency }) {
  const [page, setPage] = useState(1),
    [result, setResult] = useState<{ versions: PaymentQrView[]; hasMore: boolean } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api<{ versions: PaymentQrView[]; hasMore: boolean }>(
      `/payment-qr/${currency}/history?page=${page}`,
    )
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [currency, page]);
  return (
    <details className="panel">
      <summary>ປະຫວັດ / Payment QR history</summary>
      {error && <p role="alert">{error}</p>}
      <ul>
        {result?.versions.map((v) => (
          <li key={v.version}>
            <a
              target="_blank"
              rel="noreferrer"
              href={`/api/v1/payment-qr/${currency}/versions/${v.version}/image`}
            >
              {currency} v{v.version}
            </a>{' '}
            · {v.enabled ? 'Enabled at save' : 'Disabled at save'} · {v.reference?.bankName} ·{' '}
            {v.reference?.receiverName}
            <br />
            {v.actorName} · {v.reason}
          </li>
        ))}
      </ul>
      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
        Previous QR history
      </button>
      <span> {page} </span>
      <button disabled={!result?.hasMore} onClick={() => setPage((p) => p + 1)}>
        Next QR history
      </button>
    </details>
  );
}
export function PaymentQrSettingsPage() {
  const [currency, setCurrency] = useState<PaymentQrCurrency>('LAK'),
    [settings, setSettings] = useState<PaymentQrView[]>([]),
    [tick, setTick] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api<{ settings: PaymentQrView[] }>('/payment-qr')
      .then((r) => {
        if (alive) {
          setSettings(r.settings);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  const item = settings.find((s) => s.currency === currency);
  return (
    <div className="payment-qr-settings">
      <h1>QR ຮັບເງິນ / Shop payment QR</h1>
      <p>
        ຕັ້ງຄ່າໂດຍເຈົ້າຂອງ · ລູກຄ້າເລືອກຈ່າຍກີບ ຫຼືບາດ / Owner settings · Customers can choose LAK
        or THB.
      </p>
      <p>
        ການຕັ້ງ QR ຫຼືສະແກນ ບໍ່ໄດ້ບັນທຶກຮັບເງິນ / Saving or scanning a QR does not record a payment.
      </p>
      <button aria-pressed={currency === 'LAK'} onClick={() => setCurrency('LAK')}>
        ກີບ / LAK
      </button>
      <button aria-pressed={currency === 'THB'} onClick={() => setCurrency('THB')}>
        ບາດ / THB
      </button>
      <button onClick={() => setTick((t) => t + 1)}>Reload bank QR settings</button>
      {error && <p role="alert">{error}</p>}
      {item ? (
        <>
          <SettingsForm
            key={currency + ':' + item.version}
            item={item}
            onSaved={() => setTick((t) => t + 1)}
          />
          <History key={currency + ':history:' + item.version} currency={currency} />
        </>
      ) : (
        <p role="status">Loading…</p>
      )}
    </div>
  );
}
