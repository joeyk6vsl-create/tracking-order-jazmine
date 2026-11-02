import { useState } from 'react';
import {
  PART_LABELS,
  OPTIONAL_PARTS,
  type SheetInput,
  type SheetHistory,
  type SheetDetail,
  type ProductionContext,
  type SheetView,
} from '../../../../../packages/contracts/src/production';
import { api, errorMessage } from '../../services/api';
import { SheetPreview, type SheetSnapshot } from './SheetPreview';
import { PrintDetailsEditor } from './PrintDetailsEditor';
import { useSession } from '../auth/SessionProvider';
export function SheetEditor({
  context,
  detail,
  sheets,
  canPrepare,
  onSaved,
}: {
  context: ProductionContext;
  detail: SheetDetail | null;
  sheets: SheetView[];
  canPrepare: boolean;
  onSaved: (id: string) => Promise<void>;
}) {
  const { session } = useSession();
  const [id] = useState(() => detail?.sheet.id ?? crypto.randomUUID()),
    [quantities, setQuantities] = useState(() =>
      context.lines.map(
        (l) => detail?.sheet.allocations.find((a) => a.lineIndex === l.lineIndex)?.quantity ?? 0,
      ),
    ),
    [notes, setNotes] = useState(detail?.sheet.notes ?? ''),
    [printDetails, setPrintDetails] = useState<SheetInput['printDetails']>(
      detail?.sheet.printDetails ?? { priority: 'UNSPECIFIED', names: [] },
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<{
      fileId: string;
      part: SheetDetail['requiredParts'][number];
      filename: string;
      base64: string;
    } | null>(null),
    [historical, setHistorical] = useState<SheetSnapshot | null>(null);
  const allocations = quantities.flatMap((quantity, lineIndex) =>
      quantity > 0 ? [{ lineIndex, quantity }] : [],
    ),
    dirty =
      !!detail &&
      (allocations.length !== detail.sheet.allocations.length ||
        allocations.some(
          (a) =>
            detail.sheet.allocations.find((saved) => saved.lineIndex === a.lineIndex)?.quantity !==
            a.quantity,
        ) ||
        notes !== detail.sheet.notes ||
        printDetails.priority !== detail.sheet.printDetails.priority ||
        printDetails.names.length !== detail.sheet.printDetails.names.length ||
        printDetails.names.some((n, i) => {
          const saved = detail.sheet.printDetails.names[i];
          return (
            n.lineIndex !== saved?.lineIndex || n.name !== saved?.name || n.number !== saved?.number
          );
        })),
    disabled =
      !canPrepare || busy || detail?.stale || detail?.sheet.state === 'CANCELLED' || !!pending;
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/production/sheets/${id}`, 'PUT', {
        orderId: context.orderId,
        orderRevision: context.revision,
        rowVersion: detail?.sheet.rowVersion ?? 0,
        allocations,
        notes,
        printDetails,
        reason,
      });
      await onSaved(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(action: 'ready' | 'cancel') {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      await api(`/production/sheets/${id}/${action}`, 'POST', {
        rowVersion: detail.sheet.rowVersion,
        reason,
      });
      await onSaved(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(file: NonNullable<typeof pending>) {
    setBusy(true);
    setError('');
    try {
      await api(`/production/sheets/${id}/files/${file.fileId}`, 'PUT', {
        part: file.part,
        filename: file.filename,
        base64: file.base64,
      });
      setPending(null);
      await onSaved(id);
    } catch (e) {
      setError(errorMessage(e));
      setPending(file);
    } finally {
      setBusy(false);
    }
  }
  async function pick(part: SheetDetail['requiredParts'][number], file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('ไฟล์ต้องไม่เกิน 2 MB');
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
        reader.readAsDataURL(file);
      });
      await send({ fileId: crypto.randomUUID(), part, filename: file.name, base64 });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function history(version: number) {
    setBusy(true);
    try {
      const rows = await api<SheetHistory>(`/production/sheets/${id}/history`);
      setHistorical(rows.versions.find((v) => v.version === version)?.snapshot ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel pricing-panel">
        <h2>{detail?.sheet.sheetNumber ?? 'เตรียมใบผลิตร่างใหม่'}</h2>
        <p>
          ออเดอร์ {context.orderNumber} · ฉบับ {context.revision} · {context.customerName}
        </p>
        {detail && (
          <p>
            สถานะ{' '}
            {detail.sheet.state === 'READY'
              ? 'ใบผลิตพร้อม'
              : detail.sheet.state === 'CANCELLED'
                ? 'ยกเลิกแล้ว'
                : 'กำลังเตรียม'}{' '}
            · ฉบับที่ออกแล้ว {detail.sheet.issuedVersion}
          </p>
        )}
        {detail?.stale && (
          <p className="alert warning">
            ອໍເດີມີສະບັບໃໝ່ / Order revised · ໃຫ້ Owner/Admin ທົບທວນຈຳນວນໃຊ້ຕໍ່ດ້ານລຸ່ມ / Review
            previous production below
          </p>
        )}
        {detail?.hasWork && (
          <p className="alert warning">
            PS ນີ້ມີປະຫວັດການຜະລິດແລ້ວ. ເມື່ອອອກສະບັບໃໝ່ ສະຖານະ Start / Complete ຈະແຍກຕາມສະບັບ
            ແລະບໍ່ລຶບປະຫວັດເກົ່າ. ກະລຸນາກວດວຽກທີ່ເຮັດແລ້ວກັບພະແນກທີ່ກ່ຽວຂ້ອງ.
          </p>
        )}
        {detail?.pendingInheritance && detail.sheet.state !== 'CANCELLED' && (
          <p className="alert warning">
            ຮ່າງນີ້ໃຊ້ວຽກຕໍ່ຈາກ / Continued work awaiting approval:{' '}
            {detail.pendingInheritance.sourceNumber} · v{detail.pendingInheritance.sourceVersion} ·
            ກວດຈຳນວນ ຊື່/ເບີ ແລະ ໄຟລ໌ກ່ອນອະນຸມັດ / Check quantities, names and files before
            approving. Changing the reviewed instructions requires fresh production.
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <button disabled={busy} onClick={() => void send(pending)}>
            ลองส่งไฟล์คำขอเดิม
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="draft-fields" disabled={disabled}>
            {context.lines.map((line, index) => {
              const used = sheets
                .filter((s) => s.id !== id && s.state !== 'CANCELLED')
                .flatMap((s) => s.allocations)
                .filter((a) => a.lineIndex === index)
                .reduce((n, a) => n + a.quantity, 0);
              return (
                <label key={index}>
                  รายการ {index + 1} · ไซซ์ {line.size} · ในออเดอร์ {line.quantity} ตัว (รวมแถม) ·
                  ใบอื่นจัดแล้ว {used}
                  <input
                    aria-label={`จัดผลิตรายการ ${index + 1}`}
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={quantities[index]}
                    onChange={(e) =>
                      setQuantities((q) =>
                        q.map((n, i) => (i === index ? Number(e.target.value) : n)),
                      )
                    }
                  />
                </label>
              );
            })}
            <PrintDetailsEditor
              value={printDetails}
              onChange={setPrintDetails}
              lines={allocations.map((a) => ({ ...a, size: context.lines[a.lineIndex].size }))}
            />
            <label>
              คำสั่งและหมายเหตุสำหรับผลิต
              <textarea
                aria-label="หมายเหตุใบผลิต"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </fieldset>
          <label>
            เหตุผลที่บันทึกหรือเปลี่ยนใบผลิต
            <input
              aria-label="เหตุผลใบผลิต"
              maxLength={500}
              disabled={!canPrepare || busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {canPrepare && (
            <button
              className="primary"
              disabled={disabled || !reason.trim() || !allocations.length}
            >
              {detail?.sheet.state === 'READY' ? 'เปิดแก้เป็นร่างฉบับใหม่' : 'บันทึกร่างใบผลิต'}
            </button>
          )}
        </form>
        {detail && canPrepare && detail.sheet.state !== 'CANCELLED' && (
          <button disabled={busy || !reason.trim()} onClick={() => void action('cancel')}>
            ยกเลิกใบผลิตนี้พร้อมเหตุผล
          </button>
        )}
        {detail?.sheet.state === 'DRAFT' && !detail.stale && (
          <>
            <h3>ไฟล์ชิ้นงานที่ต้องเตรียม</h3>
            <p>
              ใช้ PNG/JPEG/WebP/PDF ไม่เกิน 2 MB · ไม่ใช้แบบตัวอย่างแทนชิ้นงานโดยอัตโนมัติ ·
              บันทึกหมายเหตุ/จำนวนก่อนแนบไฟล์
            </p>
            {[...detail.requiredParts, ...OPTIONAL_PARTS].map((part) => (
              <div key={part}>
                <label>
                  ไฟล์{PART_LABELS[part]}
                  <input
                    aria-label={'ไฟล์' + PART_LABELS[part]}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    disabled={!canPrepare || busy || dirty || !!pending}
                    onChange={(e) => {
                      void pick(part, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {detail.files
                  .filter((f) => f.part === part)
                  .map((f) => (
                    <p key={f.id}>
                      <a
                        href={`/api/v1/production/files/${f.id}/content`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.filename} · ไฟล์ฉบับ {f.revision}
                      </a>
                    </p>
                  ))}
              </div>
            ))}
            {canPrepare && (
              <button
                className="primary"
                disabled={
                  busy ||
                  dirty ||
                  !!pending ||
                  !reason.trim() ||
                  detail.requiredParts.some((p) => !detail.files.some((f) => f.part === p))
                }
                onClick={() => void action('ready')}
              >
                ตรวจครบแล้ว ทำใบผลิตให้พร้อม
              </button>
            )}
          </>
        )}
        {detail?.versions.map((v) => (
          <div key={v.version} className="ps-version-actions">
            <button disabled={busy} onClick={() => void history(v.version)}>
              ดูใบผลิตฉบับ {v.version}
            </button>
            <a
              href={`?productionSheet=${id}&version=${v.version}`}
              target="_blank"
              rel="noreferrer"
            >
              เปิด A4 / บันทึก PDF ฉบับ {v.version}
            </a>
            {session!.permissions.includes('production.resolve') && (
              <a
                href={`?productionWork=${id}&version=${v.version}`}
                target="_blank"
                rel="noreferrer"
              >
                ປະຫວັດວຽກ / Work v{v.version}
              </a>
            )}
          </div>
        ))}
      </section>
      {detail && (
        <SheetPreview
          snapshot={{
            context,
            allocations: detail.sheet.allocations,
            notes: detail.sheet.notes,
            printDetails: detail.sheet.printDetails,
            files: detail.files.filter(
              (f, i, all) => i === all.findIndex((x) => x.part === f.part),
            ),
            sheetNumber: detail.sheet.sheetNumber ?? undefined,
          }}
        />
      )}
      {historical && (
        <>
          <h2>ประวัติใบผลิตที่ออกแล้ว</h2>
          <SheetPreview snapshot={historical} />
        </>
      )}
    </>
  );
}
