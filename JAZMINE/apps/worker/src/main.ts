import { readConfig } from '../../server/src/config';
import { Database } from '../../server/src/database';
import { startWorker } from './worker';

async function main(): Promise<void> {
  const config = readConfig();
  if (config.recoveryMode) throw new Error('สำเนาทดลองกู้คืนไม่เปิดงานเบื้องหลังอัตโนมัติ');
  if (!config.databaseUrl)
    throw new Error('โหมดฐานข้อมูลฝังทำงานเบื้องหลังใน API อยู่แล้ว ไม่ต้องเปิด worker ซ้ำ');
  const db = await Database.open(config);
  const stop = startWorker(db, config.origin);
  console.log('JAZMINE worker ready');
  const keepAlive = setInterval(() => {}, 60_000);
  const close = async () => {
    await stop();
    clearInterval(keepAlive);
    await db.close();
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'เปิด worker ไม่สำเร็จ');
  process.exitCode = 1;
});
