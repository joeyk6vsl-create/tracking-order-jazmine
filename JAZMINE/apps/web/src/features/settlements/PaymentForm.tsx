import { useState } from 'react';
import {
  CURRENCIES,
  MONEY_METHODS,
  MONEY_LABELS,
  type PaymentEntry,
} from '../../../../../packages/contracts/src/settlement';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import {
  CommandResult,
  base,
  localNow,
  shopInstant,
  type SettlementActions,
} from './CommandResult';
export function PaymentForm({
  view,
  disabled,
  onChanged,
  onFreeze,
  correcting,
  onClose,
}: { correcting: PaymentEntry | null; onClose: () => void } & SettlementActions) {
  const [amount, setAmount] = useState(correcting?.amount ?? ''),
    [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(correcting?.currency ?? 'LAK'),
    [method, setMethod] = useState<(typeof MONEY_METHODS)[number]>(correcting?.method ?? 'CASH'),
    [purpose, setPurpose] = useState<'DEPOSIT' | 'PAYMENT'>(
      correcting?.purpose === 'DEPOSIT' ? 'DEPOSIT' : 'PAYMENT',
    ),
    [reference, setReference] = useState(correcting?.reference ?? ''),
    [occurred, setOccurred] = useState(localNow),
    [reason, setReason] = useState('');
  const command = useRecordedCommand(onChanged, onFreeze),
    rate = currency === 'LAK' ? '1' : view.rates[currency];
  return (
    <form
      className="panel pricing-panel"
      aria-label="Receive payment"
      onSubmit={(e) => {
        e.preventDefault();
        void command
          .send(
            `/settlements/orders/${view.orderId}/receipts`,
            {
              ...base(view, reason),
              amount,
              currency,
              method,
              purpose,
              reference,
              occurredAt: shopInstant(occurred),
              rateRevision: view.rates.revision,
              ...(correcting ? { replaceReceiptId: correcting.id } : {}),
            },
            onClose,
          )
          .then((ok) => {
            if (ok) {
              setAmount('');
              setReason('');
            }
          });
      }}
    >
      <h2>
        {correcting ? 'ແກ້ລາຍການເງິນ / Correct ' + correcting.number : 'ຮັບເງິນ / Receive payment'}
      </h2>
      {correcting && <p>ລາຍການເກົ່າຈະຖືກ Void ແລະສ້າງໃບໃໝ່ ໂດຍເກັບປະຫວັດເດີມ</p>}
      <fieldset
        className="draft-fields settlement-fields"
        disabled={disabled || command.busy || !!command.pending}
      >
        <label>
          ປະເພດ / Purpose
          <select
            aria-label="Payment purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as typeof purpose)}
          >
            <option value="DEPOSIT">ມັດຈຳ / Deposit</option>
            <option value="PAYMENT">ຮັບເພີ່ມ / Payment</option>
          </select>
        </label>
        <label>
          ຈຳນວນ / Amount
          <input
            aria-label="Payment amount"
            required
            inputMode="decimal"
            value={amount}
            maxLength={16}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          ສະກຸນເງິນ / Currency
          <select
            aria-label="Payment currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as typeof currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          ຊ່ອງທາງ / Method
          <select
            aria-label="Payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            {MONEY_METHODS.map((m) => (
              <option key={m} value={m}>
                {MONEY_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          ເລກອ້າງອີງ / Reference
          <input
            aria-label="Payment reference"
            maxLength={200}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label>
          ວັນເວລາລາວ / Received at (Lao time)
          <input
            aria-label="Payment date"
            type="datetime-local"
            required
            value={occurred}
            onChange={(e) => setOccurred(e.target.value)}
          />
        </label>
        <label className="settlement-wide">
          ເຫດຜົນ / Reason
          <textarea
            aria-label="Payment reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="settlement-wide">
          1 {currency} = {rate ?? 'ຍັງບໍ່ກຳນົດ / Not set'} LAK · ອັດຕາຈາກເຈົ້າຂອງ · LAK ເປັນກີບເຕັມ
        </p>
        <button className="primary" disabled={!rate || !amount || !reason.trim()}>
          {correcting ? 'ບັນທຶກແກ້ໄຂ / Correct payment' : 'ບັນທຶກຮັບເງິນ / Receive'}
        </button>
        {correcting && (
          <button type="button" onClick={onClose}>
            ປິດ / Close
          </button>
        )}
      </fieldset>
      <CommandResult command={command} />
    </form>
  );
}
export function RefundForm({
  view,
  entry,
  disabled,
  onChanged,
  onFreeze,
  onClose,
}: { entry: PaymentEntry; onClose: () => void } & SettlementActions) {
  const [amount, setAmount] = useState(''),
    [method, setMethod] = useState<(typeof MONEY_METHODS)[number]>(entry.method),
    [reason, setReason] = useState(''),
    [reference, setReference] = useState(''),
    [occurred, setOccurred] = useState(localNow),
    command = useRecordedCommand(onChanged, onFreeze);
  return (
    <form
      className="panel pricing-panel"
      aria-label="Refund payment"
      onSubmit={(e) => {
        e.preventDefault();
        void command
          .send(
            `/settlements/orders/${view.orderId}/refunds`,
            {
              ...base(view, reason),
              receiptId: entry.id,
              amount,
              method,
              reference,
              occurredAt: shopInstant(occurred),
            },
            onClose,
          )
          .then((ok) => {
            if (ok) onClose();
          });
      }}
    >
      <h2>ຄືນເງິນ / Refund · {entry.number}</h2>
      <p>
        ຄືນໄດ້ອີກ {entry.refundable} {entry.currency} · ໃຊ້ສະກຸນເງິນແລະອັດຕາຂອງໃບຮັບເງິນເດີມ
      </p>
      <fieldset
        className="draft-fields settlement-fields"
        disabled={disabled || command.busy || !!command.pending}
      >
        <label>
          ຈຳນວນ / Amount
          <input
            aria-label="Refund amount"
            required
            inputMode="decimal"
            maxLength={16}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => setAmount(entry.refundable)}>
          ຄືນທີ່ເຫຼືອທັງໝົດ / Full remaining refund
        </button>
        <label>
          ຊ່ອງທາງ / Method
          <select
            aria-label="Refund method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            {MONEY_METHODS.map((m) => (
              <option key={m} value={m}>
                {MONEY_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          ອ້າງອີງ / Reference
          <input
            aria-label="Refund reference"
            value={reference}
            maxLength={200}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label>
          ວັນເວລາລາວ / Refunded at (Lao time)
          <input
            aria-label="Refund date"
            type="datetime-local"
            required
            value={occurred}
            onChange={(e) => setOccurred(e.target.value)}
          />
        </label>
        <label className="settlement-wide">
          ເຫດຜົນ / Reason
          <textarea
            aria-label="Refund reason"
            required
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!reason.trim() || !amount}>
          ບັນທຶກຄືນເງິນ / Refund
        </button>
        <button type="button" onClick={onClose}>
          ປິດ / Close
        </button>
      </fieldset>
      <CommandResult command={command} />
    </form>
  );
}
export function VoidPaymentForm({
  entry,
  ...actions
}: { entry: PaymentEntry } & SettlementActions) {
  const [reason, setReason] = useState(''),
    command = useRecordedCommand(actions.onChanged, actions.onFreeze);
  return (
    <details>
      <summary>ຍົກເລີກລາຍການຜິດ / Void entry</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void command.send(
            `/settlements/orders/${actions.view.orderId}/entries/${entry.id}/void`,
            base(actions.view, reason),
          );
        }}
      >
        <fieldset
          className="draft-fields"
          disabled={actions.disabled || command.busy || !!command.pending}
        >
          <label>
            ເຫດຜົນ / Reason
            <input
              aria-label={`Void reason ${entry.number}`}
              required
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={!reason.trim()}>Void {entry.number}</button>
        </fieldset>
        <CommandResult command={command} />
      </form>
    </details>
  );
}
