import type { PricingQuote, QuoteResult } from '../../../../../packages/contracts/src/pricing';

export type SizeCount = { quantity: number; freeQuantity: number };
export function SizeQuantityTable({
  sizes,
  counts,
  prices,
  onChange,
}: {
  sizes: PricingQuote['size'][];
  counts: Partial<Record<PricingQuote['size'], SizeCount>>;
  prices: Partial<Record<PricingQuote['size'], QuoteResult>>;
  onChange: (size: PricingQuote['size'], value: SizeCount) => void;
}) {
  return (
    <section className="size-quantity-panel">
      <h3>Size · ຈຳນວນແຕ່ລະໄຊ / Quantity per size</h3>
      <p>ກົດ + / − ຫຼືພິມຈຳນວນ / Enter quantities for all required sizes.</p>
      <table className="size-quantity-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>LAK / ໂຕ</th>
            <th>ຈຳນວນ / Qty</th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => {
            const count = counts[size] ?? { quantity: 0, freeQuantity: 0 };
            const price = prices[size];
            return (
              <tr key={size}>
                <th scope="row">{size}</th>
                <td>{price?.unit == null ? '—' : price.unit.toLocaleString()}</td>
                <td>
                  <div className="quantity-stepper">
                    <button
                      type="button"
                      aria-label={`Decrease ${size}`}
                      disabled={count.quantity <= 0}
                      onClick={() => onChange(size, { ...count, quantity: count.quantity - 1 })}
                    >
                      −
                    </button>
                    <input
                      aria-label={`Quantity ${size}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="10000"
                      step="1"
                      value={count.quantity}
                      onChange={(e) =>
                        onChange(size, { ...count, quantity: Number(e.target.value) })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Increase ${size}`}
                      disabled={count.quantity >= 10000}
                      onClick={() => onChange(size, { ...count, quantity: count.quantity + 1 })}
                    >
                      +
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <details>
        <summary>ຂອງແຖມແຍກຕາມ Size / Gifts by size</summary>
        <div className="pricing-fields">
          {sizes.map((size) => (
            <label key={size}>
              {size} · Gift
              <input
                aria-label={`Gift quantity ${size}`}
                type="number"
                min="0"
                max="10000"
                step="1"
                value={counts[size]?.freeQuantity ?? 0}
                onChange={(e) =>
                  onChange(size, {
                    quantity: counts[size]?.quantity ?? 0,
                    freeQuantity: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
