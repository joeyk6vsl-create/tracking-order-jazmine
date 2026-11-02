import { useEffect, useState } from 'react';
import type { ConfirmedOrder } from '../../../../../packages/contracts/src/confirmation';
import { api, errorMessage } from '../../services/api';
import { InvoiceView } from './InvoiceView';
export function ConfirmedOrdersPage() {
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]),
    [history, setHistory] = useState<ConfirmedOrder[]>([]),
    [selected, setSelected] = useState<ConfirmedOrder | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const id = new URLSearchParams(location.search).get('confirmedOrder');
    if (id)
      void api<{ revisions: ConfirmedOrder[] }>(`/orders/${id}/history`)
        .then((r) => {
          if (alive) {
            setHistory(r.revisions);
            setSelected(r.revisions[0]);
          }
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    void api<{ orders: ConfirmedOrder[] }>('/orders')
      .then((r) => {
        if (alive) setOrders(r.orders);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function open(order: ConfirmedOrder) {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ revisions: ConfirmedOrder[] }>(`/orders/${order.id}/history`);
      setHistory(r.revisions);
      setSelected(r.revisions[0]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>ออเดอร์ที่ยืนยันแล้ว</h1>
      <p>
        ออเดอร์ล่าสุดสูงสุด 50 รายการ · เปิดดูฉบับเก่าได้ ·
        การแก้ทำผ่านร่างเดิมพร้อมเหตุผลและตรวจใหม่ก่อนยืนยัน
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">กำลังโหลด…</p>
      ) : !orders.length ? (
        <p>ยังไม่มีออเดอร์ยืนยัน</p>
      ) : (
        orders.map((o) => (
          <button disabled={busy} key={o.id} onClick={() => void open(o)}>
            {o.orderNumber} · {o.snapshot.input.customerName} · ฉบับ {o.revision}
          </button>
        ))
      )}
      {selected && (
        <>
          <label>
            ฉบับออเดอร์
            <select
              aria-label="ฉบับออเดอร์"
              value={selected.revision}
              onChange={(e) =>
                setSelected(history.find((o) => o.revision === Number(e.target.value))!)
              }
            >
              {history.map((o) => (
                <option key={o.revision} value={o.revision}>
                  ฉบับ {o.revision}
                </option>
              ))}
            </select>
          </label>
          {(selected.businessState === 'CANCELLED' || selected.storageState === 'ARCHIVED') && (
            <p className="alert warning">
              {selected.businessState === 'CANCELLED'
                ? 'ຍົກເລີກອໍເດີແລ້ວ / Order cancelled'
                : 'ເກັບໃນ Archive / Archived'}{' '}
              · ເອກະສານເດີມສຳລັບປະຫວັດ / Original document for history
            </p>
          )}
          <InvoiceView order={selected} />
          <a href={`?settlementOrder=${selected.id}`}>ຮັບເງິນ/ສົ່ງສິນຄ້າ / Payments & delivery</a>
        </>
      )}
    </>
  );
}
