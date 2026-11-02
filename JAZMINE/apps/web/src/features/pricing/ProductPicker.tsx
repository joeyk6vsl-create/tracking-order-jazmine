import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { CatalogImage } from '../catalog/CatalogImage';
function CollarButton({
  item,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={item.name}
      className={
        'panel catalog-card ' +
        (!item.hasImage ? 'fabric-option ' : '') +
        (selected ? 'selected-option' : '')
      }
      aria-pressed={selected}
      onClick={onSelect}
    >
      <CatalogImage item={item} />
      <strong>{item.name}</strong>
    </button>
  );
}
export function ProductPicker({
  items,
  value,
  onSelect,
}: {
  items: CatalogItem[];
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3>เลือกคอเสื้อจากรูป</h3>
      {[1, 2, 3, 0].map((group) => (
        <section key={group}>
          <h4>{group ? `ชุด ${group}` : 'ແບບອື່ນ / Other products'}</h4>
          <div className="option-grid">
            {items
              .filter(
                (i) =>
                  i.kind === 'PRODUCT' &&
                  (group ? i.displayGroup === group : ![1, 2, 3].includes(i.displayGroup)) &&
                  i.active,
              )
              .map((i) => (
                <CollarButton
                  key={i.id}
                  item={i}
                  selected={value === i.id}
                  onSelect={() => onSelect(i.id)}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
