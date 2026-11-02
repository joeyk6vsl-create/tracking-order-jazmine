import { useEffect, useRef, useState } from 'react';
import { StoredDocumentPanel } from '../documents/StoredDocumentPanel';
import type { SettlementView } from '../../../../../packages/contracts/src/settlement';
import { MONEY_LABELS } from '../../../../../packages/contracts/src/settlement';
import { api, errorMessage } from '../../services/api';
import { PaymentForm, RefundForm, VoidPaymentForm } from './PaymentForm';
import { ShipmentPrepareForm, ShipmentActions, ShipmentTrackingForm } from './ShipmentForms';
import { PaymentReceipt } from './PaymentReceipt';
import { lak, shopDate } from './CommandResult';
import './settlements.css';
import { TrackingManager } from '../tracking/TrackingManager';
import { OrderLifecyclePanel } from './OrderLifecyclePanel';
import { AutoArchiveSettings } from './AutoArchiveSettings';

type OrderChoice = {
  id: string;
  orderNumber: string;
  customerName: string;
  businessState: string;
  storageState: string;
};
const moneyLabels = {
  UNPAID: 'ຍັງບໍ່ຈ່າຍ / Unpaid',
  PARTIALLY_PAID: 'ຈ່າຍບາງສ່ວນ / Partially paid',
  PAID: 'ຈ່າຍຄົບ / Paid',
  OVERPAID: 'ຈ່າຍເກີນ / Overpaid',
};
const deliveryLabels = {
  NOT_SHIPPED: 'ຍັງບໍ່ສົ່ງ / Not shipped',
  PARTIALLY_SHIPPED: 'ສົ່ງບາງສ່ວນ / Partially shipped',
  COMPLETED: 'ສົ່ງຄົບ / Delivered in full',
};
export function SettlementsPage() {
  const [orders, setOrders] = useState<OrderChoice[]>([]);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.search).get('settlementOrder') ?? '',
  );
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [view, setView] = useState<SettlementView | null>(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const [frozen, setFrozen] = useState(false),
    [tick, setTick] = useState(0);
  const [correcting, setCorrecting] = useState(''),
    [refunding, setRefunding] = useState(''),
    [receipt, setReceipt] = useState(
      () => new URLSearchParams(location.search).get('paymentEntry') ?? '',
    );
  const formRef = useRef<HTMLDivElement>(null);
  function refresh() {
    setTick((n) => n + 1);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      api<{ orders: OrderChoice[] }>(
        `/settlements/orders?search=${encodeURIComponent(query)}&includeArchived=${includeArchived}`,
      ),
      selected ? api<SettlementView>(`/settlements/orders/${selected}`) : Promise.resolve(null),
    ])
      .then(([list, detail]) => {
        if (active) {
          setOrders(list.orders);
          setView(detail);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, selected, tick, includeArchived]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !frozen) refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [frozen]);
  const current = view?.orderId === selected ? view : null;
  const cancellationPending =
    current?.lifecycle.business === 'CANCELLED' && current.lifecycle.agreedTotal === null;
  const correctingEntry = current?.payments.find((p) => p.id === correcting) ?? null;
  const refundEntry = current?.payments.find((p) => p.id === refunding);
  const receiptEntry = current?.payments.find((p) => p.id === receipt);
  const disabled = frozen || loading;
  const actions = current && { view: current, disabled, onChanged: refresh, onFreeze: setFrozen };
  function choose(id: string) {
    setSelected(id);
    setCorrecting('');
    setRefunding('');
    setReceipt('');
  }
  function showForm() {
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
  return (
    <div className="settlement-page">
      <AutoArchiveSettings />
      <div className="page-heading">
        <div>
          <span className="section-label">PAYMENTS & DELIVERY</span>
          <h1>ຮັບເງິນ ແລະ ສົ່ງສິນຄ້າ</h1>
          <p className="muted">ມັດຈຳ · ປະຫວັດການເງິນ · ຮັບເອງ/ຈັດສົ່ງ</p>
        </div>
        <button disabled={disabled} onClick={refresh}>
          Refresh
        </button>
      </div>
      <section className="panel pricing-panel">
        <form
          className="settlement-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <label>
            ຄົ້ນຫາ / Search
            <input
              aria-label="Settlement search"
              value={search}
              maxLength={100}
              disabled={disabled}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button disabled={disabled}>Search</button>
        </form>
        <label>
          ອໍເດີ / Order
          <select
            aria-label="Settlement order"
            value={selected}
            disabled={disabled}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">ກະລຸນາເລືອກ / Select order</option>
            {selected && !orders.some((o) => o.id === selected) && (
              <option value={selected}>{current?.orderNumber ?? selected}</option>
            )}
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber} · {o.customerName}
                {o.businessState === 'CANCELLED' ? ' · Cancelled' : ''}
                {o.storageState === 'ARCHIVED' ? ' · Archived' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">ສະແດງ 50 ອໍເດີຫຼ້າສຸດ · ຄົ້ນຫາເພື່ອເປີດລາຍການເກົ່າ</p>
        <label className="lifecycle-review">
          <input
            type="checkbox"
            aria-label="Include archived orders"
            disabled={disabled}
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          ລວມອໍເດີໃນ Archive / Include archived orders
        </label>
      </section>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">ກຳລັງໂຫຼດ / Loading…</p>}
      {current && actions && (
        <>
          <section className="panel pricing-panel">
            <h2>
              {current.orderNumber} · v{current.revision}
            </h2>
            <p>
              {current.customerName} · {current.phone} · {current.invoiceNumber}
            </p>
            <div className="settlement-totals">
              <div>
                <span>ຍອດອໍເດີ / Total</span>
                <strong>{lak(current.money.total)}</strong>
              </div>
              <div>
                <span>ຮັບສຸດທິ / Net paid</span>
                <strong>{lak(current.money.netPaid)}</strong>
              </div>
              <div>
                <span>ຍອດຄ້າງ / Due</span>
                <strong>
                  {cancellationPending ? 'ລໍຖ້າຕົກລົງ / Pending agreement' : lak(current.money.due)}
                </strong>
              </div>
            </div>
            <p>
              Payment:{' '}
              <b>
                {cancellationPending
                  ? 'ລໍຖ້າເຈົ້າຂອງ / Owner decision required'
                  : moneyLabels[current.money.status]}
              </b>{' '}
              · Delivery: <b>{deliveryLabels[current.delivery.status]}</b> · Order:{' '}
              <b>
                {current.delivery.orderStatus === 'CANCELLED'
                  ? 'ຍົກເລີກແລ້ວ / Cancelled'
                  : current.delivery.orderStatus === 'COMPLETED'
                    ? 'ສຳເລັດ / Completed'
                    : 'ຢືນຢັນແລ້ວ / Confirmed'}
              </b>
            </p>
            <p>
              ຮັບທັງໝົດ {lak(current.money.received)} · ຄືນແລ້ວ {lak(current.money.refunded)}
            </p>
            {current.money.resolutionRequired && !cancellationPending && (
              <p className="alert warning">
                ຮັບເກີນ {lak(current.money.overpaid)} · ໃຫ້ເຈົ້າຂອງກວດແລະຈັດການ ·
                ລະບົບບໍ່ຄືນເງິນອັດຕະໂນມັດ
              </p>
            )}
            {current.delivery.reviewRequired && (
              <p className="alert warning">
                ອໍເດີປ່ຽນຫຼັງກຽມ/ສົ່ງ · ກວດລາຍການເກົ່າກ່ອນ (Unmatched{' '}
                {current.delivery.unmatchedQuantity}, Excess {current.delivery.excessQuantity})
              </p>
            )}
            <p>
              ພ້ອມສົ່ງ / Ready: <b>{current.delivery.readyQuantity}</b> · ຢືນຢັນສົ່ງແລ້ວ / Shipped:{' '}
              <b>{current.delivery.shippedQuantity}</b>
            </p>
            <div className="settlement-table">
              <table>
                <thead>
                  <tr>
                    <th>ລາຍການ / Item</th>
                    <th>Size</th>
                    <th>Total</th>
                    <th>Prepared</th>
                    <th>Shipped</th>
                    <th>Ready</th>
                  </tr>
                </thead>
                <tbody>
                  {current.delivery.lines.map((l) => (
                    <tr key={l.lineIndex}>
                      <td>{l.name}</td>
                      <td>{l.size}</td>
                      <td>{l.quantity}</td>
                      <td>{l.prepared}</td>
                      <td>{l.shipped}</td>
                      <td>{l.ready}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <OrderLifecyclePanel
            key={current.orderId}
            orderId={current.orderId}
            version={current.version}
            disabled={disabled}
            onChanged={refresh}
            onFreeze={setFrozen}
          />
          <div ref={formRef}>
            {refundEntry && current.canRefund ? (
              <RefundForm
                key={`${current.orderId}:${current.version}:${refundEntry.id}`}
                {...actions}
                entry={refundEntry}
                onClose={() => setRefunding('')}
              />
            ) : (
              <PaymentForm
                key={`${current.orderId}:${current.version}:${correcting}`}
                {...actions}
                disabled={
                  disabled ||
                  correctingEntry?.state === 'VOIDED' ||
                  (!!cancellationPending && !correctingEntry)
                }
                correcting={correctingEntry}
                onClose={() => setCorrecting('')}
              />
            )}
          </div>
          <section className="panel pricing-panel">
            <h2>ປະຫວັດເງິນ / Payment history</h2>
            {!current.payments.length && <p>ຍັງບໍ່ມີລາຍການ / No payments</p>}
            {current.payments.map((entry) => {
              const noRefund = entry.refundable === entry.amount;
              return (
                <article className="settlement-record" key={entry.id}>
                  <h3>
                    {entry.number} · {entry.kind} · {entry.state}
                  </h3>
                  <p>
                    <b>
                      {entry.amount} {entry.currency}
                    </b>{' '}
                    · {lak(entry.lakAmount)} · {MONEY_LABELS[entry.method]}
                  </p>
                  <p>
                    {entry.actorName} · {shopDate(entry.occurredAt)} · Lao time · FX{' '}
                    {entry.exchangeRate}
                  </p>
                  <p className="work-notes">{entry.reason}</p>
                  {entry.correctsId && (
                    <p>
                      Corrects:{' '}
                      {current.payments.find((p) => p.id === entry.correctsId)?.number ??
                        entry.correctsId}
                    </p>
                  )}
                  {entry.receiptId && (
                    <p>
                      Receipt:{' '}
                      {current.payments.find((p) => p.id === entry.receiptId)?.number ??
                        entry.receiptId}
                    </p>
                  )}
                  {entry.voidReason && <p>Void: {entry.voidReason}</p>}
                  <div className="settlement-buttons">
                    {entry.kind === 'RECEIPT' && (
                      <button
                        disabled={disabled}
                        onClick={() => {
                          setReceipt(entry.id);
                          requestAnimationFrame(() =>
                            document
                              .querySelector('.receipt-print')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          );
                        }}
                      >
                        ໃບຮັບເງິນ / Receipt
                      </button>
                    )}
                    {entry.kind === 'RECEIPT' && entry.state === 'ACTIVE' && (
                      <>
                        {noRefund && (
                          <button
                            disabled={disabled}
                            onClick={() => {
                              setCorrecting(entry.id);
                              setRefunding('');
                              showForm();
                            }}
                          >
                            ແກ້ລາຍການ / Correct
                          </button>
                        )}
                        {current.canRefund && entry.refundable !== '0.00' && (
                          <button
                            disabled={disabled}
                            onClick={() => {
                              setRefunding(entry.id);
                              setCorrecting('');
                              showForm();
                            }}
                          >
                            ຄືນເງິນ / Refund
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {entry.state === 'ACTIVE' &&
                    ((entry.kind === 'RECEIPT' && noRefund) ||
                      (entry.kind === 'REFUND' && current.canRefund)) && (
                      <VoidPaymentForm key={current.version} entry={entry} {...actions} />
                    )}
                </article>
              );
            })}
          </section>
          {current.lifecycle.business === 'ACTIVE' && current.lifecycle.storage === 'ACTIVE' && (
            <ShipmentPrepareForm
              key={`${current.orderId}:${current.revision}:${current.version}`}
              {...actions}
            />
          )}
          <TrackingManager
            key={current.orderId}
            orderId={current.orderId}
            disabled={disabled}
            onFreeze={setFrozen}
          />
          <section className="panel pricing-panel">
            <h2>ປະຫວັດສົ່ງ / Delivery history</h2>
            {!current.shipments.length && <p>ຍັງບໍ່ມີລາຍການ / No deliveries</p>}
            {current.shipments.map((shipment) => (
              <article className="settlement-record" key={shipment.id}>
                <h3>
                  {shipment.number} · {shipment.state} · Order v{shipment.orderRevision}
                </h3>
                <p>
                  {shipment.method === 'CUSTOMER_PICKUP'
                    ? 'ລູກຄ້າຮັບເອງ / Pickup'
                    : 'ຮ້ານຈັດສົ່ງ / Delivery'}{' '}
                  · {shipment.recipient} · {shipment.phone}
                </p>
                <p>
                  {shipment.address} · {shipment.carrier} · {shipment.tracking}
                </p>
                <p className="work-notes">{shipment.notes}</p>
                <ul>
                  {shipment.items.map((item) => (
                    <li key={item.lineIndex}>
                      {item.name} · Size {item.size} × {item.quantity}
                    </li>
                  ))}
                </ul>
                <p>
                  Prepared: {shipment.preparedName} · {shopDate(shipment.preparedAt)} · Lao time
                </p>
                {shipment.confirmedAt && (
                  <p>
                    Confirmed: {shipment.confirmedName} · {shopDate(shipment.confirmedAt)} · Lao
                    time {shipment.confirmedEarly && '· ຢືນຢັນລ່ວງໜ້າ / Confirmed in advance'}
                  </p>
                )}
                {shipment.cancelReason && <p>Cancel: {shipment.cancelReason}</p>}
                {shipment.state !== 'CANCELLED' && (
                  <>
                    <ShipmentActions
                      key={`action:${current.version}`}
                      shipment={shipment}
                      {...actions}
                    />
                    <ShipmentTrackingForm
                      key={`tracking:${current.version}`}
                      shipment={shipment}
                      {...actions}
                    />
                  </>
                )}
                {shipment.updates.length > 0 && (
                  <details>
                    <summary>Tracking history ({shipment.updates.length})</summary>
                    {shipment.updates.map((u, index) => (
                      <p className="work-notes" key={index}>
                        {u.actorName} · {shopDate(u.at)} · Lao time · {u.reason}
                        <br />
                        {u.before.carrier} / {u.before.tracking} / {u.before.notes} →{' '}
                        {u.after.carrier} / {u.after.tracking} / {u.after.notes}
                      </p>
                    ))}
                  </details>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {receiptEntry?.kind === 'RECEIPT' && (
        <>
          <StoredDocumentPanel
            key={receiptEntry.id + ':' + receiptEntry.state}
            kind="RECEIPT"
            sourceId={receiptEntry.id}
            version={1}
          />
          <PaymentReceipt entry={receiptEntry} />
        </>
      )}
    </div>
  );
}
