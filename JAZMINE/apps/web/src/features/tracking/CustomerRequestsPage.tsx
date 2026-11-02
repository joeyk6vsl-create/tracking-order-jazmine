import { useEffect, useState } from 'react';
import {
  requestLabels,
  type CustomerRequest,
} from '../../../../../packages/contracts/src/tracking';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import { CommandResult, shopDate } from '../settlements/CommandResult';
import './tracking.css';
type RequestRow = CustomerRequest & { orderId: string; orderNumber: string };
function Review({
  request,
  onChanged,
  onFreeze,
  disabled,
}: {
  request: RequestRow;
  onChanged: () => void;
  onFreeze: (v: boolean) => void;
  disabled: boolean;
}) {
  const [response, setResponse] = useState(''),
    [reason, setReason] = useState(''),
    [outcome, setOutcome] = useState('APPROVED'),
    command = useRecordedCommand(onChanged, onFreeze);
  return (
    <article className="panel pricing-panel">
      <h2>
        {request.orderNumber} · {requestLabels[request.kind]}
      </h2>
      <p className="work-notes">{request.message}</p>
      <p>
        {shopDate(request.submittedAt)} · {request.state}
      </p>
      <a href={`?settlementOrder=${request.orderId}`}>ເປີດອໍເດີ / Open order</a>
      {request.response && (
        <p className="work-notes">
          {request.outcome} · {request.response}
        </p>
      )}
      {request.state !== 'RESOLVED' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void command.send(`/tracking/requests/${request.id}/review`, {
              requestId: crypto.randomUUID(),
              reason,
              rowVersion: request.rowVersion,
              action: request.state === 'SUBMITTED' ? 'START_REVIEW' : 'RESOLVE',
              response,
              ...(request.state === 'UNDER_REVIEW' ? { outcome } : {}),
            });
          }}
        >
          <fieldset
            className="draft-fields"
            disabled={disabled || command.busy || !!command.pending}
          >
            {request.state === 'UNDER_REVIEW' && (
              <label>
                ຜົນ / Outcome
                <select
                  aria-label="Request outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="APPROVED">ຕົກລົງ / Approved</option>
                  <option value="REJECTED">ບໍ່ອະນຸມັດ / Rejected</option>
                  <option value="NO_ACTION">ບໍ່ຕ້ອງດຳເນີນການ / No action</option>
                </select>
              </label>
            )}
            <label>
              ຄຳຕອບທີ່ລູກຄ້າເຫັນ / Public reply
              <textarea
                aria-label="Public request reply"
                required={request.state === 'UNDER_REVIEW'}
                maxLength={2000}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
            </label>
            <label>
              ເຫດຜົນພາຍໃນ / Internal reason
              <input
                aria-label="Request review reason"
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="primary" disabled={!reason.trim()}>
              {request.state === 'SUBMITTED'
                ? 'ຮັບເລື່ອງ / Start review'
                : 'ບັນທຶກຜົນ / Resolve request'}
            </button>
          </fieldset>
          <CommandResult command={command} />
        </form>
      )}
      <p className="muted">ການອະນຸມັດບໍ່ໄດ້ແກ້ອໍເດີ ຫຼື ຢືນຢັນສົ່ງ · ຕ້ອງເຮັດລາຍການແຍກ</p>
    </article>
  );
}
export function CustomerRequestsPage() {
  const [state, setState] = useState('SUBMITTED'),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [frozen, setFrozen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [rows, setRows] = useState<RequestRow[]>([]),
    [more, setMore] = useState(false);
  const refresh = () => setTick((v) => v + 1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api<{ requests: RequestRow[]; hasMore: boolean }>(
      `/tracking/requests?state=${state}&page=${page}`,
    )
      .then((r) => {
        if (active) {
          setRows(r.requests);
          setMore(r.hasMore);
        }
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
  }, [state, page, tick]);
  return (
    <div className="tracking-internal">
      <div className="page-heading">
        <h1>ຄຳຂໍລູກຄ້າ / Customer requests</h1>
        <button disabled={frozen || loading} onClick={refresh}>
          Refresh requests
        </button>
      </div>
      <label>
        ສະຖານະ / Status
        <select
          aria-label="Request filter"
          disabled={frozen || loading}
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="SUBMITTED">ສົ່ງໃໝ່ / Submitted</option>
          <option value="UNDER_REVIEW">ກຳລັງກວດ / Under review</option>
          <option value="RESOLVED">ຕອບແລ້ວ / Resolved</option>
          <option value="ALL">ທັງໝົດ / All</option>
        </select>
      </label>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading…</p>}
      {!loading && !rows.length && <p>No requests</p>}
      {rows.map((r) => (
        <Review
          key={r.id + ':' + r.rowVersion}
          request={r}
          onChanged={refresh}
          onFreeze={setFrozen}
          disabled={frozen || loading}
        />
      ))}
      <div>
        <button disabled={page === 1 || frozen || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span> {page} </span>
        <button disabled={!more || frozen || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
