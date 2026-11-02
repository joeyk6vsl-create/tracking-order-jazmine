import type { PaymentEntry } from '../../../../../packages/contracts/src/settlement';
import { MONEY_LABELS } from '../../../../../packages/contracts/src/settlement';
import { lak, shopDate } from './CommandResult';
import type { ReactNode } from 'react';
export function ReceiptContents({
  entry,
  children,
}: {
  entry: PaymentEntry;
  children?: ReactNode;
}) {
  return (
    <article className="panel pricing-panel invoice-print receipt-print">
      <h2>JAZMINE SPORTSWEAR</h2>
      <h2>ໃບຮັບເງິນ / Receipt · {entry.number}</h2>
      {entry.state === 'VOIDED' && <p className="alert error">VOIDED · {entry.voidReason}</p>}
      <p>
        Order {entry.snapshot.orderNumber} · v{entry.snapshot.orderRevision} · Invoice{' '}
        {entry.snapshot.invoiceNumber}
      </p>
      <p>
        ລູກຄ້າ / Customer: {entry.snapshot.customerName} · {entry.snapshot.phone}
      </p>
      <p>
        {entry.purpose === 'DEPOSIT' ? 'ມັດຈຳ / Deposit' : 'ຮັບເງິນ / Payment'} ·{' '}
        {MONEY_LABELS[entry.method]}
      </p>
      <strong>
        {entry.amount} {entry.currency}
      </strong>
      <p>
        1 {entry.currency} = {entry.exchangeRate} LAK · {lak(entry.lakAmount)}
      </p>
      <p>
        Received: {shopDate(entry.occurredAt)} · Recorded: {shopDate(entry.recordedAt)} · Lao time
      </p>
      <p>ຜູ້ຮັບ / Received by: {entry.actorName}</p>
      <p>Reference: {entry.reference || '-'}</p>
      <p className="work-notes">{entry.reason}</p>
      {children}
    </article>
  );
}
