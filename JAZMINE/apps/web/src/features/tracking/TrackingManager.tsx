import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { LinkView } from '../../../../../packages/contracts/src/tracking';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import { CommandResult, shopDate } from '../settlements/CommandResult';
export function TrackingManager({
  orderId,
  disabled,
  onFreeze,
  onLinkAvailable,
}: {
  orderId: string;
  disabled: boolean;
  onFreeze: (frozen: boolean) => void;
  onLinkAvailable?: (url: string | null) => void;
}) {
  const [link, setLink] = useState<LinkView>(null),
    [url, setUrl] = useState(''),
    [qr, setQr] = useState(''),
    [reason, setReason] = useState(''),
    [days, setDays] = useState(30),
    [tick, setTick] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const refresh = () => setTick((t) => t + 1),
    command = useRecordedCommand<{ token?: string }>(refresh, onFreeze);
  useEffect(() => {
    let active = true;
    void api<{ link: LinkView }>(`/tracking/orders/${orderId}`)
      .then((r) => {
        if (active) setLink(r.link);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [orderId, tick]);
  useEffect(() => {
    let active = true;
    setQr('');
    if (url)
      void QRCode.toDataURL(url, { width: 240, margin: 2 })
        .then((value) => {
          if (active) setQr(value);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <section className="panel pricing-panel">
      <h2>ລິງຕິດຕາມລູກຄ້າ / Customer tracking</h2>
      <p>ລູກຄ້າຕ້ອງຢືນຢັນເບີໂທ · ສ້າງໃໝ່ແລ້ວລິງເກົ່າຈະໃຊ້ບໍ່ໄດ້</p>
      {link && (
        <p>
          {link.revokedAt
            ? 'ປິດລິງແລ້ວ / Revoked'
            : 'ໝົດອາຍຸ / Expires: ' + shopDate(link.expiresAt)}
        </p>
      )}
      <fieldset
        className="draft-fields settlement-fields"
        disabled={disabled || command.busy || !!command.pending}
      >
        <label>
          ອາຍຸລິງ / Days
          <input
            aria-label="Tracking days"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Tracking link reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!reason.trim()}
          onClick={() => {
            setUrl('');
            setMessage('');
            onLinkAvailable?.(null);
            void command.send(
              `/tracking/orders/${orderId}/issue`,
              { requestId: crypto.randomUUID(), reason, days },
              (r) => {
                if (r.token) {
                  setUrl(`${location.origin}/#track=${r.token}`);
                  onLinkAvailable?.(`${location.origin}/#track=${r.token}`);
                  setMessage('ລິງສະແດງຄັ້ງດຽວ ກະລຸນາຄັດລອກ / Copy this link now');
                } else
                  setMessage(
                    'ບັນທຶກແລ້ວ ແຕ່ກູ້ລິງລັບບໍ່ໄດ້ · ສ້າງລິງໃໝ່ / Saved; create a replacement link',
                  );
              },
            );
          }}
        >
          ສ້າງ/ປ່ຽນລິງ / Create replacement link
        </button>
        {link && !link.revokedAt && (
          <button
            disabled={!reason.trim()}
            onClick={() =>
              void command.send(
                `/tracking/orders/${orderId}/revoke`,
                { requestId: crypto.randomUUID(), reason },
                () => {
                  setUrl('');
                  onLinkAvailable?.(null);
                  setMessage('ປິດລິງແລ້ວ / Link revoked');
                },
              )
            }
          >
            ປິດລິງ / Revoke link
          </button>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <CommandResult command={command} />
      {message && <p role="status">{message}</p>}
      {url && (
        <div>
          <label>
            Tracking link
            <input aria-label="Customer tracking link" readOnly value={url} />
          </label>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => setMessage('ຄັດລອກແລ້ວ / Copied'))
                .catch(() => setMessage('ກະລຸນາເລືອກລິງແລະຄັດລອກເອງ / Select and copy'));
            }}
          >
            Copy link
          </button>
          <a href={url} target="_blank" rel="noreferrer">
            ເປີດທົດລອງ / Open preview
          </a>
          {qr && (
            <img
              width={240}
              height={240}
              style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
              src={qr}
              alt="Customer tracking QR"
            />
          )}
        </div>
      )}
    </section>
  );
}
