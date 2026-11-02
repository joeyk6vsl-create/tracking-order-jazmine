import { useState } from 'react';
import type { DraftView } from '../../../../../packages/contracts/src/orders';
import type {
  ConfirmedOrder,
  OrderReadiness,
} from '../../../../../packages/contracts/src/confirmation';
import { api, ApiError, errorMessage } from '../../services/api';
import { InvoiceView } from './InvoiceView';
export function ConfirmationPanel({ draft }: { draft: DraftView }) {
  const [dueDate, setDueDate] = useState(''),
    [reason, setReason] = useState(''),
    [checked, setChecked] = useState<OrderReadiness | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [order, setOrder] = useState<ConfirmedOrder | null>(null);
  async function check() {
    setBusy(true);
    setChecked(null);
    setError('');
    try {
      setChecked(
        await api<OrderReadiness>('/orders/check', 'POST', {
          draftId: draft.id,
          rowVersion: draft.rowVersion,
          dueDate,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!checked) return;
    setBusy(true);
    setError('');
    try {
      setOrder(
        (
          await api<{ order: ConfirmedOrder }>('/orders/confirm', 'POST', {
            draftId: draft.id,
            rowVersion: draft.rowVersion,
            dueDate,
            checkToken: checked.checkToken,
            reason,
          })
        ).order,
      );
      setUncertain(false);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) setUncertain(true);
      else {
        setUncertain(false);
        setChecked(null);
      }
    } finally {
      setBusy(false);
    }
  }
  if (order)
    return (
      <>
        <p className="alert" role="status">
          ยืนยันสำเร็จ · {order.orderNumber} · ฉบับ {order.revision}
        </p>
        <InvoiceView order={order} />
      </>
    );
  return (
    <section className="panel pricing-panel">
      <h2>ตรวจความพร้อมและยืนยันออเดอร์</h2>
      <p>
        ตรวจราคาล่าสุด ความพร้อมผ้า และไฟล์ก่อนออกเลขจริง หากยืนยันร่างนี้ไปแล้ว
        การยืนยันร่างฉบับที่แก้ใหม่จะเก็บเป็นออเดอร์ฉบับใหม่ภายใต้เลขเดิม
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {uncertain && <p>ยังตรวจผลการยืนยันไม่ได้ ใช้ปุ่มลองยืนยันคำขอเดิม ระบบจะไม่สร้างเลขซ้ำ</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label>
          กำหนดส่งสินค้า
          <input
            aria-label="กำหนดส่งสินค้า"
            type="date"
            required
            disabled={busy || uncertain}
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setChecked(null);
            }}
          />
        </label>
        <button disabled={busy || uncertain}>ตรวจความพร้อมก่อนยืนยัน</button>
      </form>
      {checked && (
        <div role="status">
          {checked.ready ? (
            <p>
              ตรวจผ่าน · ยอดที่กำลังจะยืนยัน {checked.snapshot.pricing.total?.toLocaleString()} กีบ
              · กำหนดส่ง {checked.snapshot.dueDate}
            </p>
          ) : (
            <ul>
              {checked.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          {checked.warnings.map((w) => (
            <p className="alert warning" key={w}>
              {w}
            </p>
          ))}
          {checked.ready && (
            <>
              <p>{checked.snapshot.selections.map((i) => i.name).join(' · ')}</p>
              <p>
                ราคา {checked.snapshot.pricing.revision} · ซื้อ {checked.snapshot.pricing.quantity}{' '}
                · แถม {checked.snapshot.pricing.freeQuantity} · รวม{' '}
                {checked.snapshot.pricing.productionQuantity}
              </p>
              <label>
                เหตุผลการยืนยันหรือแก้ฉบับ
                <input
                  aria-label="เหตุผลการยืนยัน"
                  maxLength={500}
                  disabled={busy || uncertain}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !reason.trim()}
                onClick={() => void confirm()}
              >
                {uncertain ? 'ลองยืนยันคำขอเดิม' : 'ยืนยันออเดอร์'}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
