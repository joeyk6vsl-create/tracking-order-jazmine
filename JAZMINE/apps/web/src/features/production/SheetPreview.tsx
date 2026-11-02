import { PART_LABELS, type SheetSnapshot } from '../../../../../packages/contracts/src/production';
export type { SheetSnapshot } from '../../../../../packages/contracts/src/production';
export function SheetPreview({ snapshot }: { snapshot: SheetSnapshot }) {
  const { context, allocations, files } = snapshot;
  function name(id: string) {
    return context.selections.find((i) => i.id === id)?.name ?? 'รายการจากออเดอร์';
  }
  return (
    <section className="panel pricing-panel">
      <h2>ข้อมูลใบผลิต {snapshot.sheetNumber ?? 'ร่าง'}</h2>
      <p>
        {context.orderNumber} · ออเดอร์ฉบับ {context.revision} · {context.customerName} · กำหนดส่ง{' '}
        {context.dueDate}
      </p>
      <p>
        แบรนด์ {context.brandingType === 'JAZMINE_STANDARD' ? 'JAZMINE' : 'แบรนด์ลูกค้า'} ·
        ผ้าตามออเดอร์ยืนยัน เปลี่ยนจากใบผลิตไม่ได้
      </p>
      {context.assets.map((a) => (
        <p key={a.id}>
          <a href={`/api/v1/graphic-assets/${a.id}/content`} target="_blank" rel="noreferrer">
            {a.kind === 'MOCKUP'
              ? 'แบบตัวอย่างที่อนุมัติ'
              : a.kind === 'NECK_LABEL'
                ? 'ป้ายคอ'
                : 'เทปคอ'}{' '}
            · {a.filename} · ฉบับ {a.revision}
          </a>
        </p>
      ))}
      {allocations.map((a) => {
        const line = context.lines[a.lineIndex];
        return (
          <div className="draft-line" key={a.lineIndex}>
            <strong>
              รายการ {a.lineIndex + 1} · {name(line.productId)} · ไซซ์ {line.size} · จัดผลิต{' '}
              {a.quantity} ตัว
            </strong>
            <p>ผ้าตัวเสื้อ: {name(line.fabricId)}</p>
            {line.parts.map((p) => (
              <p key={p.componentId}>
                {name(p.componentId)} ·{' '}
                {p.fabricId ? 'ผ้าแยก: ' + name(p.fabricId) : 'ไม่ได้เลือกผ้าแยกในออเดอร์'}
              </p>
            ))}
          </div>
        );
      })}
      <p>คำสั่งงาน: {snapshot.notes || 'ไม่มีหมายเหตุเพิ่มเติม'}</p>
      <h3>ไฟล์ชิ้นงาน</h3>
      <div className="pricing-fields">
        {files.map((f) => (
          <article className="asset-version" key={f.id}>
            <strong>
              {PART_LABELS[f.part]} · ไฟล์ฉบับ {f.revision}
            </strong>
            {f.mime.startsWith('image/') && (
              <img
                className="asset-preview"
                src={`/api/v1/production/files/${f.id}/content`}
                alt={PART_LABELS[f.part]}
              />
            )}
            <p>
              <a href={`/api/v1/production/files/${f.id}/content`} target="_blank" rel="noreferrer">
                {f.filename}
              </a>
            </p>
          </article>
        ))}
      </div>
      <p>เปิด A4 / บันทึก PDF ได้จากฉบับที่ออกแล้วด้านบน · ยังไม่มีปุ่มเริ่มผลิตจริงในรอบนี้</p>
    </section>
  );
}
