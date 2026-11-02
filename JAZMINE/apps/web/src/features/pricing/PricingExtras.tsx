import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import type { PricingConfig } from '../../../../../packages/contracts/src/pricing';
export function PricingExtras({
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
    <fieldset disabled={disabled}>
      <details>
        <summary>ซื้อครบแถมอัตโนมัติ</summary>
        <label>
          <input
            type="checkbox"
            checked={config.buyGet !== null}
            onChange={(e) =>
              onChange({ ...config, buyGet: e.target.checked ? { buy: 1, get: 1 } : null })
            }
          />{' '}
          เปิดใช้กติกาซื้อครบแถม
        </label>
        <p>ระบุจำนวนเอง ไม่มีการเปิดโปรโมชั่นให้อัตโนมัติ ของแถมไม่ถูกนำไปนับสร้างของแถมรอบใหม่</p>
        {config.buyGet && (
          <div className="pricing-fields">
            <label>
              ซื้อครบกี่ตัว
              <input
                aria-label="ซื้อครบกี่ตัว"
                type="number"
                min="1"
                max="10000"
                value={config.buyGet.buy}
                onChange={(e) =>
                  onChange({
                    ...config,
                    buyGet: { ...config.buyGet!, buy: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              แถมกี่ตัว
              <input
                aria-label="แถมกี่ตัว"
                type="number"
                min="1"
                max="10000"
                value={config.buyGet.get}
                onChange={(e) =>
                  onChange({
                    ...config,
                    buyGet: { ...config.buyGet!, get: Number(e.target.value) },
                  })
                }
              />
            </label>
          </div>
        )}
      </details>
      <details>
        <summary>ราคาเพิ่มส่วนประกอบเสื้อ</summary>
        <p>ว่าง = ยังไม่ทราบ · 0 = ไม่คิดเพิ่ม · คิดต่อเสื้อ 1 ตัว</p>
        <div className="pricing-fields">
          {items
            .filter((i) => i.kind === 'COMPONENT')
            .map((item) => (
              <label key={item.id}>
                {item.name}
                <input
                  aria-label={'เพิ่มส่วนประกอบ ' + item.name}
                  type="number"
                  min="0"
                  max="100000000"
                  value={config.components[item.id] ?? ''}
                  onChange={(e) => {
                    const next = structuredClone(config);
                    if (e.target.value === '') delete next.components[item.id];
                    else next.components[item.id] = Number(e.target.value);
                    onChange(next);
                  }}
                />
              </label>
            ))}
        </div>
      </details>
      <details>
        <summary>คิดเพิ่มค่าผ้าของแต่ละส่วนประกอบ</summary>
        <p>แยกจากราคาเพิ่มของตัวส่วนประกอบ หากเปิดคิดเพิ่มจะรวมค่าผ้าของทุกส่วนที่เลือก</p>
        {items
          .filter((i) => i.kind === 'COMPONENT')
          .map((part) => (
            <div key={part.id}>
              <label>
                {part.name}
                <select
                  aria-label={'ค่าผ้าส่วนประกอบ ' + part.name}
                  value={
                    config.partFabric[part.id] === undefined
                      ? 'UNSET'
                      : config.partFabric[part.id].enabled
                        ? 'ON'
                        : 'OFF'
                  }
                  onChange={(e) => {
                    const next = structuredClone(config);
                    if (e.target.value === 'UNSET') delete next.partFabric[part.id];
                    else
                      next.partFabric[part.id] = {
                        enabled: e.target.value === 'ON',
                        rates: next.partFabric[part.id]?.rates ?? {},
                      };
                    onChange(next);
                  }}
                >
                  <option value="UNSET">ยังไม่กำหนด</option>
                  <option value="OFF">ไม่คิดเพิ่มค่าผ้า</option>
                  <option value="ON">คิดเพิ่มค่าผ้า</option>
                </select>
              </label>
              {config.partFabric[part.id]?.enabled && (
                <div className="pricing-fields">
                  {items
                    .filter((i) => i.kind === 'FABRIC')
                    .map((f) => (
                      <label key={f.id}>
                        {f.name}
                        <input
                          type="number"
                          min="0"
                          max="100000000"
                          aria-label={`ค่าผ้า ${part.name} ${f.name}`}
                          value={config.partFabric[part.id].rates[f.id] ?? ''}
                          onChange={(e) => {
                            const next = structuredClone(config);
                            if (e.target.value === '') delete next.partFabric[part.id].rates[f.id];
                            else next.partFabric[part.id].rates[f.id] = Number(e.target.value);
                            onChange(next);
                          }}
                        />
                      </label>
                    ))}
                </div>
              )}
            </div>
          ))}
      </details>
      <details>
        <summary>อัตราแลกเปลี่ยน THB / USD</summary>
        <p>
          เจ้าของกรอกเอง: เงินต่างประเทศ 1 หน่วย เท่ากับกี่กีบ เช่น 1 THB = … LAK
          ไม่ดึงอัตราอัตโนมัติ
        </p>
        <div className="pricing-fields">
          {(['THB', 'USD'] as const).map((currency) => (
            <label key={currency}>
              1 {currency} เท่ากับกี่กีบ
              <input
                aria-label={'อัตรา ' + currency}
                inputMode="decimal"
                value={config.fx[currency] ?? ''}
                onChange={(e) => {
                  const next = structuredClone(config);
                  next.fx[currency] = e.target.value === '' ? null : e.target.value;
                  onChange(next);
                }}
              />
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}
