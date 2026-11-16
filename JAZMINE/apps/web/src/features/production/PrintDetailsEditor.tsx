import type { SheetInput } from '../../../../../packages/contracts/src/production';
import { ActionButton } from '../../components/ActionButton';
import { BulkNamesPaste } from './BulkNamesPaste';
import { useState } from 'react';
export function PrintDetailsEditor({
  value,
  onChange,
  lines,
}: {
  value: SheetInput['printDetails'];
  onChange: (value: SheetInput['printDetails']) => void;
  lines: { lineIndex: number; size: string; quantity: number }[];
}) {
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const lastPage = Math.max(0, Math.ceil(value.names.length / pageSize) - 1);
  const visiblePage = Math.min(page, lastPage);
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
      <BulkNamesPaste
        lines={lines}
        existing={value.names}
        onAdd={(rows) => {
          onChange({ ...value, names: [...value.names, ...rows] });
          setPage(Math.floor((value.names.length + rows.length - 1) / pageSize));
        }}
      />
      {value.names.length > pageSize && (
        <div className="bulk-names-pages">
          <ActionButton
            action="previous"
            disabled={visiblePage === 0}
            onClick={() => setPage(visiblePage - 1)}
          >
            ก่อนหน้า
          </ActionButton>
          <span>
            รายชื่อ {visiblePage * pageSize + 1}–
            {Math.min((visiblePage + 1) * pageSize, value.names.length)} จาก {value.names.length}
          </span>
          <ActionButton
            action="next"
            disabled={visiblePage >= lastPage}
            onClick={() => setPage(visiblePage + 1)}
          >
            ถัดไป
          </ActionButton>
        </div>
      )}
      {value.names
        .slice(visiblePage * pageSize, (visiblePage + 1) * pageSize)
        .map((row, localIndex) => {
          const index = visiblePage * pageSize + localIndex;
          return (
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
              <ActionButton
                action="remove"
                type="button"
                aria-label={`ลบรายชื่อ ${index + 1}`}
                onClick={() =>
                  onChange({ ...value, names: value.names.filter((_, i) => i !== index) })
                }
              >
                ลบ
              </ActionButton>
            </div>
          );
        })}
      <ActionButton
        action="add"
        type="button"
        disabled={!lines.length || value.names.length >= 2000}
        onClick={() => {
          onChange({
            ...value,
            names: [...value.names, { lineIndex: lines[0].lineIndex, name: '', number: '' }],
          });
          setPage(Math.floor(value.names.length / pageSize));
        }}
      >
        เพิ่มชื่อและเบอร์เสื้อ
      </ActionButton>
    </div>
  );
}
