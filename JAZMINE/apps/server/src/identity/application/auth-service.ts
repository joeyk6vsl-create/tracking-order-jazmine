import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { z } from 'zod';
import {
  changePasswordSchema,
  setupSchema,
  type UserView,
} from '../../../../../packages/contracts/src/identity';
import { Database, type Sql } from '../../database';
import { AppError } from '../../errors';
import { AuthRepository, UserRepository } from '../infrastructure/identity-repositories';
import { recordAudit, recordEvent } from '../../shared/audit';

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export const hashPassword = (value: string): Promise<string> =>
  hash(value, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export class AuthService {
  private readonly auth = new AuthRepository();
  private readonly users = new UserRepository();
  private readonly dummy = hashPassword(randomBytes(32).toString('hex'));
  constructor(
    private readonly db: Database,
    private readonly allowBootstrap: boolean,
  ) {}
  // คำสั่งฝั่งรหัสผ่านสำหรับ workflow ผู้ใช้ ใช้ transaction เดียวกันโดยไม่เขียน repository ข้ามเจ้าของ
  async provisionCredentials(
    sql: Sql,
    id: string,
    username: string,
    hash: string,
    mustChange: boolean,
  ): Promise<void> {
    await this.auth.provision(sql, id, username, hash, mustChange);
  }
  async revokeSessions(sql: Sql, id: string): Promise<void> {
    await this.auth.revoke(sql, id);
  }
  async resetCredentials(sql: Sql, id: string, hash: string): Promise<void> {
    await this.auth.replacePassword(sql, id, hash, true);
    await this.auth.revoke(sql, id);
  }
  async bootstrapRequired(): Promise<boolean> {
    return this.allowBootstrap && (await this.users.count(this.db)) === 0;
  }
  async bootstrap(data: z.infer<typeof setupSchema>): Promise<void> {
    if (!this.allowBootstrap)
      throw new AppError('SETUP_DISABLED', 'ตั้งค่าเจ้าของครั้งแรกได้เฉพาะเครื่องพัฒนา', 403);
    const passwordHash = await hashPassword(data.password);
    await this.db.transaction(async (sql) => {
      await this.users.lockAuthority(sql);
      if ((await this.users.count(sql)) !== 0)
        throw new AppError('ALREADY_CONFIGURED', 'ระบบมีเจ้าของแล้ว', 409);
      const id = await this.users.insert(sql, {
        displayName: data.displayName,
        role: 'ADMIN_PROMAX',
        department: 'ADMIN',
      });
      await this.auth.provision(sql, id, data.username, passwordHash, false);
      await recordAudit(sql, id, 'OWNER_BOOTSTRAPPED', id);
      await recordEvent(sql, 'UserCreated', id);
    });
  }
  async authenticate(token?: string): Promise<UserView | null> {
    if (!token) return null;
    const id = await this.auth.session(this.db, digest(token));
    if (!id) return null;
    const user = await this.users.byId(this.db, id);
    return user?.status === 'ACTIVE' ? user : null;
  }
  async login(
    username: string,
    password: string,
    ip: string,
  ): Promise<{ token: string; user: UserView }> {
    const key = digest(ip + ':' + username);
    const attempts = await this.db.query(
      "SELECT attempts FROM login_throttle WHERE key=$1 AND window_started>now()-interval '15 minutes'",
      [key],
    );
    if (Number(attempts[0]?.attempts ?? 0) >= 10)
      throw new AppError('RATE_LIMITED', 'ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที', 429);
    const credential = await this.auth.credential(this.db, username);
    const valid = await verify(credential?.passwordHash ?? (await this.dummy), password);
    const token = randomBytes(32).toString('base64url');
    let result: UserView | null = null;
    await this.db.transaction(async (sql) => {
      // Serialize with password/authority changes: never create a session against stale credentials.
      await this.users.lockAuthority(sql);
      const fresh = credential ? await this.auth.credential(sql, username) : null;
      const user = fresh ? await this.users.byId(sql, fresh.userId) : null;
      if (
        !valid ||
        !fresh ||
        fresh.passwordHash !== credential?.passwordHash ||
        user?.status !== 'ACTIVE'
      ) {
        await sql.query(
          "INSERT INTO login_throttle(key,attempts,window_started) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_throttle.window_started>now()-interval '15 minutes' THEN login_throttle.attempts+1 ELSE 1 END,window_started=CASE WHEN login_throttle.window_started>now()-interval '15 minutes' THEN login_throttle.window_started ELSE now() END",
          [key],
        );
        await recordAudit(sql, null, 'LOGIN_FAILED', null);
        return;
      }
      await sql.query('DELETE FROM login_throttle WHERE key=$1', [key]);
      await this.auth.issue(sql, digest(token), user.id, new Date(Date.now() + 8 * 60 * 60 * 1000));
      await recordAudit(sql, user.id, 'LOGIN_SUCCESS', user.id);
      result = user;
    });
    if (!result)
      throw new AppError(
        'INVALID_CREDENTIALS',
        'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีใช้ไม่ได้',
        401,
      );
    return { token, user: result };
  }
  async logout(token?: string): Promise<void> {
    if (!token) return;
    await this.db.transaction(async (sql) => {
      const id = await this.auth.session(sql, digest(token));
      await this.auth.deleteSession(sql, digest(token));
      if (id) await recordAudit(sql, id, 'LOGOUT', id);
    });
  }
  async changePassword(user: UserView, data: z.infer<typeof changePasswordSchema>): Promise<void> {
    const oldHash = await this.auth.password(this.db, user.id);
    if (!(await verify(oldHash, data.currentPassword)))
      throw new AppError('WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    if (data.currentPassword === data.newPassword)
      throw new AppError('SAME_PASSWORD', 'กรุณาใช้รหัสผ่านใหม่');
    const newHash = await hashPassword(data.newPassword);
    await this.db.transaction(async (sql) => {
      await this.users.lockAuthority(sql);
      const current = await this.users.byId(sql, user.id);
      if (!current || current.status !== 'ACTIVE' || current.rowVersion !== user.rowVersion)
        throw new AppError('AUTHENTICATION_REQUIRED', 'บัญชีเปลี่ยน กรุณาเข้าสู่ระบบใหม่', 401);
      if ((await this.auth.password(sql, user.id)) !== oldHash)
        throw new AppError('STALE_STATE', 'ข้อมูลเปลี่ยน กรุณาเข้าสู่ระบบใหม่', 409);
      await this.auth.replacePassword(sql, user.id, newHash, false);
      await this.users.bump(sql, user.id);
      await this.auth.revoke(sql, user.id);
      await recordAudit(sql, user.id, 'PASSWORD_CHANGED', user.id);
    });
  }
}
