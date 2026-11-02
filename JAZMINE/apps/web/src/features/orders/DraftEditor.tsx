import { useEffect, useState } from 'react';
import {
  CUSTOMER_GROUPS,
  type CustomerView,
} from '../../../../../packages/contracts/src/customers';
import {
  SIZES,
  type PricingQuote,
  type PricingView,
} from '../../../../../packages/contracts/src/pricing';
import {
  draftSchema,
  type DraftView,
  type DraftInput,
} from '../../../../../packages/contracts/src/orders';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api, errorMessage } from '../../services/api';
import { PricingPage } from '../pricing/PricingPage';
export function DraftEditor({
  draft,
  onSaved,
}: {
  draft: DraftView | null;
  onSaved: (d: DraftView) => void;
}) {
  const [id] = useState(() => draft?.id ?? crypto.randomUUID()),
    [name, setName] = useState(draft?.input.customerName ?? ''),
    [phone, setPhone] = useState(draft?.input.phone ?? ''),
    [customerId, setCustomerId] = useState(draft?.input.customerId ?? null),
    [search, setSearch] = useState(''),
    [matches, setMatches] = useState<CustomerView[]>([]);
  const [lines, setLines] = useState<PricingQuote[]>(() =>
    draft
      ? draft.input.lines?.length
        ? draft.input.lines
        : [
            {
              ...draft.input.quote,
              percent: 0,
              fixed: 0,
              applyBuyGet: false,
              freeQuantity: draft.pricing.freeQuantity,
            },
          ]
      : [],
  );
  const [group, setGroup] = useState(draft?.input.quote.group ?? 'RETAIL'),
    [currency, setCurrency] = useState(draft?.input.quote.currency ?? 'LAK'),
    [percent, setPercent] = useState(String(draft?.input.quote.percent ?? 0)),
    [fixed, setFixed] = useState(String(draft?.input.quote.fixed ?? 0)),
    [automatic, setAutomatic] = useState(draft?.input.quote.applyBuyGet ?? false),
    [reason, setReason] = useState(draft ? '' : 'สร้างร่างออเดอร์'),
    [brand, setBrand] = useState(draft?.input.brandingType ?? ''),
    [notes, setNotes] = useState(draft?.input.assetNotes ?? ''),
    [pricing, setPricing] = useState<PricingView | null>(null),
    [items, setItems] = useState<CatalogItem[]>([]),
    [result, setResult] = useState<DraftView['pricing'] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [lineKey, setLineKey] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<PricingView>('/pricing'),
      api<{ items: CatalogItem[] }>('/catalog/options'),
    ])
      .then(([p, c]) => {
        if (alive) {
          setPricing(p);
          setItems(c.items);
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  function payload(): DraftInput {
    if (!lines.length) throw new Error('เพิ่มอย่างน้อยหนึ่งรายการก่อน');
    const normalized = lines.map((line) => ({
      ...line,
      group,
      currency,
      percent: 0,
      fixed: 0,
      applyBuyGet: false,
    }));
    const parsed = draftSchema.safeParse({
      rowVersion: draft?.rowVersion ?? 0,
      reason,
      customerId,
      customerName: name,
      phone,
      quote: {
        ...normalized[0],
        freeQuantity: 0,
        percent: Number(percent),
        fixed: Number(fixed),
        applyBuyGet: automatic,
      },
      lines: normalized,
      brandingType: brand || null,
      assetNotes: notes,
    });
    if (!parsed.success)
      throw new Error('กรุณาตรวจชื่อ เบอร์ลูกค้า จำนวนซื้อและแถม ส่วนลด และเหตุผลให้ครบถ้วน');
    return parsed.data;
  }
  async function find() {
    setError('');
    try {
      setMatches(
        (
          await api<{ customers: CustomerView[] }>(
            '/customers?search=' + encodeURIComponent(search),
          )
        ).customers,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function preview() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api<DraftView['pricing']>('/order-drafts/preview', 'POST', payload()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved((await api<{ draft: DraftView }>(`/order-drafts/${id}`, 'PUT', payload())).draft);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function changeLine(index: number, patch: Partial<PricingQuote>) {
    setLines((rows) => rows.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    setResult(null);
  }
  const expected = pricing?.config.buyGet
    ? Math.floor(lines.reduce((n, l) => n + l.quantity, 0) / pricing.config.buyGet.buy) *
      pricing.config.buyGet.get
    : 0;
  return (
    <div onChange={() => setResult(null)}>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="draft-fields">
        <section className="panel">
          <h2>ลูกค้าของงานนี้</h2>
          <p>ขาจรกรอกตรงนี้ได้ ไม่เพิ่มเป็นลูกค้าประจำอัตโนมัติ</p>
          <label>
            ชื่อลูกค้า
            <input
              aria-label="ชื่อลูกค้าของร่าง"
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCustomerId(null);
              }}
            />
          </label>
          <label>
            เบอร์ลูกค้า
            <input
              aria-label="เบอร์ลูกค้าของร่าง"
              maxLength={40}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setCustomerId(null);
              }}
            />
          </label>
          <details>
            <summary>เลือกลูกค้าประจำที่มีอยู่</summary>
            <label>
              ค้นชื่อลูกค้าประจำ
              <input value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <button onClick={() => void find()}>ค้นหาลูกค้าประจำ</button>
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCustomerId(c.id);
                  setName(c.name);
                  setPhone(c.phone);
                  setGroup(c.group);
                  setMatches([]);
                }}
              >
                {c.name} · {c.phone}
              </button>
            ))}
          </details>
          <label>
            แบรนด์
            <select
              aria-label="แบรนด์ของร่าง"
              value={brand}
              onChange={(e) => setBrand(e.target.value as typeof brand)}
            >
              <option value="">ยังไม่เลือก</option>
              <option value="JAZMINE_STANDARD">JAZMINE</option>
              <option value="CUSTOM_AGENT">แบรนด์ลูกค้า</option>
            </select>
          </label>
          <label>
            บันทึกสิ่งที่ต้องตามเรื่องไฟล์
            <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <p>
            ป้ายคอ เทปคอ และแบบที่อนุมัติ ยังต้องแนบและตรวจจริง การเขียนหมายเหตุไม่ทำให้ไฟล์ผ่าน
          </p>
        </section>
        <section className="panel pricing-panel">
          <h2>รายการในร่าง</h2>
          {!lines.length && <p>ยังไม่มีรายการ เพิ่มจากตัวเลือกด้านล่าง</p>}
          {lines.map((line, index) => (
            <div className="draft-line" key={index}>
              <h3>
                รายการ {index + 1} ·{' '}
                {items.find((i) => i.id === line.productId)?.name ?? 'แบบเสื้อที่บันทึกไว้'}
              </h3>
              <p>
                ผ้า {items.find((i) => i.id === line.fabricId)?.name ?? line.fabricId} · ส่วนประกอบ{' '}
                {line.parts.length} แบบ
              </p>
              <div className="pricing-fields">
                <label>
                  ไซซ์รายการ {index + 1}
                  <select
                    aria-label={`ไซซ์รายการ ${index + 1}`}
                    value={line.size}
                    onChange={(e) =>
                      changeLine(index, { size: e.target.value as PricingQuote['size'] })
                    }
                  >
                    {SIZES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  จำนวนซื้อรายการ {index + 1}
                  <input
                    aria-label={`จำนวนซื้อรายการ ${index + 1}`}
                    type="number"
                    min="0"
                    max="10000"
                    value={line.quantity}
                    onChange={(e) => changeLine(index, { quantity: Number(e.target.value) })}
                  />
                </label>
                <label>
                  แถมรายการ {index + 1}
                  <input
                    aria-label={`แถมรายการ ${index + 1}`}
                    type="number"
                    min="0"
                    max="10000"
                    value={line.freeQuantity}
                    onChange={(e) => changeLine(index, { freeQuantity: Number(e.target.value) })}
                  />
                </label>
              </div>
              {line.quantity === 0 && line.freeQuantity > 0 && (
                <p>
                  ລາຍການແຖມລ້ວນ / Gift-only · ບໍ່ຄິດເງິນ ແຕ່ຕ້ອງຜະລິດ ແລະສົ່ງ / No charge;
                  production and delivery required
                </p>
              )}
              {line.quantity === 0 && line.freeQuantity === 0 && (
                <p className="alert warning">
                  ໃສ່ຈຳນວນແຖມ ຫຼືຊື້ ຫຼືນຳລາຍການອອກ / Enter a gift or purchased quantity, or remove
                  this line
                </p>
              )}
              <button
                type="button"
                aria-label={`Make line ${index + 1} gift-only`}
                disabled={line.quantity === 0 || line.quantity + line.freeQuantity > 10000}
                onClick={() =>
                  changeLine(index, {
                    quantity: 0,
                    freeQuantity: line.quantity + line.freeQuantity,
                  })
                }
              >
                ປ່ຽນເປັນແຖມລ້ວນ / Make gift-only
              </button>
              {line.quantity === 0 && line.freeQuantity > 0 && (
                <button
                  type="button"
                  aria-label={`Make line ${index + 1} paid`}
                  onClick={() =>
                    changeLine(index, { quantity: line.freeQuantity, freeQuantity: 0 })
                  }
                >
                  ປ່ຽນເປັນຄິດເງິນ / Make paid
                </button>
              )}
              <button
                onClick={() => {
                  setLines((rows) => rows.filter((_, i) => i !== index));
                  setResult(null);
                }}
              >
                นำรายการ {index + 1} ออก
              </button>
            </div>
          ))}
          <div className="pricing-fields">
            <label>
              กลุ่มราคาทั้งร่าง
              <select
                aria-label="กลุ่มราคาทั้งร่าง"
                value={group}
                onChange={(e) => setGroup(e.target.value as typeof group)}
              >
                {CUSTOMER_GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              สกุลเงินทั้งร่าง
              <select
                aria-label="สกุลเงินทั้งร่าง"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
              >
                {['LAK', 'THB', 'USD'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              ลดเปอร์เซ็นต์ทั้งร่าง
              <input
                aria-label="ลดเปอร์เซ็นต์ทั้งร่าง"
                type="number"
                min="0"
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </label>
            <label>
              ลดเงินทั้งร่าง (กีบ)
              <input
                aria-label="ลดเงินทั้งร่าง"
                type="number"
                min="0"
                value={fixed}
                onChange={(e) => setFixed(e.target.value)}
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={automatic}
              disabled={!pricing?.config.buyGet}
              onChange={(e) => setAutomatic(e.target.checked)}
            />{' '}
            ใช้ของแถมอัตโนมัติทั้งร่าง
          </label>
          {automatic && (
            <>
              <p>
                จำนวนซื้อรวม {lines.reduce((n, l) => n + l.quantity, 0)} · สิทธิ์แถม {expected} ·
                จัดลงรายการแล้ว {lines.reduce((n, l) => n + l.freeQuantity, 0)}{' '}
                ให้เลือกไซซ์ปลายทางผ่านช่องแถมแต่ละรายการ
              </p>
              <button
                disabled={
                  !lines.length ||
                  lines.some((line, i) => line.quantity === 0 && (i !== 0 || expected === 0))
                }
                onClick={() => {
                  setLines((rows) =>
                    rows.map((line, i) => ({ ...line, freeQuantity: i === 0 ? expected : 0 })),
                  );
                  setResult(null);
                }}
              >
                จัดของแถมทั้งหมดให้รายการแรก
              </button>
              {lines.some((line, i) => line.quantity === 0 && (i !== 0 || expected === 0)) && (
                <p>
                  ມີລາຍການແຖມລ້ວນ / Allocate gifts per line so each gift-only line keeps a positive
                  quantity. Switch off automatic gifts for manual gifts without a purchase.
                </p>
              )}
            </>
          )}
          <label>
            เหตุผลที่บันทึกหรือแก้ร่าง
            <input
              aria-label="เหตุผลที่แก้ร่าง"
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={!lines.length} onClick={() => void preview()}>
            ตรวจยอดรวมร่าง
          </button>
          <button
            className="primary"
            disabled={!lines.length || !reason.trim()}
            onClick={() => void save()}
          >
            บันทึกร่างออเดอร์
          </button>
          {result && (
            <div role="status">
              <p>
                จำนวนซื้อรวม {result.quantity} · แถมรวม {result.freeQuantity} · ผลิตรวม{' '}
                {result.productionQuantity}
              </p>
              {result.missing.map((m) => (
                <p key={m}>{m}</p>
              ))}
              {result.ready && (
                <strong>ยอดรวมร่างหลังลด {result.total?.toLocaleString()} กีบ</strong>
              )}
            </div>
          )}
        </section>
      </fieldset>
      <details className="panel pricing-panel" open>
        <summary>เพิ่มแบบเสื้อหรือไซซ์ใหม่เข้าร่าง</summary>
        <p>
          ส่วนลด กลุ่มราคา สกุลเงิน และสิทธิ์แถมใช้ค่าที่หัวข้อยอดรวมร่างเพียงครั้งเดียว
          เพิ่มได้สูงสุด 30 รายการ ถ้าจะเปลี่ยนแบบ ผ้า หรือส่วนประกอบ
          ให้นำรายการเดิมออกแล้วเพิ่มใหม่
        </p>
        <PricingPage
          key={lineKey}
          initialGroup={group}
          lineMode
          onSaveDraft={async (line) => {
            if (lines.length >= 30) throw new Error('ร่างนี้มีครบ 30 รายการแล้ว');
            setLines((rows) => [...rows, line]);
            setResult(null);
            setLineKey((k) => k + 1);
          }}
        />
      </details>
    </div>
  );
}
