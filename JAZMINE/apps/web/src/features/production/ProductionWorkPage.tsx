import { useEffect, useRef, useState } from 'react';
import {
  WORK_STAGES,
  WORK_STAGE_LABELS,
  WORK_STATE_LABELS,
  type WorkQueue,
  type WorkDetail,
} from '../../../../../packages/contracts/src/production-work';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { WorkStageCard } from './WorkStageCard';
import { WorkInstructions } from './WorkInstructions';
import './production-work.css';
import type { ExceptionDetail } from '../../../../../packages/contracts/src/production-exceptions';
import { ProductionIssuesPanel } from './ProductionIssuesPanel';
export function ProductionWorkPage() {
  const { session } = useSession(),
    user = session!.user!;
  const overview = user.role === 'ADMIN_PROMAX' || user.department === 'ADMIN';
  const detailRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState({
      department: overview ? '' : user.department,
      state: 'ACTIVE',
      search: '',
    }),
    [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; version?: number } | null>(() => {
    const params = new URLSearchParams(location.search),
      id = params.get('productionWork'),
      version = Number(params.get('version'));
    return id && /^[\da-f-]{36}$/i.test(id)
      ? { id, ...(Number.isSafeInteger(version) && version > 0 ? { version } : {}) }
      : null;
  });
  const [queue, setQueue] = useState<WorkQueue | null>(null),
    [exceptions, setExceptions] = useState<ExceptionDetail | null>(null),
    [detail, setDetail] = useState<WorkDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    const params = new URLSearchParams({
      state: query.state,
      search: query.search,
      ...(query.department ? { department: query.department } : {}),
    });
    void Promise.all([
      api<WorkQueue>(`/production-work/jobs?${params}`),
      selected
        ? api<WorkDetail>(
            `/production-work/jobs/${selected.id}${selected.version ? '?version=' + selected.version : ''}`,
          )
        : Promise.resolve(null),
      selected
        ? api<ExceptionDetail>(`/production-exceptions/sheets/${selected.id}`)
        : Promise.resolve(null),
    ])
      .then(([list, job, issues]) => {
        if (alive) {
          setQueue(list);
          setDetail(job);
          setExceptions(issues);
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [query, selected, tick]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !frozen) setTick((n) => n + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [frozen]);
  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: 'start' });
  }, [detail?.job.id, detail?.job.version]);
  const refresh = () => setTick((n) => n + 1),
    disabled = busy || frozen;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-label">PRODUCTION</span>
          <h1>ວຽກຜະລິດ / Work queue</h1>
          <p>Start ເມື່ອຮັບວຽກ · Complete ເມື່ອສຳເລັດ · ບໍ່ຕ້ອງກອກຈຳນວນຊ້ຳທຸກພະແນກ</p>
        </div>
        <button disabled={disabled} onClick={refresh}>
          Reload
        </button>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {frozen && (
        <p className="alert warning" role="status">
          ກຳລັງບັນທຶກ ຫຼືລໍຖ້າຜົນຄຳຂໍເດີມ · ຖ້າການເຊື່ອມຕໍ່ຂາດ ໃຫ້ໃຊ້ Retry
        </p>
      )}
      <form
        className="work-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery((q) => ({ ...q, search }));
        }}
      >
        {overview && (
          <label>
            ພະແນກ / Department
            <select
              aria-label="Work department"
              value={query.department}
              disabled={disabled}
              onChange={(e) => setQuery((q) => ({ ...q, department: e.target.value }))}
            >
              <option value="">All departments</option>
              {WORK_STAGES.map((s) => (
                <option key={s} value={s}>
                  {WORK_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          ສະຖານະ / Status
          <select
            aria-label="Work status"
            value={query.state}
            disabled={disabled}
            onChange={(e) => setQuery((q) => ({ ...q, state: e.target.value }))}
          >
            <option value="ACTIVE">ຍັງບໍ່ສຳເລັດ / Active</option>
            <option value="COMPLETED">ສຳເລັດ / Completed</option>
            <option value="ALL">ທັງໝົດ / All</option>
          </select>
        </label>
        <label>
          ຄົ້ນຫາ / Search
          <input
            aria-label="Search work"
            value={search}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="PS / Order / Customer"
          />
        </label>
        <button disabled={disabled}>Search</button>
      </form>
      <section className="work-queue" aria-label="Work queue">
        {!!queue?.pendingReviews?.length && (
          <div className="alert warning" role="status">
            ມີວຽກໃຊ້ຕໍ່ລໍຖ້າ Graphic/Owner ກວດ / Continued work awaiting graphic approval:{' '}
            {queue.pendingReviews.map((r) => r.sourceNumber).join(', ')} · ລໍຖ້າໃບຜະລິດໃໝ່ / Wait
            for new instructions
          </div>
        )}
        {queue?.jobs.map((job) => (
          <article className="panel work-job" key={job.id}>
            <div>
              <h2>
                {job.sheetNumber} · v{job.version}
              </h2>
              <p>
                {job.orderNumber} · {job.customerName}
              </p>
              <p>
                Due: {job.dueDate} · {job.quantity} pcs{' '}
                {job.priority === 'URGENT' ? '· ດ່ວນ / URGENT' : ''}
              </p>
            </div>
            {job.blocked && <p className="alert warning">{job.blocked}</p>}
            {job.carriedFrom && (
              <p className="alert warning">
                ຮັບວຽກຕໍ່ / Continued from {job.carriedFrom.number} · ກວດ Instructions ສະບັບນີ້ /
                Check current instructions
              </p>
            )}
            {job.openIssues > 0 && (
              <p className="alert warning">ປັນຫາທີ່ຍັງເປີດ / Open issues: {job.openIssues}</p>
            )}
            {job.previousWork && (
              <p className="alert warning">
                PS ມີສະບັບໃໝ່ · ມີວຽກໃນສະບັບອື່ນ ກະລຸນາກວດ Instructions ແລະ History
              </p>
            )}
            <div className="work-badges">
              {job.stages.map((s) => (
                <span key={s.department} className={'work-state ' + s.state}>
                  {WORK_STAGE_LABELS[s.department]} · {WORK_STATE_LABELS[s.state]}
                </span>
              ))}
            </div>
            <button
              disabled={disabled}
              aria-label={`Open work ${job.sheetNumber}`}
              onClick={() => {
                setDetail(null);
                setSelected({ id: job.id });
              }}
            >
              ເປີດວຽກ / Open
            </button>
          </article>
        ))}
        {queue && !queue.jobs.length && (
          <p className="panel">ບໍ່ພົບວຽກຕາມທີ່ເລືອກ / No matching work</p>
        )}
        {queue?.hasMore && (
          <p className="alert warning">ສະແດງ 50 PS ທຳອິດ · ໃຊ້ Search ເພື່ອຄົ້ນຫາວຽກອື່ນ</p>
        )}
      </section>
      {detail && (
        <div ref={detailRef} className="work-detail" aria-busy={busy}>
          <section className="panel pricing-panel">
            <h2>
              {detail.job.sheetNumber} · v{detail.job.version}
            </h2>
            <p>
              {detail.job.orderNumber} · {detail.job.customerName} · {detail.job.quantity} pcs · Due{' '}
              {detail.job.dueDate}
            </p>
            <label>
              PS version
              <select
                aria-label="Work version"
                value={detail.job.version}
                disabled={disabled}
                onChange={(e) => {
                  setDetail(null);
                  setSelected({ id: detail.job.id, version: Number(e.target.value) });
                }}
              >
                {detail.versions.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                    {v === detail.versions[0] ? ' · Latest' : ' · History'}
                  </option>
                ))}
              </select>
            </label>
            {detail.job.blocked && <p className="alert warning">{detail.job.blocked}</p>}
            {detail.job.previousWork && (
              <p className="alert warning">
                ສະຖານະໃນໜ້ານີ້ເປັນຂອງ v{detail.job.version} · ວຽກເກົ່າຍັງຢູ່ໃນ History
                ແລະບໍ່ຖືກນັບວ່າສຳເລັດໃຫ້ສະບັບໃໝ່
              </p>
            )}
            {overview && user.role !== 'ADMIN_PROMAX' && (
              <p className="muted">ສາມາດເບິ່ງພາບລວມ · Start / Complete ເປັນໜ້າທີ່ຂອງແຕ່ລະພະແນກ</p>
            )}
            <div className="work-stage-grid">
              {detail.job.stages.map((s) => (
                <WorkStageCard
                  key={detail.job.id + ':' + detail.job.version + ':' + s.department}
                  job={detail.job}
                  stage={s}
                  canWork={user.role === 'ADMIN_PROMAX' || user.department === s.department}
                  disabled={disabled}
                  onFreeze={setFrozen}
                  onChanged={refresh}
                />
              ))}
            </div>
          </section>
          {exceptions && (
            <ProductionIssuesPanel
              data={exceptions}
              detail={detail}
              disabled={disabled}
              onChanged={refresh}
              onFreeze={setFrozen}
            />
          )}
          <WorkInstructions detail={detail} />
          <section className="panel pricing-panel">
            <h2>ປະຫວັດ / History · v{detail.job.version}</h2>
            {!detail.events.length && <p>ຍັງບໍ່ມີ Start / Complete</p>}
            {detail.events.map((e) => (
              <article className="draft-line" key={e.id}>
                <strong>
                  {WORK_STAGE_LABELS[e.department]} · {WORK_STATE_LABELS[e.toState]}
                </strong>
                <p>
                  {new Date(e.at).toLocaleString('en-GB')} · {e.actorName}
                </p>
                <p className="work-notes">{e.reason}</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
