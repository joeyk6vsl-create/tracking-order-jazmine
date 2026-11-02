import { useEffect, useState } from 'react';
import type { DraftView } from '../../../../../packages/contracts/src/orders';
import { api, errorMessage } from '../../services/api';
import { DraftEditor } from './DraftEditor';
import { DraftAssetsPanel } from '../assets/DraftAssetsPanel';
import { ConfirmationPanel } from './ConfirmationPanel';
import { QuotationPanel } from '../quotations/QuotationPanel';
export function OrderDraftsPage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]),
    [selected, setSelected] = useState<DraftView | null>(null),
    [editing, setEditing] = useState(true),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void api<{ drafts: DraftView[] }>('/order-drafts')
      .then((r) => {
        if (alive) setDrafts(r.drafts);
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
  function open(d: DraftView) {
    setSelected(d);
    setEditing(false);
    setError('');
  }
  return (
    <>
      <div className="page-heading">
        <h1>ร่างออเดอร์</h1>
        <button
          className="primary"
          onClick={() => {
            setSelected(null);
            setEditing(true);
            setKey(crypto.randomUUID());
          }}
        >
          สร้างร่างใหม่
        </button>
      </div>
      <p>หลายแบบเสื้อและหลายไซซ์ในร่างเดียว · ตรวจความพร้อมแล้วกดยืนยัน จึงได้เลขออเดอร์จริง</p>
      {error && <p role="alert">{error}</p>}
      <details className="panel">
        <summary>ร่างที่บันทึกไว้ล่าสุด (สูงสุด 50 รายการ)</summary>
        {loading ? (
          <p role="status">กำลังโหลด…</p>
        ) : !drafts.length ? (
          <p>ยังไม่มีร่าง</p>
        ) : (
          drafts.map((d) => (
            <button key={d.id} onClick={() => open(d)}>
              {d.input.customerName} · {d.id.slice(-8)}
            </button>
          ))
        )}
      </details>
      {editing ? (
        <DraftEditor
          key={key}
          draft={selected}
          onSaved={(d) => {
            setDrafts((rows) => [d, ...rows.filter((r) => r.id !== d.id)]);
            open(d);
          }}
        />
      ) : (
        selected && (
          <section className="panel">
            <h2>บันทึกร่างแล้ว</h2>
            <p>
              {selected.input.customerName} · {selected.input.phone}
            </p>
            <p>{selected.selections.map((s) => s.name).join(' · ')}</p>
            <ol>
              {(selected.input.lines?.length ? selected.input.lines : [selected.input.quote]).map(
                (line, index) => (
                  <li key={index}>
                    รายการ {index + 1} · ไซซ์ {line.size} · ซื้อ {line.quantity} · แถม{' '}
                    {selected.input.lines?.length
                      ? line.freeQuantity
                      : selected.pricing.freeQuantity}
                  </li>
                ),
              )}
            </ol>
            <p>
              ซื้อ {selected.pricing.quantity} · แถม {selected.pricing.freeQuantity} · รวม{' '}
              {selected.pricing.productionQuantity}
            </p>
            <p>
              ราคาฉบับ {selected.pricing.revision} ·{' '}
              {selected.pricing.ready
                ? `${selected.pricing.total?.toLocaleString()} กีบ`
                : 'ราคายังไม่ครบ'}
            </p>
            {selected.pricing.missing.map((m) => (
              <p key={m}>{m}</p>
            ))}
            <p>ผลคำนวณตอนบันทึก ต้องตรวจข้อมูลใหม่ก่อนยืนยันจริง</p>
            <h3>ตรวจสิ่งที่ยังขาด</h3>
            <QuotationPanel
              key={'quotation-' + selected.id + selected.rowVersion}
              draft={selected}
            />
            <DraftAssetsPanel key={selected.id + selected.rowVersion} draftId={selected.id} />
            {selected.input.assetNotes && <p>บันทึกติดตามไฟล์: {selected.input.assetNotes}</p>}
            <ConfirmationPanel
              key={'confirm-' + selected.id + selected.rowVersion}
              draft={selected}
            />
            <button
              className="primary"
              onClick={() => {
                setEditing(true);
                setKey(crypto.randomUUID());
              }}
            >
              แก้ไขร่าง
            </button>
          </section>
        )
      )}
    </>
  );
}
