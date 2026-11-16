import { useState } from 'react';
import type { SheetInput } from '../../../../../packages/contracts/src/production';
import { ActionButton } from '../../components/ActionButton';
import { parseBulkNames } from './parse-bulk-names';

type NameRow = SheetInput['printDetails']['names'][number];

export function BulkNamesPaste({
  lines,
  existing,
  onAdd,
}: {
  lines: { lineIndex: number; size: string; quantity: number }[];
  existing: NameRow[];
  onAdd: (rows: NameRow[]) => void;
}) {
  const [target, setTarget] = useState(0);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<
    ReturnType<typeof parseBulkNames> & { lineIndex: number }
  >();
  const line = lines.find((item) => item.lineIndex === target) ?? lines[0];
  const used = line ? existing.filter((row) => row.lineIndex === line.lineIndex).length : 0;
  const remaining = line ? line.quantity - used : 0;
  const tooMany =
    (preview?.rows.length ?? 0) > remaining || existing.length + (preview?.rows.length ?? 0) > 2000;

  function check() {
    if (!line) return;
    setPreview({ ...parseBulkNames(text, line.lineIndex), lineIndex: line.lineIndex });
  }
  function add() {
    if (
      !line ||
      !preview ||
      preview.lineIndex !== line.lineIndex ||
      preview.errors.length ||
      tooMany
    )
      return;
    onAdd(preview.rows);
    setText('');
    setPreview(undefined);
  }
  return (
    <section className="bulk-names-paste">
      <h4>ວາງຊື່ ແລະເບີ / Paste names & numbers</h4>
      <p>เลือกแบบเสื้อและไซซ์ วางหนึ่งคนต่อบรรทัด เช่น คัดลอกสองคอลัมน์จาก Excel</p>
      <label>
        รายการและไซซ์
        <select
          aria-label="ไซซ์สำหรับรายชื่อที่วาง"
          value={line?.lineIndex ?? ''}
          disabled={!line}
          onChange={(event) => {
            setTarget(Number(event.target.value));
            setPreview(undefined);
          }}
        >
          {lines.map((item) => (
            <option key={item.lineIndex} value={item.lineIndex}>
              รายการ {item.lineIndex + 1} · {item.size} · เพิ่มได้อีก{' '}
              {Math.max(
                0,
                item.quantity - existing.filter((row) => row.lineIndex === item.lineIndex).length,
              )}{' '}
              คน
            </option>
          ))}
        </select>
      </label>
      <label>
        ชื่อ แล้วคั่นด้วย Tab หรือเครื่องหมายจุลภาค แล้วตามด้วยเบอร์
        <textarea
          aria-label="วางชื่อและเบอร์เสื้อหลายบรรทัด"
          rows={5}
          maxLength={220000}
          placeholder={'SOMCHAI\t10\nSOMPHONE\t11'}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(undefined);
          }}
        />
      </label>
      <ActionButton action="check" disabled={!line || !text.trim()} onClick={check}>
        ตรวจรายชื่อที่วาง
      </ActionButton>
      {preview && preview.lineIndex === line?.lineIndex && (
        <div role="status">
          <p>
            อ่านได้ {preview.rows.length} คน · ไซซ์นี้เพิ่มได้อีก {remaining} คน
          </p>
          {tooMany && (
            <p className="alert error">จำนวนรายชื่อเกินจำนวนที่จัดผลิตหรือเกิน 2,000 คน</p>
          )}
          {preview.errors.map((error) => (
            <p className="alert error" key={error}>
              {error}
            </p>
          ))}
          {!preview.errors.length && !tooMany && (
            <>
              <ol className="bulk-names-preview">
                {preview.rows.slice(0, 10).map((row, index) => (
                  <li key={index}>
                    {row.name || '—'} · {row.number || '—'}
                  </li>
                ))}
              </ol>
              {preview.rows.length > 10 && <p>แสดงตัวอย่าง 10 คนแรกจาก {preview.rows.length} คน</p>}
              <ActionButton action="add" className="primary" onClick={add}>
                เพิ่ม {preview.rows.length} คนในใบผลิต
              </ActionButton>
            </>
          )}
        </div>
      )}
    </section>
  );
}
