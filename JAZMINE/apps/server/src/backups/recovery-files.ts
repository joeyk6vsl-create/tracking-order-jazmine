import { mkdir, realpath, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { relative, resolve, join, isAbsolute, sep } from 'node:path';
import type { RecoveryReport } from '../../../../packages/contracts/src/backups';
import { AppError } from '../errors';
export function inside(root: string, target: string) {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
export class RecoveryFiles {
  constructor(
    readonly root: string,
    private projectRoot: string,
    private liveDataDir: string,
  ) {}
  private directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid recovery id');
    return join(resolve(this.root), 'JAZMINE_RECOVERY_' + id);
  }
  async target(id: string) {
    const dir = this.directory(id);
    // ตรวจตำแหน่งสุดท้ายก่อนสร้างหรือเปลี่ยนไฟล์ใดในโฟลเดอร์กู้คืน
    const live =
      this.liveDataDir === ':memory:'
        ? null
        : await realpath(resolve(this.liveDataDir)).catch(() => resolve(this.liveDataDir));
    const parent = await realpath(resolve(this.root)).catch(() => resolve(this.root)),
      physical = join(parent, 'JAZMINE_RECOVERY_' + id);
    if (live && (inside(live, physical) || inside(physical, live)))
      throw new AppError(
        'RECOVERY_PATH',
        'ໂຟນເດີກູ້ຄືນທັບຂໍ້ມູນທີ່ໃຊ້ / Recovery must be separate',
        409,
      );
    return dir;
  }
  async previous(id: string): Promise<RecoveryReport | null> {
    const dir = await this.target(id);
    try {
      return JSON.parse(
        await readFile(join(dir, 'RECOVERY_REPORT.json'), 'utf8'),
      ) as RecoveryReport;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new AppError('RECOVERY_REPORT', 'ລາຍງານກູ້ຄືນໃຊ້ບໍ່ໄດ້ / Invalid recovery report', 409);
    }
  }
  async create(id: string) {
    const dir = await this.target(id);
    await mkdir(resolve(this.root), { recursive: true, mode: 0o700 });
    if (
      (await readdir(resolve(this.root))).filter((n) => /^JAZMINE_RECOVERY_[0-9a-f-]{36}$/.test(n))
        .length >= 10
    )
      throw new AppError(
        'RECOVERY_LIMIT',
        'ມີສຳເນົາກູ້ຄືນ 10 ຊຸດແລ້ວ ໃຫ້ຜູ້ດູແລຈັດເກັບຊຸດເກົ່າກ່ອນ / Archive old recovery copies first',
        409,
      );
    // ตรวจอีกครั้งหลังตามลิงก์โฟลเดอร์จริง เพื่อไม่ให้เขียนเข้าฐานที่กำลังใช้อยู่
    await this.target(id);
    try {
      await mkdir(dir, { recursive: false, mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST')
        throw new AppError(
          'RECOVERY_EXISTS',
          'ພົບສຳເນົາເກົ່າ ກະລຸນາເລີ່ມກວດໃໝ່ / Start a new check',
          409,
        );
      throw e;
    }
    return dir;
  }
  async complete(report: RecoveryReport) {
    const dir = await this.target(report.id),
      q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    const script = `$ErrorActionPreference = 'Stop'\r\n$env:LOCAL_DATA_DIR = Join-Path $PSScriptRoot 'postgres'\r\n$env:DATABASE_URL = ''\r\n$env:NODE_ENV = 'development'\r\n$env:JAZMINE_RECOVERY_MODE = '1'\r\n$env:PORT = '3103'\r\n$env:JAZMINE_WEB_PORT = '5176'\r\n$env:WEB_ORIGIN = 'http://localhost:5176'\r\n$env:JAZMINE_API_TARGET = 'http://127.0.0.1:3103'\r\n& (Join-Path ${q(resolve(this.projectRoot))} 'scripts/start-local.ps1')\r\nexit $LASTEXITCODE\r\n`;
    await writeFile(join(dir, 'START_RECOVERED_JAZMINE.ps1'), '\ufeff' + script, {
      flag: 'wx',
      mode: 0o600,
    });
    await writeFile(
      join(dir, 'START_RECOVERED_JAZMINE.cmd'),
      '@echo off\r\nchcp 65001 >nul\r\ntitle JAZMINE - Recovered Copy\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_RECOVERED_JAZMINE.ps1"\r\nif errorlevel 1 pause\r\n',
      { flag: 'wx', mode: 0o600 },
    );
    await writeFile(
      join(dir, 'อ่านก่อนเปิดสำเนากู้คืน.txt'),
      'สำเนานี้ผ่านการตรวจข้อมูลกับไฟล์สำรองแล้ว\r\nเปิด START_RECOVERED_JAZMINE.cmd แล้วเข้า http://localhost:5176\r\nข้อมูลเดิมไม่ถูกทับ สำเนานี้ใช้บัญชีและรหัสผ่านที่มี ณ วันสำรอง\r\nการเข้าสู่ระบบและลิงก์ลูกค้าเดิมถูกปิด ต้องเข้าสู่ระบบและออกลิงก์ใหม่\r\nตรวจยอดและไฟล์ก่อนเลือกใช้กับงานร้านต่อ ดูคู่มือ BACKUP_AND_RECOVERY_TH.md ในโฟลเดอร์ docs ของโปรแกรม\r\n',
      { flag: 'wx', mode: 0o600 },
    );
    // เขียนรายงานเป็นสิ่งสุดท้าย เฉพาะสำเนาที่เตรียมครบแล้วจึงนำกลับมาใช้เมื่อ Retry
    await writeFile(join(dir, 'RECOVERY_REPORT.json'), JSON.stringify(report, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  async removeFailed(id: string) {
    const target = await this.target(id),
      root = await realpath(resolve(this.root)),
      actual = await realpath(target).catch(() => target);
    if (!inside(root, actual) || actual === root) throw new Error('Unsafe recovery cleanup');
    await rm(actual, { recursive: true, force: true });
  }
}
