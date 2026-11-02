import { useState } from 'react';
import type { DraftView } from '../../../../../packages/contracts/src/orders';
import type { QuotationCheck } from '../../../../../packages/contracts/src/quotations';
import { businessDate } from '../../../../../packages/contracts/src/customers';
import { api, errorMessage } from '../../services/api';
import { useRecordedCommand } from '../../hooks/useRecordedCommand';
import { QuotationContents } from './QuotationContents';
import { QuotationHistory } from './QuotationHistory';
import './quotations.css';
function defaultExpiry() {
  const d = new Date(businessDate() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
export function QuotationPanel({ draft }: { draft: DraftView }) {
  const [validUntil, setValidUntil] = useState(defaultExpiry),
    [notes, setNotes] = useState(''),
    [reason, setReason] = useState(''),
    [checked, setChecked] = useState<QuotationCheck | null>(null),
    [checking, setChecking] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [issued, setIssued] = useState('');
  const command = useRecordedCommand<{ revisionId: string }>(() => {
    setChecked(null);
    setRefresh((v) => v + 1);
  }, setFrozen);
  const disabled = checking || command.busy || frozen;
  async function check() {
    setChecking(true);
    setError('');
    setChecked(null);
    try {
      setChecked(
        await api<QuotationCheck>(`/quotations/drafts/${draft.id}/check`, 'POST', {
          draftVersion: draft.rowVersion,
          validUntil,
          notes,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="panel quotation-panel" aria-label="Quotation preparation">
      <h2>ໃບສະເໜີລາຄາ / Quotation</h2>
      <p>
        ອອກຈາກຮ່າງທີ່ບັນທຶກ ຍັງບໍ່ເລີ່ມຜະລິດ / Uses the saved draft; issuing does not start
        production.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            Valid until
            <input
              aria-label="Quotation valid until"
              required
              type="date"
              min={businessDate()}
              value={validUntil}
              onChange={(e) => {
                setValidUntil(e.target.value);
                setChecked(null);
              }}
            />
          </label>
          <label>
            Notes
            <textarea
              aria-label="Quotation notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setChecked(null);
              }}
            />
          </label>
          <button>ກວດລາຄາ / Check quotation</button>
        </fieldset>
      </form>
      {(error || command.error) && <p role="alert">{error || command.error}</p>}
      {command.pending && (
        <p className="alert warning">
          ຍັງບໍ່ຮູ້ຜົນ ລອງຄຳຂໍເກົ່າ / Result uncertain; retry the same request.{' '}
          <button disabled={command.busy} onClick={command.retry}>
            Retry quotation request
          </button>
        </p>
      )}
      {issued && (
        <p role="status">
          ອອກໃບແລ້ວ / Issued ·{' '}
          <a target="_blank" rel="noreferrer" href={'?quotation=' + issued}>
            Open issued quotation
          </a>
        </p>
      )}
      {checked && (
        <div aria-label="Quotation preview">
          <h3>Preview · ຍັງບໍ່ອອກເລກ / Not issued</h3>
          {checked.missing.map((m, i) => (
            <p role="alert" key={i}>
              {m}
            </p>
          ))}
          {checked.warnings.map((m, i) => (
            <p className="alert warning" key={i}>
              {m}
            </p>
          ))}
          {checked.snapshot && <QuotationContents snapshot={checked.snapshot} />}
          {checked.ready && (
            <>
              <label>
                ເຫດຜົນ / Issue reason
                <input
                  aria-label="Quotation issue reason"
                  maxLength={1000}
                  disabled={disabled}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={disabled || !reason.trim()}
                onClick={() => {
                  void command.send(
                    `/quotations/drafts/${draft.id}/issue`,
                    {
                      requestId: crypto.randomUUID(),
                      draftVersion: draft.rowVersion,
                      validUntil,
                      notes,
                      reason,
                      checkToken: checked.checkToken,
                    },
                    (r) => {
                      setIssued(r.revisionId);
                      setReason('');
                    },
                  );
                }}
              >
                ອອກໃບ / Issue quotation
              </button>
            </>
          )}
        </div>
      )}
      <QuotationHistory key={draft.id + ':' + refresh} draftId={draft.id} />
    </section>
  );
}
