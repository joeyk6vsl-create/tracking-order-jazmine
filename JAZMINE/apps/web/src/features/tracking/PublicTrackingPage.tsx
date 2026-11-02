import { useEffect, useState } from 'react';
import {
  requestKinds,
  requestLabels,
  type TrackingView,
} from '../../../../../packages/contracts/src/tracking';
import { WORK_STAGE_LABELS as WORK_LABELS } from '../../../../../packages/contracts/src/production-work';
import { api, ApiError, errorMessage } from '../../services/api';
import { CommandResult, shopDate } from '../settlements/CommandResult';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import './tracking.css';
function Mockup({ token }: { token: string }) {
  const [image, setImage] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      url = '';
    void fetch('/api/v1/public-tracking/mockup', {
      cache: 'no-store',
      headers: { 'X-Tracking-Token': token },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('ຮູບໃຊ້ບໍ່ໄດ້ / Image unavailable');
        return r.blob();
      })
      .then((blob) => {
        if (active) {
          url = URL.createObjectURL(blob);
          setImage(url);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token]);
  return (
    <>
      {image && <img className="public-mockup" src={image} alt="Approved mockup" />}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function RequestForm({
  token,
  onChanged,
  cancelled,
}: {
  token: string;
  onChanged: () => void;
  cancelled: boolean;
}) {
  const [kind, setKind] = useState<(typeof requestKinds)[number]>('GENERAL'),
    [text, setText] = useState(''),
    [frozen, setFrozen] = useState(false),
    [message, setMessage] = useState('');
  // ส่ง header แยกลิงก์ปัจจุบัน ป้องกันแท็บคนละออเดอร์ใช้ session สลับกัน
  const command = useRecordedCommand(onChanged, setFrozen);
  return (
    <form
      className="panel pricing-panel"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage('');
        void command.send(
          '/public-tracking/requests',
          { requestId: crypto.randomUUID(), kind, message: text },
          () => {
            setText('');
            setMessage('ສົ່ງຄຳຂໍແລ້ວ / Request sent');
          },
          { 'X-Tracking-Token': token },
        );
      }}
    >
      <h2>ສົ່ງຄຳຂໍ / Contact the shop</h2>
      <p>ຮ້ານຈະກວດກ່ອນ · ບໍ່ປ່ຽນອໍເດີ ຫຼື ຈັດສົ່ງອັດຕະໂນມັດ</p>
      <fieldset className="draft-fields" disabled={frozen || command.busy}>
        <label>
          ປະເພດ / Type
          <select
            aria-label="Customer request type"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {requestKinds
              .filter((k) => !cancelled || k === 'GENERAL')
              .map((k) => (
                <option key={k} value={k}>
                  {requestLabels[k]}
                </option>
              ))}
          </select>
        </label>
        <label>
          ຂໍ້ຄວາມ / Message
          <textarea
            aria-label="Customer request message"
            required
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!text.trim()}>
          ສົ່ງຄຳຂໍ / Send request
        </button>
      </fieldset>
      <CommandResult command={command} />
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function PublicTrackingPage({ token }: { token: string }) {
  const [phone, setPhone] = useState(''),
    [view, setView] = useState<TrackingView | null>(null),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => {
    if (!verified) return;
    let active = true;
    void api<TrackingView>('/public-tracking/view', 'GET', undefined, { 'X-Tracking-Token': token })
      .then((r) => {
        if (active) {
          setView(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setView(null);
          if (e instanceof ApiError && [401, 403].includes(e.status)) setVerified(false);
        }
      });
    return () => {
      active = false;
    };
  }, [verified, tick, token]);
  useEffect(() => {
    if (!verified) return;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [verified]);
  async function verify() {
    setBusy(true);
    setError('');
    try {
      await api('/public-tracking/verify', 'POST', { token, phone });
      setPhone('');
      setVerified(true);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-tracking">
      <header>
        <span className="section-label">JAZMINE SPORTSWEAR</span>
        <h1>ຕິດຕາມອໍເດີ / Track your order</h1>
      </header>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!verified && (
        <form
          className="panel pricing-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <h2>ຢືນຢັນເບີໂທ / Verify phone</h2>
          <p>ໃຊ້ເບີໂທທີ່ແຈ້ງຮ້ານໄວ້ໃນອໍເດີ</p>
          <label>
            ເບີໂທ / Phone
            <input
              aria-label="Tracking phone"
              type="tel"
              required
              maxLength={40}
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="primary" disabled={busy}>
            ຢືນຢັນ / Verify
          </button>
        </form>
      )}
      {verified && !view && <p role="status">ກຳລັງໂຫຼດ / Loading…</p>}
      {verified && view && (
        <>
          <section className="panel pricing-panel">
            <h2>{view.orderNumber}</h2>
            <p>
              {view.customerName} · ກຳນົດສົ່ງ / Due: {view.dueDate}
            </p>
            <ul>
              {view.items.map((item, i) => (
                <li key={i}>
                  {item.name} · Size {item.size} × {item.quantity}
                </li>
              ))}
            </ul>
            <p>
              ຈຳນວນລວມ / Total {view.quantity} · ພ້ອມສົ່ງ / Ready {view.readyQuantity} ·
              ຮ້ານຢືນຢັນສົ່ງ / Delivery confirmed {view.confirmedQuantity}
            </p>
            <p>
              ການຈ່າຍ / Payment:{' '}
              {view.orderState === 'CANCELLED'
                ? 'ຍົກເລີກອໍເດີແລ້ວ ຕິດຕໍ່ຮ້ານເລື່ອງເງິນ / Order cancelled; contact the shop about payment'
                : view.payment === 'PAID'
                  ? 'ຈ່າຍຄົບ / Paid'
                  : view.payment === 'UNPAID'
                    ? 'ຍັງບໍ່ຈ່າຍ / Unpaid'
                    : 'ຈ່າຍບາງສ່ວນ / Partially paid'}
            </p>
            <button onClick={refresh}>Refresh status</button>
          </section>
          <section className="panel pricing-panel">
            <h2>ຄວາມຄືບໜ້າ / Progress</h2>
            <ol className="public-progress">
              {view.production.map((stage) => (
                <li key={stage.stage}>
                  <strong>{WORK_LABELS[stage.stage]}</strong>
                  <span>
                    {stage.state === 'COMPLETED'
                      ? 'ສຳເລັດ / Completed'
                      : stage.state === 'IN_PROGRESS'
                        ? 'ກຳລັງເຮັດ / In progress'
                        : 'ລໍຖ້າ / Waiting'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {view.hasMockup && (
            <section className="panel pricing-panel">
              <h2>ແບບທີ່ອະນຸມັດ / Approved mockup</h2>
              <Mockup token={token} />
            </section>
          )}
          {view.deliveries.length > 0 && (
            <section className="panel pricing-panel">
              <h2>ການສົ່ງ / Deliveries · Latest 50</h2>
              {view.deliveries.map((d, i) => (
                <p key={i}>
                  {d.method === 'CUSTOMER_PICKUP' ? 'ຮັບເອງ / Pickup' : 'ຮ້ານຈັດສົ່ງ / Delivery'} ×{' '}
                  {d.quantity} · {d.carrier} · {d.tracking}
                  {d.confirmedInAdvance && ' · ຮ້ານບັນທຶກລ່ວງໜ້າ / Confirmed in advance'}
                </p>
              ))}
            </section>
          )}
          <RequestForm
            key={view.orderState}
            token={token}
            onChanged={refresh}
            cancelled={view.orderState === 'CANCELLED'}
          />
          <section className="panel pricing-panel">
            <h2>ຄຳຂໍຂອງທ່ານ / Your requests · Latest 50</h2>
            {!view.requests.length && <p>No requests</p>}
            {view.requests.map((r) => (
              <article className="tracking-request" key={r.id}>
                <h3>
                  {requestLabels[r.kind]} ·{' '}
                  {r.state === 'SUBMITTED'
                    ? 'ສົ່ງແລ້ວ / Submitted'
                    : r.state === 'UNDER_REVIEW'
                      ? 'ກຳລັງກວດ / Under review'
                      : 'ຕອບແລ້ວ / Resolved'}
                </h3>
                <p className="work-notes">{r.message}</p>
                <p>{shopDate(r.submittedAt)} · Lao time</p>
                {r.response && (
                  <p className="work-notes">
                    {r.outcome} · {r.response}
                  </p>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
