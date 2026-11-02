import { useEffect, useState } from 'react';
import { businessDate } from '../../../../../packages/contracts/src/customers';
import type { ReportView } from '../../../../../packages/contracts/src/reports';
import { api, errorMessage } from '../../services/api';
import { lak } from '../settlements/CommandResult';
import './reports.css';
export function ReportsPage() {
  const today = businessDate();
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [query, setQuery] = useState({ from: today.slice(0, 8) + '01', to: today, page: 1 }),
    [view, setView] = useState<ReportView | null>(null),
    [tick, setTick] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api<ReportView>(`/reports/summary?from=${query.from}&to=${query.to}&page=${query.page}`)
      .then((r) => {
        if (active) setView(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, tick]);
  const max = view?.trend.reduce((n, r) => (BigInt(r.sales) > n ? BigInt(r.sales) : n), 1n) ?? 1n;
  return (
    <div className="reports-page">
      <div className="page-heading">
        <div>
          <span className="section-label">OWNER REPORTS</span>
          <h1>ລາຍງານເຈົ້າຂອງ / Reports</h1>
        </div>
        <button disabled={loading} onClick={() => setTick((t) => t + 1)}>
          Refresh reports
        </button>
      </div>
      <form
        className="panel pricing-panel report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ from, to, page: 1 });
        }}
      >
        <label>
          ຈາກວັນ / From
          <input
            aria-label="Report from"
            type="date"
            required
            value={from}
            disabled={loading}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          ເຖິງວັນ / To
          <input
            aria-label="Report to"
            type="date"
            required
            value={to}
            disabled={loading}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="primary" disabled={loading}>
          ເບິ່ງລາຍງານ / Apply period
        </button>
      </form>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading…</p>}
      {view && (
        <>
          <p>
            {view.from} → {view.to} · LAK · ເວລາລາວ / Lao time
          </p>
          <section className="report-cards">
            {[
              ['ຍອດອໍເດີ / Order value', lak(view.sales)],
              ['ອໍເດີ / Orders', String(view.orders)],
              ['ຈຳນວນລວມແຖມ / Pieces incl. gifts', String(view.quantity)],
              ['ຮັບເງິນໃນຊ່ວງ / Received in period', lak(view.received)],
              ['ຄືນເງິນໃນຊ່ວງ / Refunded in period', lak(view.refunded)],
              ['ເງິນສຸດທິໃນຊ່ວງ / Net cash in period', lak(view.netCash)],
            ].map(([label, value]) => (
              <div className="panel pricing-panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section className="panel pricing-panel">
            <h2>ຍອດຄ້າງປັດຈຸບັນ / Current balances</h2>
            {(view.pendingCancellations > 0 || view.historicalPendingCancellations > 0) && (
              <p className="alert warning">
                ອໍເດີຍົກເລີກລໍຖ້າຕົກລົງຍອດ / Cancellation agreements pending:{' '}
                {view.pendingCancellations} current · {view.historicalPendingCancellations} at
                period end. Unknown amounts are not included in balances.
              </p>
            )}
            <p>
              ທຸກອໍເດີ / All orders: <b>{lak(view.outstanding)}</b> · ຮັບເກີນ / Overpaid:{' '}
              {lak(view.overpaid)}
            </p>
            <p>ສະເພາະອໍເດີໃນຊ່ວງທີ່ເລືອກ / Selected orders due: {lak(view.cohortOutstanding)}</p>
            <p>
              ຍອດຄ້າງຍ້ອນຫຼັງໃນສິ້ນວັນ {view.to} / Historical outstanding:{' '}
              <b>{lak(view.historicalOutstanding)}</b>
            </p>
          </section>
          <section className="panel pricing-panel">
            <h2>ຄວາມໝາຍຂອງຕົວເລກ / How to read</h2>
            <p>
              ອໍເດີຍົກເລີກບໍ່ນັບຍອດຂາຍ ແຕ່ເງິນຮັບ/ຄືນຈິງຍັງຢູ່ / Cancelled orders are excluded from
              sales and demand; actual cash remains. Archived valid orders remain in historical
              sales. Cancelled rows retain the original value for history.
            </p>
            <p>ຍອດອໍເດີ: ອໍເດີທີ່ຢືນຢັນຄັ້ງທຳອິດໃນຊ່ວງນີ້ ໃຊ້ລາຄາສະບັບຫຼ້າສຸດ ລວມຜົນສ່ວນຫຼຸດ</p>
            <p>
              ເງິນຮັບ/ຄືນ: ໃຊ້ວັນທີ່ຮັບ/ຄືນຈິງຂອງລາຍການທີ່ຍັງໃຊ້ · ລາຍການ Void ບໍ່ນັບ ·
              ເງິນອາດມາຈາກອໍເດີນອກຊ່ວງ
            </p>
            <p>
              Current balances ເປັນຍອດປັດຈຸບັນ · Historical outstanding ໃຊ້ສະບັບອໍເດີ ແລະ
              ລາຍການເງິນທີ່ບັນທຶກຮູ້ໃນສິ້ນວັນນັ້ນ · ການແກ້ພາຍຫຼັງບໍ່ປ່ຽນຍອດຍ້ອນຫຼັງ
            </p>
          </section>
          <section className="panel pricing-panel alert warning">
            <h2>ກຳໄລຍັງຄຳນວນບໍ່ຄົບ / Profit incomplete</h2>
            <p>
              ລໍຖ້າຕົ້ນທຶນຜ້າ ຄ່າແຮງ ໝຶກ/ວັດສະດຸພິມ ແລະ ຕົ້ນທຶນອື່ນ ພ້ອມປະລິມານໃຊ້ ·
              ບໍ່ຖືຂໍ້ມູນທີ່ຂາດເປັນ 0
            </p>
          </section>
          <section className="panel pricing-panel">
            <h2>ຍອດອໍເດີຕາມວັນ / Daily order value</h2>
            {!view.trend.length && <p>No activity in this period</p>}
            <div className="report-trend">
              {view.trend.map((r) => (
                <div className="report-day" key={r.date}>
                  <span>{r.date}</span>
                  <div
                    className="report-bar"
                    style={{ width: `${Number((BigInt(r.sales) * 100n) / max)}%` }}
                    aria-hidden="true"
                  />
                  <span>
                    {lak(r.sales)} · Cash {lak(r.received)} · Refund {lak(r.refunded)}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel pricing-panel">
            <h2>ລາຍການອໍເດີ / Order details</h2>
            <div className="report-table">
              <table>
                <thead>
                  <tr>
                    <th>Order / Customer</th>
                    <th>Order value</th>
                    <th>Net paid to date</th>
                    <th>Due now</th>
                    <th>Qty incl. gifts</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a href={`?settlementOrder=${r.id}`}>{r.orderNumber}</a>
                        {r.cancelled && (
                          <p>
                            ຍົກເລີກ / Cancelled · excluded from sales
                            {r.agreedTotal !== null ? ' · Agreed ' + lak(r.agreedTotal) : ''}
                          </p>
                        )}
                        <br />
                        {r.customerName}
                        <br />
                        {r.date}
                      </td>
                      <td>{lak(r.total)}</td>
                      <td>{lak(r.netPaid)}</td>
                      <td>{r.decisionRequired ? 'ລໍຖ້າຕົກລົງ / Pending agreement' : lak(r.due)}</td>
                      <td>{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <button
                disabled={loading || query.page === 1}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                Previous orders
              </button>
              <span> {query.page} </span>
              <button
                disabled={loading || !view.hasMore}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
              >
                Next orders
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
