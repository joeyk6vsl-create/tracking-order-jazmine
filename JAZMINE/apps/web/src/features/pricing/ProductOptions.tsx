import type { CatalogChoices } from '../../../../../packages/contracts/src/catalog-choices';

export function ProductOptions({
  choices,
  size,
  fabric,
  onSize,
  onFabric,
}: {
  choices: CatalogChoices | null;
  size: string;
  fabric: string;
  onSize: (value: string) => void;
  onFabric: (value: string) => void;
}) {
  return (
    <div className="product-options">
      <fieldset>
        <legend>ເນື້ອຜ້າ / Fabric</legend>
        <div className="option-grid fabric-grid">
          {choices?.fabrics
            .filter((f) => f.active && choices.fabricIds.includes(f.id))
            .map((f) => (
              <button
                className={
                  'panel catalog-card fabric-option ' + (fabric === f.id ? 'selected-option' : '')
                }
                type="button"
                key={f.id}
                aria-pressed={fabric === f.id}
                onClick={() => onFabric(f.id)}
              >
                {f.name}
              </button>
            ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Size</legend>
        <div className="size-options">
          {choices?.sizes.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={size === s}
              className={size === s ? 'selected-option' : ''}
              onClick={() => onSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      {!choices && <p>ເລືອກແບບເສື້ອກ່ອນ / Choose a product to see fabrics and sizes.</p>}
    </div>
  );
}
