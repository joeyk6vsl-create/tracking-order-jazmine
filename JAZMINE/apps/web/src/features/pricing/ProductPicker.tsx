import { useEffect, useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api } from '../../services/api';
function CollarButton({
  item,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api<{ image: string | null }>(`/catalog/${item.id}/image`)
      .then((r) => {
        if (alive) setImage(r.image);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id]);
  return (
    <button
      type="button"
      className={'panel catalog-card ' + (selected ? 'selected-option' : '')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {image && <img src={image} alt={item.name} loading="lazy" />}
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
      {[1, 2, 3].map((group) => (
        <section key={group}>
          <h4>ชุด {group}</h4>
          <div className="option-grid">
            {items
              .filter((i) => i.section === 'COLLAR' && i.displayGroup === group && i.active)
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
