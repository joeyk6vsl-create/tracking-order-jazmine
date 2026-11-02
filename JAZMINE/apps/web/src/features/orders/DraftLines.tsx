import { SIZES, type PricingQuote } from '../../../../../packages/contracts/src/pricing';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';

export function DraftLines({
  lines,
  items,
  onChange,
  onRemove,
}: {
  lines: PricingQuote[];
  items: CatalogItem[];
  onChange: (index: number, patch: Partial<PricingQuote>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
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
                onChange={(e) => onChange(index, { size: e.target.value as PricingQuote['size'] })}
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
                onChange={(e) => onChange(index, { quantity: Number(e.target.value) })}
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
                onChange={(e) => onChange(index, { freeQuantity: Number(e.target.value) })}
              />
            </label>
          </div>
          {line.quantity === 0 && line.freeQuantity > 0 && (
            <p>
              ລາຍການແຖມລ້ວນ / Gift-only · ບໍ່ຄິດເງິນ ແຕ່ຕ້ອງຜະລິດ ແລະສົ່ງ / No charge; production
              and delivery required
            </p>
          )}
          {line.quantity === 0 && line.freeQuantity === 0 && (
            <p className="alert warning">
              ໃສ່ຈຳນວນແຖມ ຫຼືຊື້ ຫຼືນຳລາຍການອອກ / Enter a gift or purchased quantity, or remove this
              line
            </p>
          )}
          <button
            type="button"
            aria-label={`Make line ${index + 1} gift-only`}
            disabled={line.quantity === 0 || line.quantity + line.freeQuantity > 10000}
            onClick={() =>
              onChange(index, {
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
              onClick={() => onChange(index, { quantity: line.freeQuantity, freeQuantity: 0 })}
            >
              ປ່ຽນເປັນຄິດເງິນ / Make paid
            </button>
          )}
          <button onClick={() => onRemove(index)}>นำรายการ {index + 1} ออก</button>
        </div>
      ))}
    </>
  );
}
