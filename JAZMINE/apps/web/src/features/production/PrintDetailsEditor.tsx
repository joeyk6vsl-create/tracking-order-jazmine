import type { SheetInput } from '../../../../../packages/contracts/src/production';
export function PrintDetailsEditor({
  value,
  onChange,
  lines,
}: {
  value: SheetInput['printDetails'];
  onChange: (value: SheetInput['printDetails']) => void;
  lines: { lineIndex: number; size: string; quantity: number }[];
}) {
  return (
    <div>
      <label>
        ความเร่งด่วน
        <select
          aria-label="ความเร่งด่วนใบผลิต"
          value={value.priority}
          onChange={(e) =>
            onChange({ ...value, priority: e.target.value as typeof value.priority })
          }
        >
          <option value="UNSPECIFIED">ยังไม่ระบุ</option>
          <option value="NORMAL">ปกติ</option>
          <option value="URGENT">ด่วน</option>
        </select>
      </label>
      <h3>ชื่อและเบอร์เสื้อ (ถ้ามี)</h3>
      <p>หนึ่งแถวต่อเสื้อหนึ่งตัว เลือกไซซ์จากรายการที่จัดผลิตในใบนี้ ไม่จำเป็นต้องกรอกครบทุกตัว</p>
      {value.names.map((row, index) => (
        <div className="ps-name-editor" key={index}>
          <label>
            รายการและไซซ์
            <select
              aria-label={`รายการของรายชื่อ ${index + 1}`}
              value={row.lineIndex}
              onChange={(e) =>
                onChange({
                  ...value,
                  names: value.names.map((r, i) =>
                    i === index ? { ...r, lineIndex: Number(e.target.value) } : r,
                  ),
                })
              }
            >
              {!lines.some((l) => l.lineIndex === row.lineIndex) && (
                <option value={row.lineIndex}>รายการที่ไม่ได้จัดผลิตแล้ว</option>
              )}
              {lines.map((l) => (
                <option key={l.lineIndex} value={l.lineIndex}>
                  รายการ {l.lineIndex + 1} · {l.size} · {l.quantity} ตัว
                </option>
              ))}
            </select>
          </label>
          <label>
            ชื่อ
            <input
              aria-label={`ชื่อบนเสื้อ ${index + 1}`}
              value={row.name}
              maxLength={80}
              onChange={(e) =>
                onChange({
                  ...value,
                  names: value.names.map((r, i) =>
                    i === index ? { ...r, name: e.target.value } : r,
                  ),
                })
              }
            />
          </label>
          <label>
            เบอร์
            <input
              aria-label={`เบอร์บนเสื้อ ${index + 1}`}
              value={row.number}
              maxLength={20}
              onChange={(e) =>
                onChange({
                  ...value,
                  names: value.names.map((r, i) =>
                    i === index ? { ...r, number: e.target.value } : r,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            aria-label={`ลบรายชื่อ ${index + 1}`}
            onClick={() => onChange({ ...value, names: value.names.filter((_, i) => i !== index) })}
          >
            ลบ
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={!lines.length || value.names.length >= 2000}
        onClick={() =>
          onChange({
            ...value,
            names: [...value.names, { lineIndex: lines[0].lineIndex, name: '', number: '' }],
          })
        }
      >
        เพิ่มชื่อและเบอร์เสื้อ
      </button>
    </div>
  );
}
