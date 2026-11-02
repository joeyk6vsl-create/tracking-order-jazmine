import type { ConfirmedOrder } from '../../../../../packages/contracts/src/confirmation';
import { InvoiceTrackingQr } from './InvoiceTrackingQr';
import { StoredDocumentPanel } from '../documents/StoredDocumentPanel';
import { useRef } from 'react';
import { InvoicePaymentQr, type PaymentQrPrintGuard } from '../payment-qr/InvoicePaymentQr';
import {
  CurrentDocumentBanner,
  useCurrentDocumentStatus,
} from '../documents/CurrentDocumentStatus';
export function InvoiceView({ order }: { order: ConfirmedOrder }) {
  const paymentGuard = useRef<PaymentQrPrintGuard>(null);
  const current = useCurrentDocumentStatus('INVOICE', order.id, order.revision);
  const { snapshot } = order,
    lines = snapshot.input.lines.length ? snapshot.input.lines : [snapshot.input.quote];
  function name(id: string) {
    return snapshot.selections.find((i) => i.id === id)?.name ?? 'รายการที่บันทึกไว้';
  }
  return (
    <article className="panel pricing-panel invoice-print">
      <h2>JAZMINE SPORTSWEAR</h2>
      <h2>ใบแจ้งหนี้ · {order.invoiceNumber}</h2>
      <p>
        ออเดอร์ {order.orderNumber} · ฉบับ {order.revision}
      </p>
      <p>
        ลูกค้า {snapshot.input.customerName} · {snapshot.input.phone}
      </p>
      <p>
        แบรนด์ {snapshot.input.brandingType === 'JAZMINE_STANDARD' ? 'JAZMINE' : 'แบรนด์ลูกค้า'} ·
        กลุ่มราคา {snapshot.input.quote.group}
      </p>
      <p>
        ยืนยัน {new Date(order.confirmedAt).toLocaleString('th-TH')} · กำหนดส่ง {snapshot.dueDate}
      </p>
      <p className="muted no-print">บนมือถือเลื่อนตารางด้านข้างเพื่อดูยอดแต่ละรายการ</p>
      <div className="pricing-scroll">
        <table>
          <thead>
            <tr>
              <th>รายการ</th>
              <th>ไซซ์</th>
              <th>ซื้อ</th>
              <th>แถม</th>
              <th>ยอดก่อนลด (กีบ)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const pricing = snapshot.pricing.linePricing?.[index] ?? snapshot.pricing;
              return (
                <tr key={index}>
                  <td>
                    {name(line.productId)}
                    <br />
                    {name(line.fabricId)}
                    {line.parts.map((p) => (
                      <span key={p.componentId}>
                        <br />
                        {name(p.componentId)}
                        {p.fabricId ? ' · ' + name(p.fabricId) : ''}
                      </span>
                    ))}
                  </td>
                  <td>{line.size}</td>
                  <td>{line.quantity}</td>
                  <td>{pricing.freeQuantity}</td>
                  <td>{pricing.subtotal?.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        ยอดก่อนลด {snapshot.pricing.subtotal?.toLocaleString()} กีบ · ลด {snapshot.pricing.percent}%
        แล้วลดเงิน {snapshot.pricing.fixed.toLocaleString()} กีบ
      </p>
      <strong>ยอดสุทธิ {snapshot.pricing.total?.toLocaleString()} กีบ</strong>
      <p>
        ยอดแสดง {snapshot.pricing.convertedTotal} {snapshot.pricing.displayCurrency} · อัตรา{' '}
        {snapshot.pricing.exchangeRate} LAK ต่อ 1 {snapshot.pricing.displayCurrency}
      </p>
      <p>
        จำนวนผลิตรวม {snapshot.pricing.productionQuantity} ตัว รวมของแถม{' '}
        {snapshot.pricing.freeQuantity} ตัว
      </p>
      <p>
        ราคาฉบับ {snapshot.pricing.revision} · ข้อมูลนี้เก็บ ณ ตอนยืนยัน ไม่คำนวณตามราคาปัจจุบัน
      </p>
      <details>
        <summary>ไฟล์ที่ใช้ในออเดอร์ฉบับนี้</summary>
        {snapshot.assets.map((a) => (
          <p key={a.id}>
            <a href={`/api/v1/graphic-assets/${a.id}/content`} target="_blank" rel="noreferrer">
              {a.filename} · ฉบับ {a.revision}
            </a>
          </p>
        ))}
      </details>
      <p>ใบแจ้งหนี้ยังไม่ใช่หลักฐานรับเงิน · งานรอเตรียมใบผลิต ยังไม่เริ่มผลิตอัตโนมัติ</p>
      <CurrentDocumentBanner status={current.status} />
      {current.error && (
        <p role="alert" className="no-print">
          {current.error}
        </p>
      )}
      <InvoicePaymentQr key={'payment:' + order.id + ':' + order.revision} ref={paymentGuard} />
      <InvoiceTrackingQr
        key={'tracking:' + order.id + ':' + order.revision}
        orderId={order.id}
        beforePrint={async () => {
          if (!paymentGuard.current) throw new Error('Wait for payment QR controls');
          const release = await paymentGuard.current.beforePrint();
          try {
            await current.check();
            return release;
          } catch (e) {
            release();
            throw e;
          }
        }}
      />
      <StoredDocumentPanel
        key={
          'stored:' +
          order.id +
          ':' +
          order.revision +
          ':' +
          order.businessState +
          ':' +
          order.storageState
        }
        kind="INVOICE"
        sourceId={order.id}
        version={order.revision}
      />
    </article>
  );
}
