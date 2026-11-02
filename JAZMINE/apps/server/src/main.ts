import { readConfig } from './config';
import { Database } from './database';
import { createApplication } from './app';
import { startWorker } from '../../worker/src/worker';
import { importAttachedCatalog } from './catalog/import-catalog';
import { seedPricing } from './pricing/seed-pricing';
import { createServer } from 'node:net';

async function main(): Promise<void> {
  let shutdownRequested = false;
  let shutdown: (() => Promise<void>) | undefined;
  const requestShutdown = () => {
    shutdownRequested = true;
    void shutdown?.();
  };
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
  process.on('message', (message) => {
    if (message === 'jazmine:shutdown') requestShutdown();
  });
  const config = readConfig();
  // ตรวจพอร์ตเดิมก่อนแตะฐาน เพื่อไม่ให้การเปิดซ้ำไปรบกวนโปรแกรมที่เปิดอยู่
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(config.port, '127.0.0.1', () => probe.close((e) => (e ? reject(e) : resolve())));
  });
  const db = await Database.open(config);
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  let stopWorker: () => void | Promise<void> = () => {};
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      try {
        await stopWorker();
      } finally {
        await app?.close();
      }
    } finally {
      try {
        await db.close();
      } finally {
        if (process.connected) process.disconnect();
      }
    }
  };
  try {
    if (!config.production) await db.migrate();
    if (!config.production && !config.recoveryMode) await importAttachedCatalog(db);
    if (!config.production && !config.recoveryMode) await seedPricing(db);
    app = await createApplication(config, db);
    // PGlite ใช้การเชื่อมต่อเดียว สำเนากู้คืนไม่รันงานเบื้องหลังอัตโนมัติ
    stopWorker =
      config.databaseUrl || config.recoveryMode ? () => {} : startWorker(db, config.origin);
    await app.listen(config.port, '127.0.0.1');
    shutdown = close;
    if (shutdownRequested) {
      await close();
      return;
    }
    console.log(`JAZMINE API ready at http://127.0.0.1:${config.port}/api/v1/health`);
  } catch (e) {
    await close();
    throw e;
  }
}
main().catch((error) => {
  if (process.connected) process.disconnect();
  console.error(
    error instanceof Error && error.message.startsWith('ฐานข้อมูลนี้กำลังเปิดอยู่')
      ? error.message
      : error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE'
        ? 'พอร์ตถูกใช้งานอยู่ กรุณาปิดโปรแกรมเดิมก่อนเปิดใหม่'
        : 'ไม่สามารถเปิดระบบได้ ตรวจฐานข้อมูลและการตั้งค่า',
  );
  process.exitCode = 1;
});
