import { CalendarDays, ChevronLeft, Pencil, Phone, Tag } from 'lucide-react';
import type { CustomerView } from '../../../../../packages/contracts/src/customers';
import { BrandAssetLibrary } from '../assets/BrandAssetLibrary';

interface Props {
  customer: CustomerView;
  onBack: () => void;
  onEdit: () => void;
}
export function CustomerDetail({ customer, onBack, onEdit }: Props) {
  return (
    <>
      <div className="page-heading">
        <div>
          <button className="customer-back" onClick={onBack}>
            <ChevronLeft size={16} />
            ລາຍຊື່ລູກຄ້າ
          </button>
          <span className="section-label">CUSTOMER PROFILE</span>
          <h1>{customer.name}</h1>
          <p className="muted">ລູກຄ້າປະຈຳ · {customer.group}</p>
        </div>
        <button className="primary" onClick={onEdit}>
          <Pencil size={17} />
          ແກ້ໄຂຂໍ້ມູນ
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>ຂໍ້ມູນຕິດຕໍ່</h2>
          <dl className="detail-list">
            <div>
              <dt>
                <Phone size={15} /> ເບີໂທ
              </dt>
              <dd>{customer.phone}</dd>
            </div>
            <div>
              <dt>
                <Tag size={15} /> ກຸ່ມລາຄາ
              </dt>
              <dd>{customer.group}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={15} /> ເລີ່ມເປັນລູກຄ້າ
              </dt>
              <dd>
                {new Intl.DateTimeFormat('lo-LA', {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Vientiane',
                }).format(new Date(customer.customerSince + 'T00:00:00Z'))}
              </dd>
            </div>
            <div>
              <dt>ສະຖານະ</dt>
              <dd>
                <span className={'badge ' + (customer.status === 'ACTIVE' ? 'positive' : '')}>
                  {customer.status === 'ACTIVE' ? 'ໃຊ້ງານ' : 'ປິດການໃຊ້ງານ'}
                </span>
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>ແບຣນສຳລັບຜະລິດ</h2>
          <p className="customer-brand">
            {customer.brandingType === 'JAZMINE_STANDARD' ? 'JAZMINE STANDARD' : 'CUSTOM AGENT'}
          </p>
          <p className="muted">
            {customer.brandingType === 'CUSTOM_AGENT'
              ? 'แบรนด์ของลูกค้ารายนี้'
              : 'ใช้แบรนด์หลักของร้าน'}
          </p>
          <p className="notice">
            {customer.brandingType === 'CUSTOM_AGENT'
              ? 'ບັນທຶກປ້າຍຄໍ ແລະເທບຄໍຂ້າງລຸ່ມ / Save this customer’s label and tape below. Future orders use them automatically.'
              : 'ໃຊ້ປ້າຍຄໍ/ເທບຄໍ JAZMINE / Uses the shared JAZMINE label and tape.'}
          </p>
        </section>
      </div>
      {customer.brandingType === 'CUSTOM_AGENT' && (
        <BrandAssetLibrary key={customer.id} customerId={customer.id} name={customer.name} />
      )}
      <section className="panel customer-notes">
        <h2>ໝາຍເຫດ</h2>
        <p>{customer.notes || 'ຍັງບໍ່ມີໝາຍເຫດ'}</p>
      </section>
    </>
  );
}
