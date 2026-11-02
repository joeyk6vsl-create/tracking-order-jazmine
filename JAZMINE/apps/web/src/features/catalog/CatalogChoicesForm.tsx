import { useEffect, useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import type { CatalogChoices } from '../../../../../packages/contracts/src/catalog-choices';
import { api, errorMessage } from '../../services/api';
import { SIZES } from '../../../../../packages/contracts/src/pricing';

export function CatalogChoicesForm({
  item,
  canEdit,
  onSaved,
}: {
  item: CatalogItem;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [data, setData] = useState<CatalogChoices | null>(null),
    [sizes, setSizes] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void api<CatalogChoices>(`/catalog/${item.id}/choices`)
      .then((r) => {
        if (alive) {
          setData(r);
          setSizes(r.sizes.join(', '));
          setSelected(r.fabricIds);
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [item.id]);
  async function save() {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      await api(`/catalog/${item.id}/choices`, 'PUT', {
        rowVersion: data.rowVersion,
        sizes: sizes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        fabricIds: selected,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel choices-panel">
      <h2>ไซซ์และผ้าที่ใช้ได้</h2>
      <p className="muted">กำหนดแยกสำหรับ {item.name} · ยังไม่รวมราคา</p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">{error ? 'กลับไปเปิดรายการใหม่เพื่อลองอีกครั้ง' : 'กำลังโหลดตัวเลือก…'}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={!canEdit || busy}>
            {item.kind === 'PRODUCT' && (
              <div>
                <p>Size · ກົດເລືອກ / Select sizes</p>
                <div className="size-options">
                  {SIZES.map((s) => {
                    const current = sizes
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean);
                    const chosen = current.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={chosen}
                        className={chosen ? 'selected-option' : ''}
                        onClick={() =>
                          setSizes(
                            (chosen ? current.filter((x) => x !== s) : [...current, s]).join(', '),
                          )
                        }
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setSizes(SIZES.join(', '))}>
                  Select all standard sizes
                </button>
                <label>
                  ไซซ์ที่เปิดให้เลือก (คั่นด้วยเครื่องหมาย ,)
                  <input
                    aria-describedby="sizes-help"
                    value={sizes}
                    maxLength={840}
                    onChange={(e) => setSizes(e.target.value)}
                    placeholder="เช่น S, M, L, XL"
                  />
                  <small id="sizes-help">
                    เรียงตามที่กรอก เช่น ไซซ์เด็กหรือไซซ์พิเศษก็ใส่เองได้
                    เว้นว่างหมายถึงยังไม่ได้กำหนด
                  </small>
                </label>
              </div>
            )}
            <fieldset className="fabric-checks">
              <legend>ชนิดผ้าที่อนุญาต</legend>
              <button
                type="button"
                onClick={() => setSelected(data.fabrics.filter((f) => f.active).map((f) => f.id))}
              >
                Select all active fabrics
              </button>
              {!data.fabrics.length && <p>ยังไม่มีรายการผ้า</p>}
              {data.fabrics.map((f) => (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(f.id)}
                    disabled={!f.active && !selected.includes(f.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked ? [...s, f.id] : s.filter((id) => id !== f.id),
                      )
                    }
                  />
                  <span>
                    {f.name}
                    {!f.active ? ' · ปิดใช้งาน (เอาออกก่อนบันทึก)' : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          </fieldset>
          <p>
            {selected.length === 0
              ? 'ยังไม่ได้เลือกผ้าที่ใช้ได้'
              : `เลือกผ้าไว้ ${selected.length} ชนิด`}
          </p>
          {canEdit && (
            <button className="primary" disabled={busy}>
              บันทึกไซซ์และผ้า
            </button>
          )}
          <p className="muted">
            ผ้าที่ปิดใช้งานจะเลือกเพิ่มไม่ได้ ข้อมูลนี้ใช้เตรียมตัวเลือกสำหรับออเดอร์
            ยังไม่ใช่การยืนยันว่าสินค้าพร้อมผลิต
          </p>
        </form>
      )}
    </section>
  );
}
