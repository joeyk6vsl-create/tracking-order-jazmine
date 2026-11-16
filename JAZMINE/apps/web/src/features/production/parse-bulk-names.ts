import type { SheetInput } from '../../../../../packages/contracts/src/production';

type NameRow = SheetInput['printDetails']['names'][number];

export function parseBulkNames(text: string, lineIndex: number) {
  const rows: NameRow[] = [];
  const errors: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = raw.includes('\t') ? raw.split('\t') : raw.split(',');
    if (cells.length > 2) {
      errors.push(`แถว ${index + 1}: ใช้ชื่อและเบอร์สองช่องเท่านั้น`);
      return;
    }
    let name = cells[0]?.trim() ?? '';
    let number = cells[1]?.trim() ?? '';
    if (cells.length === 1 && /^\d+$/.test(name)) {
      number = name;
      name = '';
    }
    if (!name && !number) errors.push(`แถว ${index + 1}: ใส่ชื่อหรือเบอร์`);
    else if (name.length > 80) errors.push(`แถว ${index + 1}: ชื่อยาวเกิน 80 ตัวอักษร`);
    else if (number.length > 20) errors.push(`แถว ${index + 1}: เบอร์ยาวเกิน 20 ตัวอักษร`);
    else rows.push({ lineIndex, name, number });
  });
  if (!rows.length && !errors.length) errors.push('วางรายชื่ออย่างน้อยหนึ่งบรรทัด');
  return { rows, errors };
}
