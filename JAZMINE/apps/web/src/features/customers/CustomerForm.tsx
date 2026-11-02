import { useRef, useState, type FormEvent } from 'react';
import {
  BRANDING_TYPES,
  CUSTOMER_GROUPS,
  businessDate,
  createCustomerSchema,
  phoneMatchesSchema,
  type CustomerInput,
  type CustomerResult,
  type CustomerView,
} from '../../../../../packages/contracts/src/customers';
import { ApiError, errorMessage } from '../../services/api';
import { customerApi } from './customer-api';

interface Props {
  customer: CustomerView | null;
  canChangeStatus: boolean;
  onSaved: (result: CustomerResult) => void;
  onCancel: () => void;
}
export function CustomerForm({ customer, canChangeStatus, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<CustomerInput>({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    group: customer?.group ?? 'RETAIL',
    brandingType: customer?.brandingType ?? 'JAZMINE_STANDARD',
    customerSince: customer?.customerSince ?? businessDate(),
    notes: customer?.notes ?? '',
  });
  const [status, setStatus] = useState(customer?.status ?? 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<CustomerView[]>([]);
  const [uncertain, setUncertain] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const pending = useRef<CustomerInput | null>(null);
  const phoneRequest = useRef(0);
  function setField<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
    if (key === 'phone') {
      phoneRequest.current++;
      setMatches([]);
    }
  }
  async function checkPhone() {
    const input = phoneMatchesSchema.safeParse({ phone: draft.phone, excludeId: customer?.id });
    if (!input.success) return;
    const request = ++phoneRequest.current;
    try {
      const result = await customerApi.phoneMatches(input.data.phone, customer?.id);
      if (request === phoneRequest.current) setMatches(result);
    } catch {
      /* คำเตือนเป็นส่วนช่วย ยังมีการตรวจและคืนผลตอนบันทึก */
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = createCustomerSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError('');
    const input = uncertain && pending.current ? pending.current : parsed.data;
    pending.current = input;
    try {
      const result = customer
        ? await customerApi.update(customer.id, {
            ...input,
            status,
            rowVersion: customer.rowVersion,
          })
        : await customerApi.create(input, requestKey);
      setUncertain(false);
      onSaved(result);
    } catch (e) {
      setError(errorMessage(e));
      if (!customer && e instanceof ApiError && (e.status === 0 || e.status >= 500))
        setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel customer-editor">
      <div className="panel-heading">
        <h2>{customer ? 'ແກ້ໄຂຂໍ້ມູນລູກຄ້າ' : 'ເພີ່ມລູກຄ້າປະຈຳ'}</h2>
        <button onClick={onCancel} disabled={busy}>
          ກັບຄືນ
        </button>
      </div>
      <p className="muted">
        บันทึกเฉพาะรายชื่อที่ต้องการเลือกใช้ซ้ำ ลูกค้าขาจรจะกรอกเฉพาะออเดอร์ในขั้นถัดไป
      </p>
      <form onSubmit={submit} className="form-stack">
        <fieldset disabled={busy || uncertain} className="customer-fields">
          <div className="form-grid">
            <label>
              ຊື່ລູກຄ້າ / ຊື່ທີມ
              <input
                name="customerName"
                required
                maxLength={150}
                value={draft.name}
                onChange={(e) => setField('name', e.target.value)}
                autoFocus
              />
            </label>
            <label>
              ເບີໂທ
              <input
                name="customerPhone"
                required
                maxLength={40}
                type="tel"
                value={draft.phone}
                onChange={(e) => setField('phone', e.target.value)}
                onBlur={() => void checkPhone()}
              />
            </label>
            <label>
              ກຸ່ມລາຄາ
              <select
                name="customerGroup"
                value={draft.group}
                onChange={(e) => setField('group', e.target.value as CustomerInput['group'])}
              >
                {CUSTOMER_GROUPS.map((group) => (
                  <option value={group} key={group}>
                    {group === 'RETAIL' ? 'RETAIL · ຂາຍຍ່ອຍ' : group}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ແບຣນສຳລັບຜະລິດ
              <select
                name="brandingType"
                value={draft.brandingType}
                onChange={(e) =>
                  setField('brandingType', e.target.value as CustomerInput['brandingType'])
                }
              >
                {BRANDING_TYPES.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand === 'JAZMINE_STANDARD'
                      ? 'JAZMINE STANDARD'
                      : 'CUSTOM AGENT · ແບຣນລູກຄ້າ'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ເລີ່ມເປັນລູກຄ້າ
              <input
                type="date"
                name="customerSince"
                required
                value={draft.customerSince}
                onChange={(e) => setField('customerSince', e.target.value)}
              />
            </label>
            {customer && canChangeStatus && (
              <label>
                ສະຖານະ
                <select
                  name="customerStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CustomerView['status'])}
                >
                  <option value="ACTIVE">ໃຊ້ງານ</option>
                  <option value="INACTIVE">ປິດການໃຊ້ງານ</option>
                </select>
              </label>
            )}
          </div>
          <label className="customer-notes-label">
            ໝາຍເຫດ
            <textarea
              name="customerNotes"
              rows={3}
              maxLength={2000}
              value={draft.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </label>
        </fieldset>
        {matches.length > 0 && (
          <div className="alert warning" role="status">
            <strong>พบลูกค้าที่ใช้เบอร์เดียวกัน</strong>
            <ul>
              {matches.map((match) => (
                <li key={match.id}>
                  {match.name} · {match.group}
                </li>
              ))}
            </ul>
            <p>บันทึกต่อได้ถ้าเป็นคนละรายหรือคนละแบรนด์ ระบบไม่รวมข้อมูลให้เอง</p>
          </div>
        )}
        <p className="field-help">
          ป้ายคอและเทปคอจะตั้งค่าในขั้นระบบไฟล์ภาพ
          การบันทึกชื่อแบรนด์ยังไม่ใช่การรับรองว่าไฟล์ผลิตครบ
        </p>
        {uncertain && (
          <p className="alert warning" role="status">
            ยังตรวจผลการบันทึกไม่ได้ กรุณาลองตรวจคำขอเดิมก่อนแก้ข้อมูล เพื่อป้องกันสร้างรายชื่อซ้ำ
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'ກຳລັງບັນທຶກ…' : uncertain ? 'ລອງບັນທຶກຄຳຂໍເດີມ' : 'ບັນທຶກລູກຄ້າ'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel}>
            ຍົກເລີກ
          </button>
        </div>
      </form>
    </section>
  );
}
