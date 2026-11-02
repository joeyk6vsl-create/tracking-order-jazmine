import { useEffect, useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import type { CatalogChoices } from '../../../../../packages/contracts/src/catalog-choices';
import {
  SIZES,
  quoteSchema,
  type PricingQuote,
  type QuoteResult,
} from '../../../../../packages/contracts/src/pricing';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { CatalogChoicesForm } from '../catalog/CatalogChoicesForm';
import { ProductPicker } from '../pricing/ProductPicker';
import { ProductOptions } from '../pricing/ProductOptions';
import { QuoteParts } from '../pricing/QuoteParts';
import { SizeQuantityTable, type SizeCount } from './SizeQuantityTable';
import './order-entry.css';

export function OrderItemComposer({
  items,
  group,
  currency,
  remainingLines,
  disabled,
  onAdd,
}: {
  items: CatalogItem[];
  group: PricingQuote['group'];
  currency: PricingQuote['currency'];
  remainingLines: number;
  disabled: boolean;
  onAdd: (lines: PricingQuote[]) => void;
}) {
  const { session } = useSession();
  const owner = session!.permissions.includes('users.manage');
  const [product, setProduct] = useState(''),
    [fabric, setFabric] = useState('');
  const [choices, setChoices] = useState<CatalogChoices | null>(null);
  const [parts, setParts] = useState<PricingQuote['parts']>([]);
  const [counts, setCounts] = useState<Partial<Record<PricingQuote['size'], SizeCount>>>({});
  const [prices, setPrices] = useState<Partial<Record<PricingQuote['size'], QuoteResult>>>({});
  const [priceContext, setPriceContext] = useState('');
  const currentPrices = priceContext === `${group}:${currency}` ? prices : {};
  const [setup, setSetup] = useState<CatalogItem | null>(null),
    [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (!product) return;
    void api<CatalogChoices>(`/catalog/${product}/choices`)
      .then((data) => {
        if (alive) {
          setChoices(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [product, refresh]);
  function choose(id: string) {
    setProduct(id);
    setChoices(null);
    setFabric('');
    setCounts({});
    setPrices({});
    setSetup(null);
    setParts([]);
    setError('');
    setLoading(Boolean(id));
  }
  const sizes = SIZES.filter((size) => choices?.sizes.includes(size));
  const selectedSizes = sizes.filter(
    (size) => (counts[size]?.quantity ?? 0) + (counts[size]?.freeQuantity ?? 0) > 0,
  );
  const missing = [
    ...(!product ? ['ເລືອກແບບເສື້ອ / Choose a shirt.'] : []),
    ...(!fabric ? ['ເລືອກຜ້າຕົວເສື້ອ / Choose the body fabric.'] : []),
    ...(!selectedSizes.length
      ? ['ໃສ່ຈຳນວນຢ່າງໜ້ອຍ 1 Size / Enter at least one size quantity.']
      : []),
    ...(selectedSizes.length > remainingLines
      ? [`ເຫຼືອ ${remainingLines} ລາຍການ / Only ${remainingLines} lines remain.`]
      : []),
  ];
  async function calculate(add: boolean) {
    setError('');
    if (missing.length) {
      setError(missing.join(' '));
      return;
    }
    if (
      Object.values(counts).some(
        (count) =>
          count &&
          [count.quantity, count.freeQuantity].some(
            (value) => !Number.isInteger(value) || value < 0 || value > 10000,
          ),
      )
    ) {
      setError('ໃສ່ຈຳນວນເຕັມ 0–10,000 / Quantities must be whole numbers from 0 to 10,000.');
      return;
    }
    setBusy(true);
    try {
      const lines = selectedSizes.map((size) =>
        quoteSchema.parse({
          productId: product,
          fabricId: fabric,
          size,
          group,
          currency,
          parts,
          ...counts[size],
        }),
      );
      // Prices and option validation always come from the central service.
      const results = await Promise.all(
        lines.map((line) => api<QuoteResult>('/pricing/quote', 'POST', line)),
      );
      setPrices(Object.fromEntries(results.map((result, index) => [lines[index].size, result])));
      setPriceContext(`${group}:${currency}`);
      if (add) onAdd(lines);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const setupProduct = items.find((i) => i.id === product);
  return (
    <section className="order-item-composer">
      <fieldset disabled={disabled || busy || loading}>
        <ProductPicker items={items} value={product} onSelect={choose} />
        <label>
          ແບບເສື້ອ / Shirt
          <select aria-label="แบบเสื้อ" value={product} onChange={(e) => choose(e.target.value)}>
            <option value="">ເລືອກ / Choose</option>
            {items
              .filter((i) => i.kind === 'PRODUCT' && i.active)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <ProductOptions
          choices={choices}
          size=""
          fabric={fabric}
          showSizes={false}
          onSize={() => {}}
          onFabric={(value) => {
            setFabric(value);
            setPrices({});
          }}
        />
        {choices &&
          (!sizes.length ||
            !choices.fabrics.some((f) => f.active && choices.fabricIds.includes(f.id))) && (
            <div className="notice product-setup-notice">
              <p>ຍັງບໍ່ມີຜ້າ ຫຼື Size / Fabrics or sizes have not been set for this shirt.</p>
              {owner && setupProduct ? (
                <button type="button" onClick={() => setSetup(setupProduct)}>
                  ຕັ້ງຄ່າແບບນີ້ / Set up this product
                </button>
              ) : (
                <p>ໃຫ້ເຈົ້າຂອງຕັ້ງຄ່າ / Ask the owner to set up this shirt in Catalog.</p>
              )}
            </div>
          )}
        <h3>ສ່ວນປະກອບ ແລະຜ້າແຍກ / Parts and their fabrics</h3>
        <QuoteParts
          key={product}
          items={items}
          disabled={disabled || busy || loading}
          refreshKey={refresh}
          onSetup={owner ? setSetup : undefined}
          onChange={(value) => {
            setParts(value);
            setPrices({});
          }}
        />
        {sizes.length > 0 && (
          <SizeQuantityTable
            sizes={sizes}
            counts={counts}
            prices={currentPrices}
            onChange={(size, value) => {
              setCounts((current) => ({ ...current, [size]: value }));
              setPrices({});
            }}
          />
        )}
        <p>
          ລວມ / Total:{' '}
          {selectedSizes.reduce(
            (total, size) =>
              total + (counts[size]?.quantity ?? 0) + (counts[size]?.freeQuantity ?? 0),
            0,
          )}{' '}
          · {selectedSizes.length} Size
        </p>
        <button type="button" onClick={() => void calculate(false)}>
          ກວດລາຄາ / Check selected prices
        </button>
        <button type="button" className="primary" onClick={() => void calculate(true)}>
          ເພີ່ມທຸກ Size / Add selected sizes
        </button>
      </fieldset>
      {loading && <p role="status">Loading options…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {[...new Set(Object.values(currentPrices).flatMap((price) => price?.missing ?? []))].map(
        (message) => (
          <p key={message} role="status">
            {message}
          </p>
        ),
      )}
      {setup && (
        <section className="product-setup-notice">
          <button type="button" disabled={busy || disabled} onClick={() => setSetup(null)}>
            ປິດ / Close setup
          </button>
          <CatalogChoicesForm
            key={setup.id}
            item={setup}
            canEdit={!disabled && !busy}
            onSaved={() => {
              setSetup(null);
              setRefresh((value) => value + 1);
              setPrices({});
            }}
          />
        </section>
      )}
    </section>
  );
}
