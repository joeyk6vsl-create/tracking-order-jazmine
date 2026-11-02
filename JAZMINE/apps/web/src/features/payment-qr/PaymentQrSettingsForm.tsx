import { useEffect, useState } from 'react';
import type { PaymentQrView } from '../../../../../packages/contracts/src/payment-qr';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
export function SettingsForm({
  item,
  onSaved,
  onReload,
}: {
  item: PaymentQrView;
  onSaved: () => void;
  onReload: () => void;
}) {
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
  const [attempted, setAttempted] = useState(false);
  const [checks] = useState(() => ({ ticket: 0 }));
  useEffect(
    () => () => {
      checks.ticket++;
    },
    [checks],
  );
  const command = useRecordedCommand(onReload, setFrozen),
    disabled = command.busy || frozen || inspecting;
  async function pick(file?: File) {
    if (!file) return;
    const ticket = ++checks.ticket;
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
      if (ticket !== checks.ticket) return;
      setImageBase64(data);
      setFilename(file.name);
      await inspectImage(data, ticket);
    } catch (e) {
      if (ticket === checks.ticket) setError(errorMessage(e));
    } finally {
      if (ticket === checks.ticket) setInspecting(false);
    }
  }
  async function inspect() {
    const ticket = ++checks.ticket;
    setInspecting(true);
    setError('');
    setVerified(false);
    setPreview('');
    await inspectImage(imageBase64, ticket);
  }
  async function inspectImage(data: string, ticket: number) {
    try {
      const result = await api<{ image: string }>(`/payment-qr/${item.currency}/inspect`, 'POST', {
        imageBase64: data,
      });
      const image = new Image();
      image.src = result.image;
      await image.decode();
      if (ticket === checks.ticket) setPreview(result.image);
    } catch (e) {
      if (ticket === checks.ticket) setError(errorMessage(e));
    } finally {
      if (ticket === checks.ticket) setInspecting(false);
    }
  }
  const remaining = [
    ...(!preview
      ? ['ເລືອກຮູບ QR ແລະລໍຖ້າກວດຮູບ / Choose a bank QR image and wait for the image check.']
      : []),
    ...(!bankName.trim() ? ['ກອກຊື່ທະນາຄານ / Enter the bank name.'] : []),
    ...(!receiverName.trim() ? ['ກອກຊື່ຜູ້ຮັບ / Enter the recipient name.'] : []),
    ...(!accountReference.trim()
      ? ['ກອກເລກບັນຊີ ຫຼືລະຫັດຮ້ານ / Enter the account or merchant reference.']
      : []),
    ...(enabled && !verified
      ? [
          'ສະແກນຮູບຕົວຢ່າງໃນແອັບທະນາຄານ ແລ້ວຕິກຢືນຢັນ / Check the preview in the bank app, then tick the verification box.',
        ]
      : []),
    ...(!reason.trim() ? ['ກອກເຫດຜົນ / Enter a reason for this change.'] : []),
  ];
  return (
    <section className="panel payment-qr-settings">
      <h2>
        {item.currency === 'LAK' ? 'ກີບ / LAK' : 'ບາດ / THB'} · v{item.version} ·{' '}
        {item.enabled ? 'Enabled' : 'Disabled'}
      </h2>
      <p>
        ໃຊ້ QR ຈາກທະນາຄານ ແບບໃຊ້ຊ້ຳ ແລະບໍ່ລັອກຍອດ / Upload a supported personal or merchant bank QR
        without a fixed amount. PNG/JPEG/WebP · 1 MB
      </p>
      {(error || command.error) && (
        <p className="alert error" role="alert">
          {error || command.error}
        </p>
      )}
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
      {inspecting && <p role="status">ກຳລັງກວດຮູບ QR / Checking bank QR image…</p>}
      {preview && (
        <img
          className="payment-qr-preview"
          src={preview}
          alt="Bank QR preview to verify in bank app"
        />
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (remaining.length) return;
          void command.send(
            '/payment-qr/' + item.currency,
            {
              requestId: crypto.randomUUID(),
              version: item.version,
              bankName,
              receiverName,
              accountReference,
              enabled,
              verifiedInBankApp: verified,
              reason,
              ...(imageBase64 ? { imageBase64, filename } : {}),
            },
            onSaved,
          );
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
          {attempted && remaining.length > 0 && (
            <div className="alert error" role="alert">
              <p>ຍັງບັນທຶກບໍ່ໄດ້ / Complete these steps to save:</p>
              <ul>
                {remaining.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="primary">ບັນທຶກ / Save payment QR</button>
        </fieldset>
      </form>
      {remaining.length > 0 && (
        <div className="notice payment-qr-steps">
          <p>
            {item.version > 0
              ? 'ກ່ອນບັນທຶກການແກ້ໄຂ / Before saving another change:'
              : 'ກ່ອນບັນທຶກ / Before saving:'}
          </p>
          <ul aria-label="Payment QR steps">
            {remaining.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
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
