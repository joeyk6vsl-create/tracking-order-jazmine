import { useEffect, useState } from 'react';
import type { DraftView } from '../../../../../packages/contracts/src/orders';
import { api, errorMessage } from '../../services/api';
import { DraftEditor } from './DraftEditor';
import { DraftAssetsPanel } from '../assets/DraftAssetsPanel';
import { ConfirmationPanel } from './ConfirmationPanel';
import { QuotationPanel } from '../quotations/QuotationPanel';
import { ActionButton } from '../../components/ActionButton';
import './order-entry.css';
export function OrderDraftsPage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]),
    [selected, setSelected] = useState<DraftView | null>(null),
    [editing, setEditing] = useState(true),
    [stage, setStage] = useState<'quote' | 'files' | 'confirm'>('quote'),
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
    setStage('quote');
    setError('');
  }
  return (
    <>
      <div className="page-heading">
        <h1>ร่างออเดอร์</h1>
        <ActionButton
          action="new"
          className="primary"
          onClick={() => {
            setSelected(null);
            setEditing(true);
            setKey(crypto.randomUUID());
          }}
        >
          สร้างร่างใหม่
        </ActionButton>
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
            <ActionButton action="open" key={d.id} onClick={() => open(d)}>
              {d.input.customerName} · {d.id.slice(-8)}
            </ActionButton>
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
          <section className="order-workflow">
            <div className="panel order-workflow-summary">
              <div>
                <h2>บันทึกร่างแล้ว</h2>
                <strong>{selected.input.customerName}</strong>
                <p className="muted">
                  {selected.input.phone} · {selected.pricing.productionQuantity} ตัว
                </p>
              </div>
              <strong className={selected.pricing.ready ? 'order-total' : 'order-total missing'}>
                {selected.pricing.ready
                  ? `${selected.pricing.total?.toLocaleString()} กีบ`
                  : 'ราคายังไม่ครบ'}
              </strong>
              <details>
                <summary>ดูรายการและราคาโดยละเอียด</summary>
                <p>{selected.selections.map((s) => s.name).join(' · ')}</p>
                <ol>
                  {(selected.input.lines?.length
                    ? selected.input.lines
                    : [selected.input.quote]
                  ).map((line, index) => (
                    <li key={index}>
                      รายการ {index + 1} · ไซซ์ {line.size} · ซื้อ {line.quantity} · แถม{' '}
                      {selected.input.lines?.length
                        ? line.freeQuantity
                        : selected.pricing.freeQuantity}
                    </li>
                  ))}
                </ol>
                {selected.pricing.missing.map((m) => (
                  <p key={m}>{m}</p>
                ))}
                <p>ยอดนี้เป็นผลตอนบันทึก ตรวจอีกครั้งก่อนออกใบหรือยืนยัน</p>
              </details>
            </div>
            <nav className="order-workflow-tabs" role="tablist" aria-label="ขั้นตอนออเดอร์">
              <ActionButton
                action="quote"
                id="order-tab-quote"
                role="tab"
                aria-label="1 ໃບລາຄາ / Quote"
                aria-selected={stage === 'quote'}
                aria-controls="order-panel-quote"
                onClick={() => setStage('quote')}
              >
                1 ໃບລາຄາ<span className="order-tab-en"> / Quote</span>
              </ActionButton>
              <ActionButton
                action="upload"
                id="order-tab-files"
                role="tab"
                aria-label="2 ໄຟລ໌ / Files"
                aria-selected={stage === 'files'}
                aria-controls="order-panel-files"
                onClick={() => setStage('files')}
              >
                2 ໄຟລ໌<span className="order-tab-en"> / Files</span>
              </ActionButton>
              <ActionButton
                action="approve"
                id="order-tab-confirm"
                role="tab"
                aria-label="3 ຢືນຢັນ / Confirm"
                aria-selected={stage === 'confirm'}
                aria-controls="order-panel-confirm"
                onClick={() => setStage('confirm')}
              >
                3 ຢືນຢັນ<span className="order-tab-en"> / Confirm</span>
              </ActionButton>
            </nav>
            <div
              id="order-panel-quote"
              role="tabpanel"
              aria-labelledby="order-tab-quote"
              hidden={stage !== 'quote'}
            >
              <QuotationPanel
                key={'quotation-' + selected.id + selected.rowVersion}
                draft={selected}
              />
              <ActionButton action="next" onClick={() => setStage('files')}>
                ต่อไป: ไฟล์งาน
              </ActionButton>
            </div>
            <div
              id="order-panel-files"
              role="tabpanel"
              aria-labelledby="order-tab-files"
              hidden={stage !== 'files'}
            >
              <DraftAssetsPanel key={selected.id + selected.rowVersion} draftId={selected.id} />
              {selected.input.assetNotes && <p>บันทึกติดตามไฟล์: {selected.input.assetNotes}</p>}
              <ActionButton action="next" onClick={() => setStage('confirm')}>
                ต่อไป: ยืนยันออเดอร์
              </ActionButton>
            </div>
            <div
              id="order-panel-confirm"
              role="tabpanel"
              aria-labelledby="order-tab-confirm"
              hidden={stage !== 'confirm'}
            >
              <ConfirmationPanel
                key={'confirm-' + selected.id + selected.rowVersion}
                draft={selected}
              />
            </div>
            <ActionButton
              action="edit"
              onClick={() => {
                setEditing(true);
                setKey(crypto.randomUUID());
              }}
            >
              แก้ไขร่าง
            </ActionButton>
          </section>
        )
      )}
    </>
  );
}
