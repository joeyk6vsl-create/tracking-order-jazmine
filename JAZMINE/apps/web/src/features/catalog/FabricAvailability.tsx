import { useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api, errorMessage } from '../../services/api';
export function FabricAvailability({
  item,
  owner,
  onSaved,
}: {
  item: CatalogItem;
  owner: boolean;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(item.availability),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/catalog/${item.id}/availability`, 'PUT', {
        rowVersion: item.rowVersion,
        status,
        reason,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel pricing-panel">
      <h2>ความพร้อมของผ้า</h2>
      <p>สถานะพร้อมใช้แยกจากราคา ผ้าหมดหรือยังไม่ระบุสถานะจะยืนยันออเดอร์ไม่ได้</p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          สถานะผ้า
          <select
            aria-label="สถานะผ้า"
            disabled={!owner || busy}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="UNKNOWN">ยังไม่ระบุ</option>
            <option value="AVAILABLE">พร้อมใช้</option>
            <option value="LOW_STOCK">ใกล้หมด</option>
            <option value="OUT_OF_STOCK">หมด</option>
          </select>
        </label>
        {owner && (
          <>
            <label>
              เหตุผลที่เปลี่ยนสถานะผ้า
              <input
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              บันทึกสถานะผ้า
            </button>
          </>
        )}
      </form>
    </section>
  );
}
