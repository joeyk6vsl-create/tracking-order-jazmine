import { open, readFile, unlink, realpath, mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function acquireDatabaseLease(dataDir: string) {
  await mkdir(dataDir, { recursive: true });
  const canonical = await realpath(resolve(dataDir)),
    path = join(dirname(canonical), basename(canonical) + '.jazmine-owner'),
    token = randomUUID();
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(
        'ฐานข้อมูลนี้กำลังเปิดอยู่ หรือโปรแกรมปิดไม่สมบูรณ์ กรุณาปิดโปรแกรมเดิมก่อน หากยังเปิดไม่ได้ให้ใช้ START_RECOVERY_TOOL.cmd หรือให้ผู้ดูแลตรวจ ห้ามลบข้อมูลฐาน',
        { cause: e },
      );
    throw e;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }),
    );
    await handle.sync();
  } catch (e) {
    await handle.close();
    await unlink(path).catch(() => {});
    throw e;
  }
  await handle.close();
  let released = false;
  return async () => {
    if (released) return;
    const current = JSON.parse(await readFile(path, 'utf8'));
    if (current.token !== token) throw new Error('Database owner changed');
    await unlink(path);
    released = true;
  };
}
