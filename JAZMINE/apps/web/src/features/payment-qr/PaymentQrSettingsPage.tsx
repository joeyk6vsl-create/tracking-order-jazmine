import { useEffect, useState } from 'react';
import type {
  PaymentQrCurrency,
  PaymentQrView,
} from '../../../../../packages/contracts/src/payment-qr';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import './payment-qr.css';
function SettingsForm({ item, onSaved }: { item: PaymentQrView; onSaved: () => void }) {
  const [bankName, setBankName] = useState(item.reference?.bankName ?? ''),
    [receiverName, setReceiverName] = useState(item.reference?.receiverName ?? ''),
    [accountReference, setAccountReference] = useState(item.reference?.accountReference ?? ''),
    [enabled, setEnabled] = useState(item.enabled),
    [verified, setVerified] = useState(false),
    [reason, setReason] = useState(''),
    [imageBase64, setImageBase64] = useState(''),
    [filename, setFilename] = useState(item.filename),
    [preview, setPreview] = useState(
      item.reference ? `/api/v1/payment-qr/${item.currency}/versions/${item.version}/image` : '',
    ),
    [error, setError] = useState(''),
    [inspecting, setInspecting] = useState(false),
    [frozen, setFrozen] = useState(false);
  const command = useRecordedCommand(onSaved, setFrozen),
    disabled = command.busy || frozen || inspecting;
  async function pick(file?: File) {
    if (!file) return;
    setVerified(false);
    setPreview('');
    setImageBase64('');
    setError('');
    if (file.size > 1024 * 1024) {
      setError('ໃຊ້ຮູບບໍ່ເກີນ 1 MB / Image must be at most 1 MB');
      return;
    }
    setInspecting(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('Cannot read file'));
        r.readAsDataURL(file);
      });
      setImageBase64(data);
      setFilename(file.name);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInspecting(false);
    }
  }
  async function inspect() {
    setInspecting(true);
    setError('');
    setVerified(false);
    try {
      const result = await api<{ image: string }>(`/payment-qr/${item.currency}/inspect`, 'POST', {
        imageBase64,
      });
      const image = new Image();
      image.src = result.image;
      await image.decode();
      setPreview(result.image);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInspecting(false);
    }
  }
  return (
    <section className="panel payment-qr-settings">
      <h2>
        {item.currency === 'LAK' ? 'ກີບ / LAK' : 'ບາດ / THB'} · v{item.version} ·{' '}
        {item.enabled ? 'Enabled' : 'Disabled'}
      </h2>
      <p>
        ໃຊ້ QR ຈາກທະນາຄານ ແບບໃຊ້ຊ້ຳ ແລະບໍ່ລັອກຍອດ / Upload a reusable bank merchant QR without a
        fixed amount. PNG/JPEG/WebP · 1 MB
      </p>
      <label>
        Bank QR image
        <input
          aria-label="Bank QR image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {imageBase64 && (
        <button disabled={disabled} onClick={() => void inspect()}>
          ກວດຮູບ / Check bank QR image
        </button>
      )}
      {preview && (
        <img
          className="payment-qr-preview"
          src={preview}
          alt="Bank QR preview to verify in bank app"
        />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!preview) return;
          void command.send('/payment-qr/' + item.currency, {
            requestId: crypto.randomUUID(),
            version: item.version,
            bankName,
            receiverName,
            accountReference,
            enabled,
            verifiedInBankApp: verified,
            reason,
            ...(imageBase64 ? { imageBase64, filename } : {}),
          });
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            ທະນາຄານ / Bank name
            <input
              aria-label="Payment QR bank name"
              required
              maxLength={100}
              value={bankName}
              onChange={(e) => {
                setBankName(e.target.value);
                setVerified(false);
              }}
            />
          </label>
          <label>
            ຊື່ຜູ້ຮັບ / Recipient name
            <input
              aria-label="Payment QR recipient name"
              required
              maxLength={120}
              value={receiverName}
              onChange={(e) => {
                setReceiverName(e.target.value);
                setVerified(false);
              }}
            />
          </label>
          <label>
            ເລກບັນຊີ ຫຼືລະຫັດຮ້ານ / Account or merchant reference
            <input
              aria-label="Payment QR account reference"
              required
              maxLength={100}
              value={accountReference}
              onChange={(e) => {
                setAccountReference(e.target.value);
                setVerified(false);
              }}
            />
          </label>
          <label className="payment-qr-toggle">
            <input
              aria-label="Enable payment QR on new invoices"
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setVerified(false);
              }}
            />
            ໃຊ້ໃນໃບແຈ້ງໜີ້ໃໝ່ / Include this QR in new stored invoices
          </label>
          <label className="payment-qr-toggle">
            <input
              aria-label="Verified payment QR in bank app"
              type="checkbox"
              checked={verified}
              disabled={!preview}
              onChange={(e) => setVerified(e.target.checked)}
            />
            ສະແກນ QR ຕົວຢ່າງນີ້ໃນແອັບທະນາຄານແລ້ວ ຜູ້ຮັບ/ສະກຸນເງິນຖືກ ແລະກອກຍອດເອງໄດ້ / I checked
            this preview in the bank app: recipient and currency are correct and the amount is
            editable
          </label>
          <label>
            ເຫດຜົນ / Reason
            <input
              aria-label="Payment QR change reason"
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!preview || !reason.trim() || (enabled && !verified)}
          >
            ບັນທຶກ / Save payment QR
          </button>
        </fieldset>
      </form>
      {(error || command.error) && <p role="alert">{error || command.error}</p>}
      {command.pending && (
        <button disabled={command.busy} onClick={command.retry}>
          Retry same bank QR request
        </button>
      )}
      {item.createdAt && (
        <p>
          {item.actorName} ·{' '}
          {new Date(item.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })} ·{' '}
          {item.reason}
        </p>
      )}
    </section>
  );
}
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
