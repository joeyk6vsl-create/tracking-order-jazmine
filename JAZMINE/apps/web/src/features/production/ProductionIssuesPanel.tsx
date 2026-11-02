import {
  ISSUE_LABELS,
  type ExceptionDetail,
} from '../../../../../packages/contracts/src/production-exceptions';
import {
  WORK_STAGE_LABELS,
  type WorkDetail,
} from '../../../../../packages/contracts/src/production-work';
import { ReportIssueForm, ResolveIssueForm, MoreReplacementForm } from './IssueForms';
import { IssueCorrectionPanel } from './IssueCorrectionPanel';
import { IssueResolutionHistory } from './IssueResolutionHistory';
export function ProductionIssuesPanel({
  data,
  detail,
  disabled,
  onChanged,
  onFreeze,
}: {
  data: ExceptionDetail;
  detail: WorkDetail;
  disabled: boolean;
  onChanged: () => void;
  onFreeze: (frozen: boolean) => void;
}) {
  const actions = { disabled, onChanged, onFreeze },
    r = data.readiness;
  return (
    <section className="panel pricing-panel">
      {r && (
        <div className="draft-line">
          <h2>
            ພ້ອມສົ່ງ / Readiness · {r.orderNumber} · Order v{r.revision} (Current)
          </h2>
          <strong>
            {r.readyQuantity} / {r.quantity} pcs ·{' '}
            {r.status === 'READY_TO_SHIP'
              ? 'ພ້ອມສົ່ງຄົບ / Ready to ship'
              : r.status === 'PARTIALLY_READY'
                ? 'ພ້ອມບາງສ່ວນ / Partially ready'
                : 'ຍັງບໍ່ພ້ອມ / Not ready'}
          </strong>
          {r.shippedQuantity > 0 && (
            <p>
              ບັນທຶກສົ່ງແລ້ວ / Confirmed: {r.shippedQuantity} · ຍັງຕ້ອງສົ່ງ / Remaining:{' '}
              {r.remainingQuantity} · Ready ເປັນຈຳນວນທີ່ຍັງບໍ່ສົ່ງ
            </p>
          )}
          <div className="pricing-scroll">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Order</th>
                  <th>Allocated (net)</th>
                  <th>Ready</th>
                  <th>Scrap</th>
                  <th>Release</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.lineIndex}>
                    <td>{l.size}</td>
                    <td>{l.quantity}</td>
                    <td>{l.allocated}</td>
                    <td>{l.ready}</td>
                    <td>{l.scrap}</td>
                    <td>{l.released}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>ພ້ອມສົ່ງ ≠ ສົ່ງແລ້ວ · Ready ≠ Shipped</p>
        </div>
      )}
      <h2>ປັນຫາ / Production issues</h2>
      <ReportIssueForm
        key={detail.job.id + ':' + detail.job.version}
        detail={detail}
        overview={data.canResolve}
        losses={data.losses}
        {...actions}
      />
      {!data.issues.length && <p>ຍັງບໍ່ມີປັນຫາ / No reported issues</p>}
      {data.issues.map((issue) => (
        <article className="draft-line" key={issue.id} aria-label={`Issue ${issue.id}`}>
          <strong>
            {ISSUE_LABELS[issue.category]} · {WORK_STAGE_LABELS[issue.department]} · v
            {issue.sheetVersion} · {issue.state === 'OPEN' ? 'Open' : 'Resolved'} · {issue.mode}
          </strong>
          <p className="work-notes">{issue.description}</p>
          <p>
            {issue.reporterName} · {new Date(issue.reportedAt).toLocaleString('en-GB')}
          </p>
          {issue.affected.map((a) => (
            <p key={a.lineIndex}>
              Size {detail.snapshot.context.lines[a.lineIndex]?.size} · {a.quantity} pcs reported
            </p>
          ))}
          {issue.state === 'OPEN' && data.canResolve && (
            <ResolveIssueForm issue={issue} detail={detail} {...actions} />
          )}
          {issue.state === 'RESOLVED' && (
            <>
              <p className="work-notes">
                ປິດຄັ້ງທຳອິດ / Initially resolved: {issue.resolutionReason} · {issue.resolverName}
              </p>
              <p>ຈຳນວນປັດຈຸບັນ / Current reviewed quantities</p>
              {issue.resolutionRows?.map((row) => (
                <p key={row.lineIndex}>
                  Line {row.lineIndex + 1}: Usable {row.usableQty} · Scrap {row.scrapQty} · Release{' '}
                  {row.releaseQty} · Dismiss {row.ignoredQty}
                </p>
              ))}
              {issue.replacements.map((s) => (
                <p key={s.id}>
                  {data.canResolve || s.state === 'READY' ? (
                    <a
                      href={data.canResolve ? `?prepareSheet=${s.id}` : `?productionWork=${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Replacement {s.sheetNumber ?? 'Draft ' + s.id.slice(-8)} · {s.state}
                    </a>
                  ) : (
                    <span>
                      Replacement {s.sheetNumber ?? 'Draft ' + s.id.slice(-8)} · {s.state}
                    </span>
                  )}
                </p>
              ))}
              <IssueResolutionHistory history={issue.resolutionHistory ?? []} />
              {data.canResolve && (
                <IssueCorrectionPanel
                  issueId={issue.id}
                  rowVersion={issue.rowVersion}
                  {...actions}
                />
              )}
              {data.canResolve && (
                <MoreReplacementForm key={issue.rowVersion} issue={issue} {...actions} />
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
