import type { Sql } from '../database';
// ไฟล์ที่ใช้ต่ออ้างอิงเนื้อหาเดิมที่ไม่เปลี่ยน แยกชื่อ/ประวัติใบใหม่โดยไม่คัดลอกข้อมูลรูปซ้ำ
export async function productionFileContent(sql: Sql, id: string) {
  return (
    await sql.query(
      'SELECT p.filename,p.mime,COALESCE(original.file_data,p.file_data) AS file_data FROM production_part_files p LEFT JOIN production_part_files original ON original.id=p.source_file_id WHERE p.id=$1',
      [id],
    )
  )[0];
}
