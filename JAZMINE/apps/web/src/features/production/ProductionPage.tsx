import { useEffect, useState } from 'react';
import type {
  ProductionContext,
  SheetView,
  SheetDetail,
} from '../../../../../packages/contracts/src/production';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { SheetEditor } from './SheetEditor';
import { RevisionReviewPanel } from './RevisionReviewPanel';
export function ProductionPage() {
  const { session } = useSession(),
    canPrepare = session!.permissions.includes('graphic.approve');
  const [orders, setOrders] = useState<ProductionContext[]>([]),
    [context, setContext] = useState<ProductionContext | null>(null),
    [sheets, setSheets] = useState<SheetView[]>([]),
    [detail, setDetail] = useState<SheetDetail | null>(null),
    [editor, setEditor] = useState(false),
    [key, setKey] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api<{ orders: ProductionContext[] }>('/production/orders')
      .then(async (r) => {
        if (alive) setOrders(r.orders);
        const id = new URLSearchParams(location.search).get('prepareSheet');
        if (id && /^[\da-f-]{36}$/i.test(id)) {
          const data = await api<SheetDetail>(`/production/sheets/${id}`),
            list = await api<{ context: ProductionContext; sheets: SheetView[] }>(
              `/production/orders/${data.sheet.orderId}`,
            );
          if (alive) {
            setContext(list.context);
            setSheets(list.sheets);
            setDetail(data);
            setEditor(true);
            setKey((k) => k + 1);
          }
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function select(id: string) {
    setBusy(true);
    setEditor(false);
    setDetail(null);
    setError('');
    try {
      const data = await api<{ context: ProductionContext; sheets: SheetView[] }>(
        `/production/orders/${id}`,
      );
      setContext(data.context);
      setSheets(data.sheets);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      const data = await api<SheetDetail>(`/production/sheets/${id}`),
        list = await api<{ context: ProductionContext; sheets: SheetView[] }>(
          `/production/orders/${data.sheet.orderId}`,
        );
      setDetail(data);
      setContext(list.context);
      setSheets(list.sheets);
      setEditor(true);
      setKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>เตรียมใบผลิต</h1>
      <p>
        แบ่งจำนวนตามรายการและไซซ์ รวมของแถม ไม่เกินออเดอร์ · เจ้าของและกราฟิกเตรียมงาน
        แอดมินเปิดดูได้
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <label>
        ออเดอร์ที่ต้องเตรียม
        <select
          aria-label="ออเดอร์ที่ต้องเตรียม"
          disabled={busy}
          value={context?.orderId ?? ''}
          onChange={(e) => {
            if (e.target.value) void select(e.target.value);
          }}
        >
          <option value="">เลือกออเดอร์ยืนยัน</option>
          {orders.map((o) => (
            <option key={o.orderId} value={o.orderId}>
              {o.orderNumber} · {o.customerName} · ฉบับ {o.revision}
            </option>
          ))}
        </select>
      </label>
      {context && (
        <section className="panel pricing-panel">
          <h2>ชุดใบผลิตของ {context.orderNumber}</h2>
          <p>
            กำหนดส่ง {context.dueDate} · ใบผลิตอ้างอิงออเดอร์ที่ยืนยัน
            ไม่แสดงราคาขายให้ผู้เตรียมกราฟิก
          </p>
          {sheets.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => void open(s.id)}>
              {s.sheetNumber ?? 'ร่าง ' + s.id.slice(-8)} ·{' '}
              {s.state === 'READY' ? 'พร้อม' : s.state === 'CANCELLED' ? 'ยกเลิก' : 'ร่าง'} ·
              ออเดอร์ฉบับ {s.orderRevision}
            </button>
          ))}
          {canPrepare && (
            <button
              disabled={busy}
              className="primary"
              onClick={() => {
                setDetail(null);
                setEditor(true);
                setKey((k) => k + 1);
              }}
            >
              สร้างใบผลิตร่างใหม่
            </button>
          )}
        </section>
      )}
      {editor && context && (
        <SheetEditor
          key={key}
          context={detail?.context ?? context}
          detail={detail}
          sheets={sheets}
          canPrepare={canPrepare}
          onSaved={open}
        />
      )}
      {context && (
        <RevisionReviewPanel
          key={context.orderId}
          orderId={context.orderId}
          revision={context.revision}
          onApplied={() => select(context.orderId)}
        />
      )}
    </>
  );
}
