import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  parseCustomerTrackingUrl,
  type InvoiceTrackingLink,
} from '../../../../../packages/contracts/src/tracking';
import { api, errorMessage } from '../../services/api';
import { TrackingManager } from '../tracking/TrackingManager';
import { shopDate } from '../settlements/CommandResult';
import './invoice-tracking.css';
type Attachment = InvoiceTrackingLink & { url: string; qr: string };
export function InvoiceTrackingQr({
  orderId,
  beforePrint,
}: {
  orderId: string;
  beforePrint?: () => Promise<() => void>;
}) {
  const [include, setInclude] = useState(false),
    [input, setInput] = useState(''),
    [attachment, setAttachment] = useState<Attachment | null>(null),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function check(url: string) {
    const parsed = parseCustomerTrackingUrl(url, location.origin);
    const link = await api<InvoiceTrackingLink>(
      `/tracking/orders/${orderId}/invoice-link`,
      'POST',
      { token: parsed.token },
    );
    return { ...link, url: parsed.url };
  }
  async function attach(url: string) {
    const ticket = ++sequence.current;
    setBusy(true);
    setError('');
    setAttachment(null);
    try {
      const checked = await check(url),
        qr = await QRCode.toDataURL(checked.url, {
          width: 280,
          margin: 4,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
      const bitmap = new Image();
      bitmap.src = qr;
      await bitmap.decode();
      if (ticket === sequence.current) {
        setInput(checked.url);
        setAttachment({ ...checked, qr });
      }
    } catch (e) {
      if (ticket === sequence.current) setError(errorMessage(e));
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function print() {
    const ticket = ++sequence.current;
    let release: (() => void) | undefined;
    setBusy(true);
    setError('');
    try {
      release = await beforePrint?.();
      if (include) {
        if (!attachment)
          throw new Error('ກວດລິງ ແລະລໍຖ້າ QR ກ່ອນ / Validate the link and wait for the QR first');
        try {
          const current = await check(attachment.url);
          if (current.id !== attachment.id)
            throw new Error('ລິງປ່ຽນ ກວດໃໝ່ / Tracking link changed; validate again');
        } catch (e) {
          setAttachment(null);
          throw e;
        }
      }
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (ticket !== sequence.current)
        throw new Error('ປ່ຽນໃບແລ້ວ / Document changed; print the selected document again');
      window.print();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      release?.();
      setBusy(false);
    }
  }
  const disabled = busy || frozen;
  return (
    <>
      <section className="invoice-qr-controls no-print" aria-label="Invoice tracking controls">
        <label className="invoice-qr-toggle">
          <input
            type="checkbox"
            aria-label="Include invoice tracking QR"
            checked={include}
            disabled={disabled}
            onChange={(e) => {
              setInclude(e.target.checked);
              setAttachment(null);
              setError('');
              sequence.current++;
            }}
          />
          ໃສ່ QR ຕິດຕາມໃນໃບແຈ້ງໜີ້ / Include customer tracking QR
        </label>
        {include && (
          <>
            <p>
              ລູກຄ້າຕ້ອງຢືນຢັນເບີໂທ / Phone verification required. QR opens current order tracking;
              the invoice values remain this revision.
            </p>
            {['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && (
              <p className="alert warning">
                ທີ່ຢູ່ນີ້ເປີດໄດ້ໃນເຄື່ອງນີ້ / This website address opens on this computer only. Use
                the customer-accessible shop address before printing a customer copy.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void attach(input);
              }}
            >
              <label>
                ລິງທີ່ຄັດລອກໄວ້ / Previously copied tracking link
                <input
                  aria-label="Invoice tracking link"
                  type="url"
                  required
                  maxLength={2048}
                  value={input}
                  disabled={disabled}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setAttachment(null);
                    setError('');
                  }}
                />
              </label>
              <button disabled={disabled || !input.trim()}>
                ກວດແລະໃສ່ QR / Validate and attach QR
              </button>
            </form>
            <p>
              ພິມຊ້ຳໄດ້ດ້ວຍລິງເດີມ ບໍ່ຕ້ອງປ່ຽນລິງ / Paste the original link to reprint. The secret
              link is not saved in this page after closing it.
            </p>
            <details>
              <summary>ຍັງບໍ່ມີລິງ ຫຼືຕ້ອງການປ່ຽນ / Create or replace link</summary>
              <TrackingManager
                orderId={orderId}
                disabled={busy}
                onFreeze={setFrozen}
                onLinkAvailable={(url) => {
                  sequence.current++;
                  setAttachment(null);
                  setError('');
                  setInput(url ?? '');
                  if (url) void attach(url);
                }}
              />
            </details>
          </>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {busy && <p role="status">ກຳລັງກວດ QR / Checking QR…</p>}
      </section>
      {include && attachment && (
        <section
          className="invoice-tracking-qr"
          aria-label="Invoice customer tracking QR"
          data-ready="true"
        >
          <img src={attachment.qr} width={140} height={140} alt="Invoice customer tracking QR" />
          <div>
            <b>ຕິດຕາມອໍເດີ / Track your order</b>
            <p>ສະແກນ ແລະຢືນຢັນເບີໂທ / Scan and verify your phone</p>
            <p>ໝົດອາຍຸ / Expires: {shopDate(attachment.expiresAt)} · Lao time</p>
            <p>ສະຖານະປັດຈຸບັນ ບໍ່ແມ່ນ QR ຈ່າຍເງິນ / Current tracking · Not a payment QR</p>
            <a href={attachment.url} target="_blank" rel="noreferrer">
              ເປີດຕິດຕາມ / Open tracking
            </a>
          </div>
        </section>
      )}
      <button
        className="primary no-print"
        disabled={disabled || (include && !attachment)}
        onClick={() => void print()}
      >
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </>
  );
}
