import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { PRICE_GROUPS, type PricingConfig } from '../../../../../packages/contracts/src/pricing';

export function ProductPriceGroups({
  items,
  config,
  disabled,
  onChange,
}: {
  items: CatalogItem[];
  config: PricingConfig;
  disabled: boolean;
  onChange: (next: PricingConfig) => void;
}) {
  return (
    <details>
      <summary>ກຸ່ມລາຄາແຕ່ລະແບບ / Product price groups</summary>
      <p>
        ເຈົ້າຂອງເລືອກ A–D ຕາມຕາຕະລາງລາຄາ / Choose a base-price column for each product, then save
        the pricing revision.
      </p>
      <div className="pricing-fields">
        {items
          .filter((i) => i.kind === 'PRODUCT')
          .map((item) => {
            const key = item.sourceKey ?? item.id;
            return (
              <label key={item.id}>
                {item.name}
                <select
                  aria-label={'Price group ' + item.name}
                  disabled={disabled}
                  value={config.collar[key] ?? ''}
                  onChange={(e) => {
                    const next = structuredClone(config);
                    if (!e.target.value) delete next.collar[key];
                    else next.collar[key] = e.target.value as (typeof PRICE_GROUPS)[number];
                    onChange(next);
                  }}
                >
                  <option value="">Not set</option>
                  {PRICE_GROUPS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            );
          })}
      </div>
    </details>
  );
}
