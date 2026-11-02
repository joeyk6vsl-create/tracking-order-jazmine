import type { PaymentQrAttachment } from '../../../../../packages/contracts/src/payment-qr';
import './payment-qr.css';
export function PaymentQrCards({ items }: { items: PaymentQrAttachment[] }) {
  if (!items.length) return null;
  return (
    <section className="invoice-payment-qrs" aria-label="Bank payment QR codes">
      {items.map((item) => (
        <article className="invoice-payment-qr" key={item.currency}>
          <strong>
            {item.currency === 'LAK' ? 'ຈ່າຍເປັນກີບ / Pay in LAK' : 'ຈ່າຍເປັນບາດ / Pay in THB'}
          </strong>
          <img src={item.image} alt={'Bank payment QR ' + item.currency} width={150} height={150} />
          <p>
            {item.bankName}
            <br />
            {item.receiverName}
            <br />
            {item.accountReference}
          </p>
          <p>ກອກຍອດທີ່ຕົກລົງໃນແອັບທະນາຄານ / Enter the agreed amount in your bank app.</p>
          <p>ກວດຜູ້ຮັບ ແລະສະກຸນເງິນກ່ອນໂອນ / Verify recipient and currency.</p>
          <p>ສະແກນບໍ່ໄດ້ຢືນຢັນຮັບເງິນ / Scanning does not confirm payment.</p>
        </article>
      ))}
    </section>
  );
}
