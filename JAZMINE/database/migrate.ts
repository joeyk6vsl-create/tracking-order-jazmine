import { readConfig } from '../apps/server/src/config';
import { Database } from '../apps/server/src/database';

async function main(): Promise<void> {
  const db = await Database.open(readConfig());
  try {
    await db.migrate();
    console.log('ปรับโครงสร้างข้อมูลสำเร็จ');
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error('ปรับโครงสร้างข้อมูลไม่สำเร็จ กรุณาตรวจการตั้งค่า');
  process.exitCode = 1;
});
