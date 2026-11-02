import {
  PART_LABELS,
  type PartFile,
  type SheetSnapshot,
} from '../../../../../packages/contracts/src/production';
import type { PrintMedia } from './print-media';
function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
function date(value?: string | null) {
  if (!value) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Vientiane',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(value.includes('T') || value.includes(':')
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : {}),
  }).format(new Date(value.length === 10 ? value + 'T00:00:00+07:00' : value));
}
export function ProductionDocument({
  snapshot,
  media,
  qr,
  warning,
}: {
  snapshot: SheetSnapshot;
  media: PrintMedia;
  qr: string;
  warning: string;
}) {
  const { context, allocations } = snapshot;
  const names = snapshot.printDetails?.names ?? [];
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];
  const sizes = [...new Set(context.lines.map((l) => l.size))].sort((a, b) => {
    const ai = sizeOrder.indexOf(a),
      bi = sizeOrder.indexOf(b);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
  });
  const orderQty = (size?: string) =>
    context.lines.filter((l) => !size || l.size === size).reduce((n, l) => n + l.quantity, 0);
  const sheetQty = (size?: string) =>
    allocations
      .filter((a) => !size || context.lines[a.lineIndex].size === size)
      .reduce((n, a) => n + a.quantity, 0);
  const selectionName = (id: string) =>
    context.selections.find((s) => s.id === id)?.name ?? 'ยังไม่ระบุ';
  const line = context.lines[allocations[0].lineIndex];
  const fabric = (part: PartFile['part']) => {
    if (part === 'BODY' || part === 'BODY_BACK') return selectionName(line.fabricId);
    if (['COLLAR', 'COLLAR_STAND', 'COLLAR_PLACKET'].includes(part))
      return 'คอตามแบบ: ' + selectionName(line.productId);
    const prefix = part.startsWith('SLEEVE') ? 'ແຂນ' : part.startsWith('CUFF') ? 'ປາຍແຂນ' : 'ບ່າ';
    const component = line.parts.find((p) => {
      const item = context.selections.find((s) => s.id === p.componentId);
      return (item?.source_key ?? item?.name ?? '').includes(prefix);
    });
    return component?.fabricId ? selectionName(component.fabricId) : 'ไม่ได้ระบุผ้าแยกในออเดอร์';
  };
  const extraNames = chunks(names.slice(10), 24);
  const sizeGroups = chunks(sizes, 10),
    extraSizeGroups = sizeGroups.slice(1);
  const inlineNotes = snapshot.notes.length <= 140 && snapshot.notes.split('\n').length <= 2;
  const noteLines = snapshot.notes
    .split('\n')
    .flatMap((line) => (line ? chunks([...line], 55).map((c) => c.join('')) : ['']));
  const notes =
    snapshot.notes && !inlineNotes ? chunks(noteLines, 28).map((c) => c.join('\n')) : [];
  const attachments = media.attachments.flatMap((f) =>
    f.pages.map((url, i) => ({
      url,
      label: f.label,
      filename: f.filename,
      page: i + 1,
      total: f.pages.length,
    })),
  );
  const totalPages =
    2 + extraSizeGroups.length + extraNames.length + notes.length + attachments.length;
  function header(page: number, title: string) {
    return (
      <>
        <header className="ps-doc-header">
          <div className="ps-wordmark">
            JAZMINE<span>SPORTSWEAR · PRODUCTION</span>
          </div>
          <div className="ps-doc-id">
            <b>PS no: {snapshot.sheetNumber}</b>
            <span>Version: {snapshot.version ?? 'ไม่ระบุ'}</span>
            <span>
              Order no: {context.orderNumber} · Rev {context.revision}
            </span>
          </div>
          <div className="ps-doc-title">
            <b>PRODUCTION SHEET</b>
            <img src={qr} alt="รหัสใบผลิต" />
          </div>
        </header>
        {warning && <div className="ps-document-warning">{warning}</div>}
        {snapshot.continuedFrom && (
          <div className="ps-document-warning">
            CONTINUED FROM {snapshot.continuedFrom.number} · v{snapshot.continuedFrom.version} ·
            Order Rev {snapshot.continuedFrom.orderRevision} · Earlier progress retained
          </div>
        )}
        <div className="ps-page-caption">
          <strong>{title}</strong>
          <span>
            หน้า {page} / {totalPages}
          </span>
        </div>
      </>
    );
  }
  function footer() {
    return (
      <footer className="ps-doc-footer">
        {snapshot.sheetNumber} · ฉบับ {snapshot.version ?? 'ไม่ระบุ'} · ออกเมื่อ{' '}
        {date(snapshot.issuedAt)} · PS Act = จัดผลิตในใบนี้ ไม่ใช่จำนวนผลิตเสร็จ
      </footer>
    );
  }
  function art(part: PartFile['part'], className = '') {
    const file = snapshot.files.find((f) => f.part === part);
    return (
      <div className={'ps-part ' + className} key={part}>
        <div className="ps-part-image">
          {file && media.images[file.id] ? (
            <img src={media.images[file.id]} alt={PART_LABELS[part]} />
          ) : (
            <span>{file ? 'ไม่สามารถแสดงไฟล์' : 'ไม่มีไฟล์ส่วนนี้ในฉบับที่ออก'}</span>
          )}
        </div>
        <strong>{PART_LABELS[part]}</strong>
        <span className="ps-fabric">{fabric(part)}</span>
        {file && (
          <small>
            {file.filename} · ไฟล์ฉบับ {file.revision}
            {file.mime === 'application/pdf' ? ' · ภาพหน้าแรก / ทุกหน้าอยู่ในเอกสารแนบ' : ''}
          </small>
        )}
      </div>
    );
  }
  function namesTable(rows: typeof names, offset: number) {
    return (
      <table className="ps-names-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ชื่อบนเสื้อ</th>
            <th>เบอร์</th>
            <th>ไซซ์</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr key={offset + i}>
              <td>{offset + i + 1}</td>
              <td>{n.name || '-'}</td>
              <td>{n.number || '-'}</td>
              <td>{context.lines[n.lineIndex]?.size ?? 'ไม่ระบุ'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  function nameColumns(rows: typeof names, offset: number) {
    const half = Math.ceil(rows.length / 2);
    return (
      <div className="ps-name-columns">
        {namesTable(rows.slice(0, half), offset)}
        {namesTable(rows.slice(half), offset + half)}
      </div>
    );
  }
  return (
    <>
      <section className="ps-page">
        {header(1, 'ภาพรวมและจำนวนจัดผลิต')}
        <div className="ps-metadata">
          <div>
            <p>
              <b>Customer:</b> {context.customerName}
            </p>
            <p>
              <b>Priority:</b>{' '}
              <mark>
                {snapshot.printDetails?.priority === 'URGENT'
                  ? 'ด่วน'
                  : snapshot.printDetails?.priority === 'NORMAL'
                    ? 'ปกติ'
                    : 'ยังไม่ระบุ'}
              </mark>
            </p>
            <p>
              <b>Order Confirmed At:</b> {date(context.confirmedAt)}
            </p>
          </div>
          <div>
            <p>
              <b>Due Date:</b> <mark>{context.dueDate}</mark>
            </p>
            <p>
              <b>Created By:</b> {snapshot.createdBy ?? 'ยังไม่ระบุ'}
            </p>
            <p>
              <b>PS Created At:</b> {date(snapshot.createdAt)}
            </p>
          </div>
        </div>
        <div className="ps-approved-grid">
          <div className="ps-approved-mockup">
            <h2>แบบตัวอย่างที่อนุมัติตามออเดอร์</h2>
            {context.assets
              .filter((a) => a.kind === 'MOCKUP')
              .map((a) => (
                <div key={a.id}>
                  <img src={media.images[a.id]} alt="แบบตัวอย่างที่อนุมัติ" />
                  <small>
                    {a.filename} · ฉบับ {a.revision}
                    {a.mime === 'application/pdf' ? ' · ทุกหน้าอยู่ในเอกสารแนบ' : ''}
                  </small>
                </div>
              ))}
          </div>
          <div className="ps-brand-art">
            {(['NECK_LABEL', 'NECK_TAPE'] as const).map((kind) => {
              const asset = context.assets.find((a) => a.kind === kind);
              return (
                <div key={kind}>
                  <h2>{kind === 'NECK_LABEL' ? 'ປ້າຍຄໍ · ป้ายคอ' : 'ເທບຄໍ · เทปคอ'}</h2>
                  {asset ? (
                    <>
                      <img src={media.images[asset.id]} alt={kind} />
                      <small>
                        {asset.filename} · ฉบับ {asset.revision}
                        {asset.mime === 'application/pdf' ? ' · ดูเอกสารแนบ' : ''}
                      </small>
                    </>
                  ) : (
                    <p>ไม่มีไฟล์ในออเดอร์ฉบับนี้</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {sizeGroups.slice(0, 1).map((group, index) => (
          <table className="ps-size-table" key={index}>
            <thead>
              <tr>
                <th>Size</th>
                {group.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>All</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>QTY</th>
                {group.map((s) => (
                  <td key={s}>{orderQty(s)}</td>
                ))}
                <td>{orderQty()}</td>
              </tr>
              <tr className="ps-act">
                <th>PS Act</th>
                {group.map((s) => (
                  <td key={s}>{sheetQty(s)}</td>
                ))}
                <td>{sheetQty()}</td>
              </tr>
            </tbody>
          </table>
        ))}
        <p className="ps-quantity-help">
          QTY = ทั้งออเดอร์ รวมทุกแบบและของแถม · PS Act = จำนวนที่จัดผลิตในใบนี้ · All =
          ยอดรวมทุกไซซ์
          {extraSizeGroups.length ? ' · ไซซ์ที่เหลือดูหน้าตารางไซซ์เพิ่มเติม' : ''}
        </p>
        <h2 className="ps-section-title">ຊື່ແລະເບີ · ชื่อและเบอร์เสื้อ</h2>
        {names.length ? (
          nameColumns(names.slice(0, 10), 0)
        ) : (
          <p className="ps-empty-names">ไม่ได้ระบุชื่อหรือเบอร์เสื้อในใบนี้</p>
        )}
        <p className="ps-quantity-help">
          ระบุชื่อ/เบอร์ {names.length} ตัว จากที่จัดผลิต {sheetQty()} ตัว
          {extraNames.length ? ' · รายการต่อในหน้าถัดจากรายละเอียดชิ้นงาน' : ''} ·{' '}
          {notes.length
            ? 'คำสั่งงานอยู่ในหน้าหมายเหตุ'
            : snapshot.notes
              ? 'คำสั่งงานด้านล่าง'
              : 'ไม่มีหมายเหตุเพิ่มเติม'}
        </p>
        {snapshot.notes && inlineNotes && (
          <p className="ps-quantity-help ps-inline-notes">
            <b>คำสั่งงาน:</b> {snapshot.notes}
          </p>
        )}
        {footer()}
      </section>
      <section className="ps-page">
        {header(2, 'รายละเอียดชิ้นงานและผ้า')}
        <div className="ps-pattern-body">
          {art('BODY')}
          {art('BODY_BACK')}
        </div>
        <div className="ps-pattern-sleeves">
          {art('SLEEVE_LEFT')}
          {art('SLEEVE_RIGHT')}
        </div>
        <div className="ps-pattern-cuffs">
          {art('CUFF_LEFT')}
          {art('CUFF_RIGHT')}
        </div>
        <div className="ps-pattern-collars">
          {art('COLLAR')}
          {art('COLLAR_STAND')}
          {art('COLLAR_PLACKET')}
        </div>
        {snapshot.files.some((f) => f.part === 'SHOULDER') && (
          <div className="ps-pattern-shoulder">{art('SHOULDER')}</div>
        )}
        {footer()}
      </section>
      {extraSizeGroups.map((group, i) => (
        <section className="ps-page" key={'sizes' + i}>
          {header(3 + i, 'ตารางไซซ์เพิ่มเติม')}
          <table className="ps-size-table">
            <thead>
              <tr>
                <th>Size</th>
                {group.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>All</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>QTY</th>
                {group.map((s) => (
                  <td key={s}>{orderQty(s)}</td>
                ))}
                <td>{orderQty()}</td>
              </tr>
              <tr className="ps-act">
                <th>PS Act</th>
                {group.map((s) => (
                  <td key={s}>{sheetQty(s)}</td>
                ))}
                <td>{sheetQty()}</td>
              </tr>
            </tbody>
          </table>
          {footer()}
        </section>
      ))}
      {extraNames.map((rows, i) => (
        <section className="ps-page" key={'names' + i}>
          {header(3 + extraSizeGroups.length + i, 'ชื่อและเบอร์เสื้อ (ต่อ)')}
          {nameColumns(rows, 10 + i * 24)}
          {footer()}
        </section>
      ))}
      {notes.map((text, i) => (
        <section className="ps-page" key={'notes' + i}>
          {header(
            3 + extraSizeGroups.length + extraNames.length + i,
            'คำสั่งและหมายเหตุสำหรับผลิต',
          )}
          <p className="ps-full-notes">{text}</p>
          {footer()}
        </section>
      ))}
      {attachments.map((a, i) => (
        <section className="ps-page" key={'file' + i}>
          {header(
            3 + extraSizeGroups.length + extraNames.length + notes.length + i,
            'เอกสารแนบจากไฟล์ PDF',
          )}
          <h2 className="ps-attachment-label">
            {PART_LABELS[a.label as PartFile['part']] ??
              (a.label === 'MOCKUP'
                ? 'แบบตัวอย่าง'
                : a.label === 'NECK_LABEL'
                  ? 'ป้ายคอ'
                  : 'เทปคอ')}{' '}
            · {a.filename} · หน้า {a.page}/{a.total}
          </h2>
          <img className="ps-attachment-page" src={a.url} alt={`${a.filename} หน้า ${a.page}`} />
          {footer()}
        </section>
      ))}
    </>
  );
}
