import { useState } from 'react';
import type { ShipmentView } from '../../../../../packages/contracts/src/settlement';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import { CommandResult, base, type SettlementActions } from './CommandResult';
export function ShipmentPrepareForm({ view, disabled, onChanged, onFreeze }: SettlementActions) {
  const [method, setMethod] = useState<'CUSTOMER_PICKUP' | 'SHOP_DELIVERY'>('CUSTOMER_PICKUP'),
    [recipient, setRecipient] = useState(view.customerName),
    [phone, setPhone] = useState(view.phone),
    [address, setAddress] = useState(''),
    [carrier, setCarrier] = useState(''),
    [tracking, setTracking] = useState(''),
    [notes, setNotes] = useState(''),
    [reason, setReason] = useState(''),
    [counts, setCounts] = useState<Record<number, number>>({}),
    command = useRecordedCommand(onChanged, onFreeze);
  return (
    <form
      className="panel pricing-panel"
      aria-label="Prepare shipment"
      onSubmit={(e) => {
        e.preventDefault();
        void command
          .send(`/settlements/orders/${view.orderId}/shipments`, {
            ...base(view, reason),
            method,
            recipient,
            phone,
            address,
            carrier,
            tracking,
            notes,
            items: view.delivery.lines
              .filter((l) => (counts[l.lineIndex] ?? 0) > 0)
              .map((l) => ({ lineIndex: l.lineIndex, quantity: counts[l.lineIndex] })),
          })
          .then((ok) => {
            if (ok) {
              setCounts({});
              setReason('');
            }
          });
      }}
    >
      <h2>ກຽມສົ່ງ / Prepare delivery</h2>
      <p>Prepared ຍັງບໍ່ນັບວ່າສົ່ງ · ຢືນຢັນໄດ້ເມື່ອມີ Ready ພໍ</p>
      <fieldset
        className="draft-fields settlement-fields"
        disabled={disabled || command.busy || !!command.pending}
      >
        <label>
          ວິທີ / Method
          <select
            aria-label="Shipment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="CUSTOMER_PICKUP">ລູກຄ້າຮັບເອງ / Pickup</option>
            <option value="SHOP_DELIVERY">ຮ້ານຈັດສົ່ງ / Delivery</option>
          </select>
        </label>
        <label>
          ຜູ້ຮັບ / Recipient
          <input
            aria-label="Shipment recipient"
            required
            value={recipient}
            maxLength={120}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>
        <label>
          ເບີໂທ / Phone
          <input
            aria-label="Shipment phone"
            maxLength={40}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        {method === 'SHOP_DELIVERY' && (
          <>
            <label>
              ທີ່ຢູ່ / Address
              <textarea
                aria-label="Shipment address"
                required
                value={address}
                maxLength={1000}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label>
              ຂົນສົ່ງ / Carrier
              <input
                aria-label="Shipment carrier"
                maxLength={120}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </label>
            <label>
              ເລກຕິດຕາມ / Tracking
              <input
                aria-label="Shipment tracking"
                maxLength={200}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="settlement-wide">
          ໝາຍເຫດ / Notes
          <textarea
            aria-label="Shipment notes"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="settlement-wide">
          {view.delivery.lines.map((l) => (
            <label className="draft-line" key={l.lineIndex}>
              {l.name} · Size {l.size} · Ready {l.ready} · ກຽມໄດ້ / Available {l.prepareAvailable}
              <input
                aria-label={`Prepare line ${l.lineIndex + 1}`}
                type="number"
                min={0}
                max={l.prepareAvailable}
                value={counts[l.lineIndex] ?? 0}
                onChange={(e) =>
                  setCounts((p) => ({ ...p, [l.lineIndex]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
        </div>
        <label className="settlement-wide">
          ເຫດຜົນ / Reason
          <input
            aria-label="Prepare reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!reason.trim() || !Object.values(counts).some((n) => n > 0)}
        >
          ບັນທຶກກຽມສົ່ງ / Prepare
        </button>
      </fieldset>
      <CommandResult command={command} />
    </form>
  );
}
export function ShipmentActions({
  shipment,
  view,
  disabled,
  onChanged,
  onFreeze,
}: { shipment: ShipmentView } & SettlementActions) {
  const [reason, setReason] = useState(''),
    [early, setEarly] = useState(false),
    command = useRecordedCommand(onChanged, onFreeze);
  const ready = new Map<string, number>(),
    wanted = new Map<string, number>();
  for (const l of view.delivery.lines) ready.set(l.key, (ready.get(l.key) ?? 0) + l.ready);
  for (const item of shipment.items) {
    const key = view.delivery.lines[item.lineIndex]?.key;
    if (key) wanted.set(key, (wanted.get(key) ?? 0) + item.quantity);
  }
  const canConfirm =
    shipment.orderRevision === view.revision &&
    [...wanted].every(([key, count]) => count <= (ready.get(key) ?? 0));
  return (
    <div>
      <fieldset className="draft-fields" disabled={disabled || command.busy || !!command.pending}>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label={`Shipment reason ${shipment.number}`}
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {shipment.state === 'PREPARED' && (
          <>
            <label className="settlement-check">
              <input
                aria-label={`Confirm early ${shipment.number}`}
                type="checkbox"
                checked={early}
                onChange={(e) => setEarly(e.target.checked)}
              />
              ບັນທຶກສົ່ງລ່ວງໜ້າ ສິນຄ້າຍັງບໍ່ອອກຈາກຮ້ານ / Confirm in advance
            </label>
            {view.money.due !== '0' && (
              <p className="alert warning">
                ຍັງມີຍອດຄ້າງ {view.money.due} LAK · ເຈົ້າຂອງ/Admin ຢືນຢັນສົ່ງໄດ້
              </p>
            )}
            <button
              aria-label={`Confirm ${shipment.number}`}
              className="primary"
              disabled={!reason.trim() || !canConfirm}
              onClick={() =>
                void command.send(
                  `/settlements/orders/${view.orderId}/shipments/${shipment.id}/confirm`,
                  { ...base(view, reason), confirmedEarly: early },
                )
              }
            >
              ຢືນຢັນສົ່ງ / Confirm delivery
            </button>
            {!canConfirm && (
              <p className="muted">Ready ຍັງບໍ່ພໍ ຫຼື Order ປ່ຽນສະບັບ · ກວດລາຍການກ່ອນ</p>
            )}
          </>
        )}
        <button
          aria-label={`Cancel ${shipment.number}`}
          disabled={!reason.trim()}
          onClick={() =>
            void command.send(
              `/settlements/orders/${view.orderId}/shipments/${shipment.id}/cancel`,
              base(view, reason),
            )
          }
        >
          ຍົກເລີກລາຍການ / Cancel record
        </button>
      </fieldset>
      <CommandResult command={command} />
    </div>
  );
}
export function ShipmentTrackingForm({
  shipment,
  ...actions
}: { shipment: ShipmentView } & SettlementActions) {
  const [carrier, setCarrier] = useState(shipment.carrier),
    [tracking, setTracking] = useState(shipment.tracking),
    [notes, setNotes] = useState(shipment.notes),
    [reason, setReason] = useState(''),
    command = useRecordedCommand(actions.onChanged, actions.onFreeze);
  return (
    <details>
      <summary>ເພີ່ມ/ແກ້ເລກຂົນສົ່ງ / Tracking details</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void command
            .send(`/settlements/orders/${actions.view.orderId}/shipments/${shipment.id}/details`, {
              ...base(actions.view, reason),
              carrier,
              tracking,
              notes,
            })
            .then((ok) => {
              if (ok) setReason('');
            });
        }}
      >
        <fieldset
          className="draft-fields settlement-fields"
          disabled={actions.disabled || command.busy || !!command.pending}
        >
          <label>
            Carrier
            <input
              aria-label={`Carrier ${shipment.number}`}
              maxLength={120}
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
          </label>
          <label>
            Tracking
            <input
              aria-label={`Tracking ${shipment.number}`}
              maxLength={200}
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </label>
          <label>
            Notes
            <textarea
              aria-label={`Notes ${shipment.number}`}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              aria-label={`Tracking reason ${shipment.number}`}
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={!reason.trim()}>Save tracking</button>
        </fieldset>
        <CommandResult command={command} />
      </form>
    </details>
  );
}
