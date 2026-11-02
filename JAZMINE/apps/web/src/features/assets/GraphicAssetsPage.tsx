import { useEffect, useState } from 'react';
import type { GraphicQueueItem } from '../../../../../packages/contracts/src/assets';
import { api, errorMessage } from '../../services/api';
import { DraftAssetsPanel } from './DraftAssetsPanel';
export function GraphicAssetsPage() {
  const [drafts, setDrafts] = useState<GraphicQueueItem[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void api<{ drafts: GraphicQueueItem[] }>('/graphic-assets/queue')
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
  return (
    <>
      <h1>ไฟล์และงานกราฟิก</h1>
      <p>เลือกร่างที่บันทึกไว้เพื่อตรวจไฟล์ · แสดงร่างล่าสุดสูงสุด 50 รายการ</p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">กำลังโหลด…</p>
      ) : (
        <label>
          ร่างที่ต้องตรวจ
          <select
            aria-label="ร่างที่ต้องตรวจ"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">เลือกร่าง</option>
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.customerName} · {d.id.slice(-8)} · ร่างฉบับ {d.rowVersion}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && <DraftAssetsPanel key={selected} draftId={selected} />}
    </>
  );
}
