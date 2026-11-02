import { useEffect, useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { CatalogChoicesForm } from './CatalogChoicesForm';
import { FabricAvailability } from './FabricAvailability';
import { CatalogEditor } from './CatalogEditor';
import { CatalogImage } from './CatalogImage';

function CatalogCard({ item, onEdit }: { item: CatalogItem; onEdit: () => void }) {
  return (
    <button
      aria-label={item.name}
      className={'panel catalog-card ' + (!item.hasImage ? 'fabric-option' : '')}
      onClick={onEdit}
    >
      <CatalogImage item={item} />
      <strong>{item.name}</strong>
      {!item.active && <span>ปิดใช้งาน</span>}
      {item.notes && <p>{item.notes}</p>}
    </button>
  );
}
export function CatalogPage() {
  const { session } = useSession();
  const canEdit = session!.permissions.includes('users.manage');
  const [items, setItems] = useState<CatalogItem[]>([]),
    [cursor, setCursor] = useState<string | undefined>(),
    [next, setNext] = useState<string | null>(null),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [editor, setEditor] = useState<CatalogItem | null | undefined>(undefined);
  const [kind, setKind] = useState('IMPORTED');
  const [options, setOptions] = useState<CatalogItem[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<{ items: CatalogItem[]; next: string | null }>(
        '/catalog' + (cursor ? '?after=' + cursor : ''),
      ),
      api<{ items: CatalogItem[] }>('/catalog/options'),
    ])
      .then(([r, attached]) => {
        if (alive) {
          setItems(r.items);
          setOptions(attached.items);
          setNext(r.next);
          setError('');
        }
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
  }, [cursor, reload]);
  function refresh() {
    setEditor(undefined);
    setLoading(true);
    setReload((n) => n + 1);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>สินค้าและชนิดผ้า</h1>
          <p>คอเสื้อ → เนื้อผ้า → ส่วนประกอบ · กดเพื่อดูรายละเอียดและแก้ไข · ยังไม่กำหนดราคา</p>
        </div>
        {canEdit && (
          <button className="primary" onClick={() => setEditor(null)}>
            เพิ่มรายการ
          </button>
        )}
      </div>
      {editor !== undefined ? (
        <>
          <CatalogEditor
            key={editor ? editor.id + ':' + editor.rowVersion : 'new'}
            item={editor}
            onDone={refresh}
            onSaved={(item) => {
              setEditor(item);
              setReload((n) => n + 1);
            }}
            canEdit={canEdit}
          />
          {editor && editor.kind !== 'FABRIC' && (
            <CatalogChoicesForm
              key={'choices-' + editor.id + ':' + editor.rowVersion}
              item={editor}
              canEdit={canEdit}
              onSaved={refresh}
            />
          )}
          {editor?.kind === 'FABRIC' && (
            <FabricAvailability
              key={'stock-' + editor.id}
              item={editor}
              owner={canEdit}
              onSaved={refresh}
            />
          )}
        </>
      ) : (
        <>
          <label>
            ประเภทที่แสดง
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="IMPORTED">รูปและชื่อผ้าจากไฟล์ที่นำเข้า</option>
              <option value="ALL">จัดการรายการทั้งหมด</option>
              <option value="PRODUCT">สินค้า</option>
              <option value="FABRIC">ชนิดผ้า</option>
              <option value="COMPONENT">ส่วนประกอบเสื้อ</option>
            </select>
          </label>
          {loading ? (
            <p role="status">กำลังโหลด…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <>
              {kind === 'IMPORTED' && options.length > 0 ? (
                <div className="imported-catalog">
                  {options.some((i) => !i.sourceKey && i.kind !== 'FABRIC') && (
                    <section className="panel catalog-section">
                      <h2>ລາຍການທີ່ເພີ່ມ / Added items</h2>
                      <div className="option-grid">
                        {options
                          .filter((i) => !i.sourceKey && i.kind !== 'FABRIC')
                          .map((i) => (
                            <CatalogCard key={i.id} item={i} onEdit={() => setEditor(i)} />
                          ))}
                      </div>
                    </section>
                  )}
                  <section className="panel catalog-section">
                    <h2>ຄໍເສື້ອ · แบบคอเสื้อ</h2>
                    {[1, 2, 3].map((group) => (
                      <div className="collar-group" key={group}>
                        <h3>ชุด {group}</h3>
                        <div className="option-grid">
                          {options
                            .filter((i) => i.section === 'COLLAR' && i.displayGroup === group)
                            .map((i) => (
                              <CatalogCard key={i.id} item={i} onEdit={() => setEditor(i)} />
                            ))}
                        </div>
                      </div>
                    ))}
                  </section>
                  <section className="panel catalog-section">
                    <h2>ເນື້ອຜ້າ · ชนิดผ้า</h2>
                    <p className="muted">ยังไม่กำหนดราคา</p>
                    <div className="option-grid fabric-grid">
                      {options
                        .filter((i) => i.kind === 'FABRIC')
                        .map((i) => (
                          <CatalogCard key={i.id} item={i} onEdit={() => setEditor(i)} />
                        ))}
                    </div>
                  </section>
                  <section className="panel catalog-section">
                    <h2>ส่วนประกอบเสื้อ</h2>
                    {[
                      { label: 'ແຂນເສື້ອ · แขนเสื้อ', prefix: 'ແຂນ' },
                      { label: 'ປາຍແຂນ · ปลายแขน', prefix: 'ປາຍແຂນ' },
                      { label: 'ບ່າ · บ่าเสื้อ', prefix: 'ບ່າ' },
                    ].map((group) => (
                      <div key={group.prefix}>
                        <h3>{group.label}</h3>
                        <div className="option-grid">
                          {options
                            .filter((i) => i.section === 'PART' && i.name.startsWith(group.prefix))
                            .map((i) => (
                              <CatalogCard key={i.id} item={i} onEdit={() => setEditor(i)} />
                            ))}
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
              ) : (
                <>
                  <div className="catalog-grid">
                    {items
                      .filter((i) => kind === 'ALL' || kind === 'IMPORTED' || i.kind === kind)
                      .map((i) => (
                        <CatalogCard key={i.id} item={i} onEdit={() => setEditor(i)} />
                      ))}
                  </div>
                  {!items.length && (
                    <p>ยังไม่มีรายการ เจ้าของสามารถเริ่มเพิ่มสินค้าและชนิดผ้าได้</p>
                  )}
                  <button
                    disabled={!cursor}
                    onClick={() => {
                      setLoading(true);
                      setCursor(undefined);
                    }}
                  >
                    หน้าแรก
                  </button>
                  <button
                    disabled={!next}
                    onClick={() => {
                      setLoading(true);
                      setCursor(next!);
                    }}
                  >
                    หน้าถัดไป
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
      <p className="muted">ภาพนี้ใช้ช่วยเลือกสินค้า ยังไม่ใช่ไฟล์งานสำหรับผลิต</p>
    </>
  );
}
