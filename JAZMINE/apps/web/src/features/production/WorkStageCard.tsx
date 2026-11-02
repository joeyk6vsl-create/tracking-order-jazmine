import { useState } from 'react';
import {
  WORK_STAGE_LABELS,
  WORK_STATE_LABELS,
  type WorkJob,
  type WorkStageView,
  type WorkAction,
} from '../../../../../packages/contracts/src/production-work';
import { api, ApiError, errorMessage } from '../../services/api';
export function WorkStageCard({
  job,
  stage,
  canWork,
  disabled,
  onFreeze,
  onChanged,
}: {
  job: WorkJob;
  stage: WorkStageView;
  canWork: boolean;
  disabled: boolean;
  onFreeze: (frozen: boolean) => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<WorkAction | null>(null),
    [savedVersion, setSavedVersion] = useState<number | null>(null);
  const start =
    !job.blocked &&
    !stage.blocked &&
    stage.state === 'NOT_STARTED' &&
    (!stage.previous || stage.previous.state !== 'NOT_STARTED');
  const complete =
    !job.blocked &&
    !stage.blocked &&
    stage.state === 'IN_PROGRESS' &&
    (!stage.previous || stage.previous.state === 'COMPLETED');
  async function send(input: WorkAction) {
    setBusy(true);
    setError('');
    onFreeze(true);
    try {
      await api(`/production-work/jobs/${job.id}/stages/${stage.department}`, 'POST', input);
      setSavedVersion(stage.rowVersion);
      setPending(null);
      setReason('');
      onFreeze(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) setPending(input);
      else {
        setPending(null);
        onFreeze(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }
  function submit(action: WorkAction['action']) {
    void send({
      requestId: crypto.randomUUID(),
      version: job.version,
      sheetRowVersion: job.sheetRowVersion,
      stageRowVersion: stage.rowVersion,
      action,
      reason,
    });
  }
  return (
    <article className="work-stage-card" aria-label={stage.department}>
      <h3>{WORK_STAGE_LABELS[stage.department]}</h3>
      {stage.blocked && <p className="alert warning">{stage.blocked}</p>}
      <p className={'work-state ' + stage.state}>{WORK_STATE_LABELS[stage.state]}</p>
      {stage.previous && (
        <p className="muted">
          ກ່ອນໜ້າ: {WORK_STAGE_LABELS[stage.previous.department]} ·{' '}
          {WORK_STATE_LABELS[stage.previous.state]}
        </p>
      )}
      {stage.startedAt && <p>Start: {new Date(stage.startedAt).toLocaleString('en-GB')}</p>}
      {stage.completedAt && <p>Complete: {new Date(stage.completedAt).toLocaleString('en-GB')}</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {canWork && stage.state !== 'COMPLETED' && (
        <>
          <label>
            ໝາຍເຫດ / Note (Optional)
            <input
              aria-label={`Note ${stage.department}`}
              value={reason}
              maxLength={500}
              disabled={busy || disabled || !!pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {pending ? (
            <button
              aria-label={`Retry ${stage.department}`}
              className="primary"
              disabled={busy}
              onClick={() => void send(pending)}
            >
              ລອງບັນທຶກຄຳຂໍເດີມ / Retry
            </button>
          ) : (
            <div className="work-actions">
              <button
                className="primary"
                aria-label={`Start ${stage.department}`}
                disabled={disabled || busy || !start || savedVersion === stage.rowVersion}
                onClick={() => submit('start')}
              >
                ເລີ່ມ / Start
              </button>
              <button
                aria-label={`Complete ${stage.department}`}
                disabled={disabled || busy || !complete || savedVersion === stage.rowVersion}
                onClick={() => submit('complete')}
              >
                ສຳເລັດ / Complete
              </button>
            </div>
          )}
          {!job.blocked && stage.state === 'NOT_STARTED' && !start && (
            <p className="muted">ລໍຖ້າພະແນກກ່ອນໜ້າ Start ກ່ອນ</p>
          )}
          {!job.blocked && stage.state === 'IN_PROGRESS' && !complete && (
            <p className="muted">ເຮັດວຽກຕໍ່ໄດ້ · ກົດ Complete ໄດ້ເມື່ອພະແນກກ່ອນໜ້າ Complete ແລ້ວ</p>
          )}
        </>
      )}
    </article>
  );
}
