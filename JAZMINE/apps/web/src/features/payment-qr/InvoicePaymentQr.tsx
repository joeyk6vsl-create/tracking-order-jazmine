import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type {
  PaymentQrAttachment,
  PaymentQrView,
  PaymentQrCurrency,
} from '../../../../../packages/contracts/src/payment-qr';
import { api, errorMessage } from '../../services/api';
import { PaymentQrCards } from './PaymentQrCards';
export type PaymentQrPrintGuard = { beforePrint: () => Promise<() => void> };
export function InvoicePaymentQr({ ref }: { ref: Ref<PaymentQrPrintGuard> }) {
  const [settings, setSettings] = useState<PaymentQrView[]>([]),
    [include, setInclude] = useState(false),
    [selected, setSelected] = useState<PaymentQrCurrency[]>(['LAK', 'THB']),
    [attachments, setAttachments] = useState<PaymentQrAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [printing, setPrinting] = useState(false),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    void api<{ settings: PaymentQrView[] }>('/payment-qr')
      .then((r) => {
        if (alive) setSettings(r.settings);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  const available = settings.filter((s) => s.enabled && s.reference);
  async function attach() {
    const ticket = ++sequence.current;
    setBusy(true);
    setError('');
    setAttachments([]);
    try {
      const versions = available
        .filter((s) => selected.includes(s.currency))
        .map((s) => ({ currency: s.currency, version: s.version }));
      if (!versions.length) throw new Error('ເລືອກ QR ທີ່ເປີດໃຊ້ / Select an enabled payment QR');
      const result = await api<{ attachments: PaymentQrAttachment[] }>(
        '/payment-qr/check',
        'POST',
        { versions },
      );
      await Promise.all(
        result.attachments.map(async (a) => {
          const image = new Image();
          image.src = a.image;
          await image.decode();
        }),
      );
      if (ticket === sequence.current) setAttachments(result.attachments);
    } catch (e) {
      if (ticket === sequence.current) setError(errorMessage(e));
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  useImperativeHandle(
    ref,
    () => ({
      beforePrint: async () => {
        if (!include) return () => {};
        if (busy || !attachments.length)
          throw new Error('ກວດ QR ຮັບເງິນກ່ອນພິມ / Check and attach payment QR before printing');
        const ticket = sequence.current;
        setPrinting(true);
        setError('');
        try {
          const result = await api<{ attachments: PaymentQrAttachment[] }>(
            '/payment-qr/check',
            'POST',
            { versions: attachments.map((a) => ({ currency: a.currency, version: a.version })) },
          );
          if (
            ticket !== sequence.current ||
            result.attachments.some((a, i) => a.imageSha256 !== attachments[i]?.imageSha256)
          )
            throw new Error('Payment QR changed; select again');
          return () => setPrinting(false);
        } catch (e) {
          if (ticket === sequence.current) {
            setAttachments([]);
            setError(errorMessage(e));
            setPrinting(false);
          }
          throw e;
        }
      },
    }),
    [include, attachments, busy],
  );
  const disabled = busy || printing;
  return (
    <>
      <section className="payment-qr-controls no-print" aria-label="Invoice bank payment controls">
        <label className="payment-qr-toggle">
          <input
            aria-label="Include bank payment QR"
            type="checkbox"
            checked={include}
            disabled={disabled}
            onChange={(e) => {
              setInclude(e.target.checked);
              setAttachments([]);
              setError('');
              sequence.current++;
            }}
          />
          ໃສ່ QR ຮັບເງິນ / Include bank payment QR
        </label>
        {include && (
          <>
            <p>
              QR ຈາກການຕັ້ງຄ່າຮ້ານປັດຈຸບັນ / Uses current shop payment details. The stored original
              PDF keeps its original details.
            </p>
            {!available.length && (
              <p>ເຈົ້າຂອງຍັງບໍ່ເປີດ QR / Ask the owner to configure and enable a payment QR.</p>
            )}
            {available.map((s) => (
              <label className="payment-qr-toggle" key={s.currency}>
                <input
                  aria-label={'Use bank QR ' + s.currency}
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(s.currency)}
                  onChange={(e) => {
                    sequence.current++;
                    setAttachments([]);
                    setSelected((old) =>
                      e.target.checked ? [...old, s.currency] : old.filter((c) => c !== s.currency),
                    );
                  }}
                />
                {s.currency} · {s.reference?.bankName} · {s.reference?.receiverName}
              </label>
            ))}
            <button
              disabled={disabled || !available.some((s) => selected.includes(s.currency))}
              onClick={() => void attach()}
            >
              ກວດແລະໃສ່ / Check and attach payment QR
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                sequence.current++;
                setAttachments([]);
                setError('');
                setTick((t) => t + 1);
              }}
            >
              Reload current payment QR
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      {include && <PaymentQrCards items={attachments} />}
    </>
  );
}
