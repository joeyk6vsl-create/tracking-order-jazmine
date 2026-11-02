import { useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import type { CatalogChoices } from '../../../../../packages/contracts/src/catalog-choices';
import { api, errorMessage } from '../../services/api';
type Part = { componentId: string; fabricId?: string };
function PartChoice({
  label,
  items,
  disabled,
  onChange,
}: {
  label: string;
  items: CatalogItem[];
  disabled: boolean;
  onChange: (part: Part | null) => void;
}) {
  const [id, setId] = useState(''),
    [choices, setChoices] = useState<CatalogChoices | null>(null),
    [fabric, setFabric] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function choose(next: string) {
    setId(next);
    setChoices(null);
    setFabric('');
    setError('');
    onChange(next ? { componentId: next } : null);
    if (!next) return;
    setLoading(true);
    try {
      setChoices(await api<CatalogChoices>(`/catalog/${next}/choices`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <label>
        {label}
        <select
          aria-label={label}
          disabled={disabled || loading}
          value={id}
          onChange={(e) => void choose(e.target.value)}
        >
          <option value="">ไม่เพิ่มส่วนประกอบนี้ในตัวทดลอง</option>
          {items
            .filter((i) => i.active)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
      {id && (
        <label>
          ผ้าสำหรับ {label}
          <select
            disabled={disabled || loading}
            aria-label={'ผ้าสำหรับ ' + label}
            value={fabric}
            onChange={(e) => {
              setFabric(e.target.value);
              onChange({
                componentId: id,
                ...(e.target.value ? { fabricId: e.target.value } : {}),
              });
            }}
          >
            <option value="">ไม่ระบุผ้าแยก</option>
            {choices?.fabrics
              .filter((f) => f.active && choices.fabricIds.includes(f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function QuoteParts({
  items,
  disabled,
  onChange,
}: {
  items: CatalogItem[];
  disabled: boolean;
  onChange: (parts: Part[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, Part>>({});
  return (
    <div className="pricing-fields">
      {[
        { label: 'แขนเสื้อ', prefix: 'ແຂນ' },
        { label: 'ปลายแขน', prefix: 'ປາຍແຂນ' },
        { label: 'บ่าเสื้อ', prefix: 'ບ່າ' },
      ].map((slot) => (
        <PartChoice
          key={slot.prefix}
          label={slot.label}
          items={items.filter(
            (i) =>
              i.kind === 'COMPONENT' &&
              (i.sourceKey?.includes('/' + slot.prefix) ||
                (!i.sourceKey && i.name.startsWith(slot.prefix))),
          )}
          disabled={disabled}
          onChange={(part) => {
            const next = { ...selected };
            if (part) next[slot.prefix] = part;
            else delete next[slot.prefix];
            setSelected(next);
            onChange(Object.values(next));
          }}
        />
      ))}
    </div>
  );
}
