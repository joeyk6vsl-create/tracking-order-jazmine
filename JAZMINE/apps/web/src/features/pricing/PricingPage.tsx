import { useEffect, useState } from 'react';
import { CUSTOMER_GROUPS } from '../../../../../packages/contracts/src/customers';
import {
  PRICE_GROUPS,
  SIZES,
  type PricingView,
  type QuoteResult,
  type PricingQuote,
  quoteSchema,
} from '../../../../../packages/contracts/src/pricing';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import type { CatalogChoices } from '../../../../../packages/contracts/src/catalog-choices';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { PricingExtras } from './PricingExtras';
import { QuoteParts } from './QuoteParts';
import { ProductPicker } from './ProductPicker';
import { ProductOptions } from './ProductOptions';
import { ProductPriceGroups } from './ProductPriceGroups';
import { CatalogChoicesForm } from '../catalog/CatalogChoicesForm';

export function PricingPage({
  onSaveDraft,
  initialGroup = 'RETAIL',
  lineMode = false,
}: {
  onSaveDraft?: (quote: PricingQuote) => Promise<void>;
  initialGroup?: string;
  lineMode?: boolean;
}) {
  const { session } = useSession(),
    owner = session!.permissions.includes('users.manage');
  const [view, setView] = useState<PricingView | null>(null),
    [items, setItems] = useState<CatalogItem[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState('');
  const [product, setProduct] = useState(''),
    [choices, setChoices] = useState<CatalogChoices | null>(null),
    [size, setSize] = useState(''),
    [fabric, setFabric] = useState(''),
    [group, setGroup] = useState(initialGroup),
    [quantity, setQuantity] = useState('1'),
    [free, setFree] = useState('0'),
    [percent, setPercent] = useState('0'),
    [fixed, setFixed] = useState('0'),
    [result, setResult] = useState<QuoteResult | null>(null);
  const [parts, setParts] = useState<{ componentId: string; fabricId?: string }[]>([]);
  const [currency, setCurrency] = useState('LAK');
  const [applyBuyGet, setApplyBuyGet] = useState(false);
  function currentInput() {
    return quoteSchema.parse({
      productId: product,
      fabricId: fabric,
      size,
      group,
      quantity: Number(quantity),
      freeQuantity: Number(free),
      percent: lineMode ? 0 : Number(percent),
      fixed: lineMode ? 0 : Number(fixed),
      parts,
      currency,
      applyBuyGet: lineMode ? false : applyBuyGet,
    });
  }
  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      await onSaveDraft!(currentInput());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<PricingView>('/pricing'),
      api<{ items: CatalogItem[] }>('/catalog/options'),
    ])
      .then(([pricing, catalog]) => {
        if (alive) {
          setView(pricing);
          setItems(catalog.items);
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function choose(id: string) {
    setProduct(id);
    setChoices(null);
    setSize('');
    setFabric('');
    setResult(null);
    setError('');
    if (!id) return;
    setBusy(true);
    try {
      setChoices(await api<CatalogChoices>(`/catalog/${id}/choices`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!view) return;
    setBusy(true);
    setError('');
    try {
      await api('/pricing', 'PUT', { ...{ revision: view.revision, config: view.config }, reason });
      setView(await api<PricingView>('/pricing'));
      setReason('');
      setResult(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function quote() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api<QuoteResult>('/pricing/quote', 'POST', {
          productId: product,
          fabricId: fabric,
          size,
          group,
          quantity: Number(quantity),
          freeQuantity: Number(free),
          applyBuyGet: lineMode ? false : applyBuyGet,
          percent: lineMode ? 0 : Number(percent),
          fixed: lineMode ? 0 : Number(fixed),
          parts,
          currency,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!view)
    return (
      <section className="panel">
        <h1>ราคาและส่วนลด</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'กำลังโหลดราคาจากเอกสาร…'}</p>
      </section>
    );
  return (
    <>
      <h1>ราคาและส่วนลด</h1>
      <p>ราคาตามเอกสาร Phase 3 · หน่วยกีบ (LAK) · ฉบับ {view.revision}</p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!onSaveDraft && (
        <section className="panel pricing-panel">
          <h2>ราคาพื้นฐานตามกลุ่มคอเสื้อ</h2>
          <p className="muted">บนมือถือเลื่อนตารางไปด้านข้างเพื่อดูราคาให้ครบทุกกลุ่ม</p>
          <p>ระดับตัวแทน 4 ราคาต่ำกว่าระดับ 3 ตามเอกสาร · กลุ่มราคาแยกจากลำดับรูป</p>
          <div className="pricing-scroll">
            <table>
              <thead>
                <tr>
                  <th>กลุ่มลูกค้า</th>
                  {PRICE_GROUPS.map((g) => (
                    <th key={g}>{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CUSTOMER_GROUPS.map((g) => (
                  <tr key={g}>
                    <th>{g === 'RETAIL' ? 'ขายปลีก' : `ตัวแทน ${g.at(-1)}`}</th>
                    {view.config.base[g].map((amount, index) => (
                      <td key={index}>
                        <input
                          aria-label={`ราคา ${g} ${PRICE_GROUPS[index]}`}
                          type="number"
                          min="0"
                          max="100000000"
                          disabled={!owner || busy}
                          value={amount}
                          onChange={(e) => {
                            const next = structuredClone(view);
                            next.config.base[g][index] = Number(e.target.value);
                            setView(next);
                            setResult(null);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>ดูและแก้ราคาเพิ่มตามไซซ์</summary>
            <div className="pricing-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ไซซ์</th>
                    {CUSTOMER_GROUPS.map((g) => (
                      <th key={g}>{g === 'RETAIL' ? 'ขายปลีก' : `ตัวแทน ${g.at(-1)}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIZES.map((s) => (
                    <tr key={s}>
                      <th>{s}</th>
                      {CUSTOMER_GROUPS.map((g) => (
                        <td key={g}>
                          <input
                            aria-label={`เพิ่มไซซ์ ${g} ${s}`}
                            type="number"
                            min="0"
                            max="100000000"
                            disabled={!owner || busy}
                            value={view.config.size[g][s]}
                            onChange={(e) => {
                              const next = structuredClone(view);
                              next.config.size[g][s] = Number(e.target.value);
                              setView(next);
                              setResult(null);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>ราคาเพิ่มของผ้า — ยังไม่มีราคาในเอกสาร</summary>
            <p>ว่าง = ยังไม่กำหนด · 0 = เจ้าของยืนยันว่าไม่คิดเพิ่ม</p>
            <div className="pricing-fields">
              {items
                .filter((i) => i.kind === 'FABRIC')
                .map((f) => (
                  <label key={f.id}>
                    {f.name}
                    <input
                      aria-label={`เพิ่มผ้า ${f.name}`}
                      type="number"
                      min="0"
                      max="100000000"
                      disabled={!owner || busy}
                      value={view.config.adjustments[f.id] ?? ''}
                      onChange={(e) => {
                        const next = structuredClone(view);
                        if (e.target.value === '') delete next.config.adjustments[f.id];
                        else next.config.adjustments[f.id] = Number(e.target.value);
                        setView(next);
                        setResult(null);
                      }}
                    />
                  </label>
                ))}
            </div>
          </details>
          <ProductPriceGroups
            items={items}
            config={view.config}
            disabled={!owner || busy}
            onChange={(config) => {
              setView({ ...view, config });
              setResult(null);
            }}
          />
          <PricingExtras
            items={items}
            config={view.config}
            disabled={!owner || busy}
            onChange={(config) => {
              setView({ ...view, config });
              setResult(null);
            }}
          />
          {owner && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                เหตุผลที่เปลี่ยนราคา
                <input
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                บันทึกเป็นราคาฉบับใหม่
              </button>
            </form>
          )}
        </section>
      )}
      <section className="panel pricing-panel">
        <h2>{onSaveDraft ? 'รายการในร่างและคำนวณราคา' : 'ทดลองราคาตัวเสื้อและผ้า'}</h2>
        <p>
          คำนวณด้วยราคาฉบับที่บันทึกแล้ว รวมเฉพาะส่วนประกอบที่เลือก
          ยังไม่สร้างออเดอร์หรือบันทึกรับเงินจริง
        </p>
        {choices && (!choices.sizes.length || !choices.fabricIds.length) && (
          <section className="notice product-setup-notice">
            <p>
              ແບບນີ້ຍັງບໍ່ມີຜ້າ ຫຼື Size / Fabrics and sizes have not been set for this product.
            </p>
            {owner ? (
              <details open>
                <summary>ຕັ້ງຄ່າແບບນີ້ / Set up this product</summary>
                <CatalogChoicesForm
                  key={product + ':' + choices.rowVersion}
                  item={items.find((i) => i.id === product)!}
                  canEdit
                  onSaved={() => {
                    void choose(product);
                  }}
                />
              </details>
            ) : (
              <p>
                ໃຫ້ເຈົ້າຂອງຕັ້ງຄ່າທີ່ Catalog / Ask the owner to set fabrics and sizes in Catalog.
              </p>
            )}
          </section>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void quote();
          }}
          onChange={() => setResult(null)}
        >
          <fieldset disabled={busy}>
            {onSaveDraft && (
              <ProductPicker items={items} value={product} onSelect={(id) => void choose(id)} />
            )}
            {!lineMode && (
              <label>
                <input
                  type="checkbox"
                  checked={applyBuyGet}
                  disabled={!view.config.buyGet}
                  onChange={(e) => {
                    setApplyBuyGet(e.target.checked);
                    setFree('0');
                  }}
                />{' '}
                ใช้ของแถมอัตโนมัติ{' '}
                {view.config.buyGet
                  ? `ซื้อ ${view.config.buyGet.buy} แถม ${view.config.buyGet.get}`
                  : '(เจ้าของยังไม่กำหนด)'}
              </label>
            )}
            <ProductOptions
              choices={choices}
              size={size}
              fabric={fabric}
              onSize={(next) => {
                setSize(next);
                setResult(null);
              }}
              onFabric={(next) => {
                setFabric(next);
                setResult(null);
              }}
            />
            <QuoteParts
              items={items}
              disabled={busy}
              onChange={(next) => {
                setParts(next);
                setResult(null);
              }}
            />
            <label>
              แสดงยอดเป็นสกุลเงิน
              <select
                aria-label="สกุลเงิน"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="LAK">LAK · กีบ</option>
                <option value="THB">THB · บาท</option>
                <option value="USD">USD · ดอลลาร์</option>
              </select>
            </label>
            <div className="pricing-fields">
              <label>
                แบบเสื้อ
                <select
                  aria-label="แบบเสื้อ"
                  required
                  value={product}
                  onChange={(e) => void choose(e.target.value)}
                >
                  <option value="">เลือกแบบเสื้อ</option>
                  {items
                    .filter((i) => i.kind === 'PRODUCT' && i.active)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                กลุ่มลูกค้า
                <select
                  aria-label="กลุ่มลูกค้า"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  {CUSTOMER_GROUPS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label>
                ไซซ์
                <select
                  aria-label="ไซซ์"
                  required
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                >
                  <option value="">เลือกไซซ์</option>
                  {choices?.sizes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                เนื้อผ้า
                <select
                  aria-label="เนื้อผ้า"
                  required
                  value={fabric}
                  onChange={(e) => setFabric(e.target.value)}
                >
                  <option value="">เลือกเนื้อผ้า</option>
                  {choices?.fabrics
                    .filter((f) => f.active && choices.fabricIds.includes(f.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
              {[
                { label: 'จำนวนที่คิดเงิน', value: quantity, set: setQuantity, min: 0, max: 10000 },
                ...(!applyBuyGet
                  ? [{ label: 'ของแถม (จำนวน)', value: free, set: setFree, min: 0, max: 10000 }]
                  : []),
                { label: 'ลดเปอร์เซ็นต์', value: percent, set: setPercent, min: 0, max: 1000000 },
                { label: 'ลดจำนวนเงิน (กีบ)', value: fixed, set: setFixed, min: 0, max: 100000000 },
              ]
                .filter((f) => !lineMode || !f.label.startsWith('ลด'))
                .map((f) => (
                  <label key={f.label}>
                    {f.label}
                    <input
                      required
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.label === 'ลดเปอร์เซ็นต์' ? '0.01' : '1'}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                    />
                  </label>
                ))}
            </div>
          </fieldset>
          {choices && (!choices.sizes.length || !choices.fabricIds.length) && (
            <p role="status">เจ้าของต้องกำหนดไซซ์และผ้าที่ใช้ได้กับแบบเสื้อนี้ก่อน</p>
          )}
          <button className="primary" disabled={busy || !size || !fabric}>
            ทดลองคำนวณ
          </button>
        </form>
        <p>
          ແຖມລ້ວນ / Gift-only: ຈຳນວນຄິດເງິນ 0 ແລະໃສ່ຈຳນວນແຖມ / Set paid quantity to 0 and enter
          gifts. Gifts still count for production and delivery.
        </p>
        {onSaveDraft && (
          <button className="primary" disabled={busy || !result} onClick={() => void saveDraft()}>
            {lineMode ? 'เพิ่มรายการเข้าร่าง' : 'บันทึกร่างออเดอร์'}
          </button>
        )}
        {result && (
          <div role="status" className="notice">
            <div>
              <p>
                ราคาพื้นฐาน {result.base.toLocaleString()} + ไซซ์{' '}
                {result.sizeExtra.toLocaleString()} กีบ
              </p>
              {result.missing.map((m) => (
                <p key={m}>{m}</p>
              ))}
              {result.ready && (
                <>
                  <strong>
                    {parts.length ? 'ยอดรวมส่วนที่เลือกหลังลด' : 'ยอดเฉพาะตัวเสื้อและผ้าหลังลด'}{' '}
                    {result.total!.toLocaleString()} กีบ
                  </strong>
                  <p>
                    จำนวนคิดเงิน {result.quantity} · ของแถม {result.freeQuantity} · จำนวนรวม{' '}
                    {result.productionQuantity}
                  </p>
                  <p>
                    เพิ่มส่วนประกอบ {result.componentExtra?.toLocaleString()} · เพิ่มผ้าส่วนประกอบ{' '}
                    {result.partFabricExtra?.toLocaleString()} กีบ/ตัว
                  </p>
                  <p>
                    ยอดแสดง {result.convertedTotal} {result.displayCurrency} · 1{' '}
                    {result.displayCurrency} = {result.exchangeRate} LAK · ราคาฉบับ{' '}
                    {result.revision}
                  </p>
                  <p>ราคาฉบับ {result.revision} · ลดเปอร์เซ็นต์ก่อนลดเงิน</p>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
