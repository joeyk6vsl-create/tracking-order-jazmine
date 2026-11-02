import type { WorkDetail } from '../../../../../packages/contracts/src/production-work';
import type { PartFile } from '../../../../../packages/contracts/src/production';
const labels: Record<PartFile['part'], string> = {
  BODY: 'ດ້ານໜ້າ / Front',
  BODY_BACK: 'ດ້ານຫຼັງ / Back',
  COLLAR: 'ຄໍ / Collar',
  COLLAR_STAND: 'ຄໍນ້ອຍ / Collar stand',
  COLLAR_PLACKET: 'ສາບ / Placket',
  SLEEVE_LEFT: 'ແຂນຊ້າຍ / Left sleeve',
  SLEEVE_RIGHT: 'ແຂນຂວາ / Right sleeve',
  CUFF_LEFT: 'ປາຍແຂນຊ້າຍ / Left cuff',
  CUFF_RIGHT: 'ປາຍແຂນຂວາ / Right cuff',
  SHOULDER: 'ບ່າ / Shoulder',
};
export function WorkInstructions({ detail }: { detail: WorkDetail }) {
  const { snapshot, job } = detail,
    ctx = snapshot.context;
  const name = (id: string) => ctx.selections.find((s) => s.id === id)?.name ?? 'ບໍ່ໄດ້ລະບຸ';
  const base = `/api/v1/production-work/jobs/${job.id}/versions/${job.version}`;
  const files = [
    ...snapshot.context.assets.map((f) => ({
      ...f,
      kind: 'asset',
      label:
        f.kind === 'MOCKUP'
          ? 'Mockup'
          : f.kind === 'NECK_LABEL'
            ? 'ປ້າຍຄໍ / Neck label'
            : 'ເທບຄໍ / Neck tape',
    })),
    ...snapshot.files.map((f) => ({ ...f, kind: 'part', label: labels[f.part] })),
  ];
  return (
    <section className="panel pricing-panel">
      <h2>ຄຳສັ່ງຜະລິດ / Instructions · v{job.version}</h2>
      {job.carriedFrom && (
        <p className="alert warning">
          ຮັບວຽກຕໍ່ / Continued from{' '}
          <a href={`?productionWork=${job.carriedFrom.sheetId}`}>
            {job.carriedFrom.number} · v{job.carriedFrom.version}
          </a>{' '}
          · Order v{job.carriedFrom.orderRevision} · ສະຖານະທີ່ເຮັດແລ້ວຍັງຢູ່ / Earlier progress is
          retained
        </p>
      )}
      {snapshot.allocations.map((a) => {
        const line = ctx.lines[a.lineIndex];
        return (
          <div className="draft-line" key={a.lineIndex}>
            <strong>
              {name(line.productId)} · Size {line.size} · {a.quantity} pcs
            </strong>
            <p>ຜ້າ / Fabric: {name(line.fabricId)}</p>
            {line.parts.map((p) => (
              <p key={p.componentId}>
                {name(p.componentId)} · {p.fabricId ? name(p.fabricId) : 'ບໍ່ໄດ້ລະບຸຜ້າແຍກ'}
              </p>
            ))}
          </div>
        );
      })}
      <p className="work-notes">{snapshot.notes || 'ບໍ່ມີໝາຍເຫດ / No additional notes'}</p>
      {!!snapshot.printDetails?.names.length && (
        <details>
          <summary>ຊື່ແລະເບີ / Names & numbers ({snapshot.printDetails.names.length})</summary>
          <div className="pricing-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>ຊື່ / Name</th>
                  <th>ເບີ / No.</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.printDetails.names.map((n, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{n.name || '-'}</td>
                    <td>{n.number || '-'}</td>
                    <td>{ctx.lines[n.lineIndex]?.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <h3>ໄຟລ໌ / Files</h3>
      <div className="work-file-grid">
        {files.map((f) => {
          const url = `${base}/${f.kind}/${f.id}/content`;
          return (
            <article key={f.id}>
              <strong>{f.label}</strong>
              {f.mime.startsWith('image/') && <img loading="lazy" src={url} alt={f.label} />}
              <a href={url} target="_blank" rel="noreferrer">
                {f.filename} · v{f.revision}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
