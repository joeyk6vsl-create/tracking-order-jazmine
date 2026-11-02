import type { QuotationSnapshot } from '../../../../../packages/contracts/src/quotations';
export function QuotationContents({
  snapshot,
  kind = 'QUOTATION',
}: {
  snapshot: Pick<QuotationSnapshot, 'input' | 'pricing' | 'selections'> & { notes?: string };
  kind?: 'QUOTATION' | 'INVOICE';
}) {
  const { input, pricing } = snapshot,
    lines = input.lines.length ? input.lines : [input.quote];
  const name = (id: string) => snapshot.selections.find((s) => s.id === id)?.name ?? 'Saved item';
  return (
    <>
      <p>
        ລູກຄ້າ / Customer: <strong>{input.customerName}</strong> · {input.phone}
      </p>
      <p>
        Brand:{' '}
        {input.brandingType === 'CUSTOM_AGENT'
          ? 'Customer brand'
          : input.brandingType === 'JAZMINE_STANDARD'
            ? 'JAZMINE'
            : 'To be confirmed'}{' '}
        · Price group: {input.quote.group}
      </p>
      <div className="quotation-table-scroll">
        <table>
          <thead>
            <tr>
              <th>ລາຍການ / Item</th>
              <th>Size</th>
              <th>Buy</th>
              <th>Gift</th>
              <th>Subtotal LAK</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const price = pricing.linePricing?.[i] ?? pricing;
              return (
                <tr key={i}>
                  <td>
                    {i + 1}. {name(line.productId)}
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
                  <td>{price.freeQuantity}</td>
                  <td>{price.subtotal?.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="quotation-totals">
        <p>
          Subtotal: {pricing.subtotal?.toLocaleString()} LAK · Discount: {pricing.percent}% →{' '}
          {pricing.fixed.toLocaleString()} LAK
        </p>
        <p className="quotation-total">ຍອດສຸດທິ / Total: {pricing.total?.toLocaleString()} LAK</p>
        <p>
          Display: {pricing.convertedTotal} {pricing.displayCurrency} · Rate: {pricing.exchangeRate}{' '}
          LAK / 1 {pricing.displayCurrency}
        </p>
        <p>
          Buy {pricing.quantity} · Gift {pricing.freeQuantity} · Total units{' '}
          {pricing.productionQuantity}
        </p>
      </div>
      {snapshot.notes && <p className="quotation-notes">{snapshot.notes}</p>}
      <p className="quotation-disclaimer">
        {kind === 'INVOICE' ? (
          'ໃບແຈ້ງໜີ້ບໍ່ແມ່ນຫຼັກຖານຮັບເງິນ / Invoice is not proof of payment.'
        ) : (
          <>
            ໃບສະເໜີລາຄາເທົ່ານັ້ນ / Quotation only · ຍັງບໍ່ຢືນຢັນອໍເດີ ຮັບເງິນ ຫຼືເລີ່ມຜະລິດ / Does
            not confirm an order, record payment or start production.
          </>
        )}
      </p>
    </>
  );
}
