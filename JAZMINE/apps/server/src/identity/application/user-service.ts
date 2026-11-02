import type { z } from 'zod';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type UserView,
} from '../../../../../packages/contracts/src/identity';
import { Database, type Sql } from '../../database';
import { AppError } from '../../errors';
import { UserRepository } from '../infrastructure/identity-repositories';
import { recordAudit, recordEvent } from '../../shared/audit';
import { permissionsFor } from '../domain/permissions';
import { AuthService, hashPassword } from './auth-service';

export class UserService {
  private readonly users = new UserRepository();
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
  ) {}
  private async owner(sql: Sql, actor: UserView): Promise<void> {
    const fresh = await this.users.byId(sql, actor.id);
    if (!fresh || !permissionsFor(fresh).includes('users.manage'))
      throw new AppError('PERMISSION_DENIED', 'เฉพาะเจ้าของเท่านั้น', 403);
    if (fresh.rowVersion !== actor.rowVersion)
      throw new AppError('AUTHENTICATION_REQUIRED', 'บัญชีเปลี่ยน กรุณาเข้าสู่ระบบใหม่', 401);
  }
  async list(actor: UserView): Promise<UserView[]> {
    await this.owner(this.db, actor);
    return this.users.list(this.db);
  }
  async create(actor: UserView, data: z.infer<typeof createUserSchema>): Promise<UserView> {
    await this.owner(this.db, actor);
    const hash = await hashPassword(data.password);
    return this.db.transaction(async (sql) => {
      await this.users.lockAuthority(sql);
      await this.owner(sql, actor);
      const id = await this.users.insert(sql, data);
      await this.auth.provisionCredentials(sql, id, data.username, hash, true);
      await recordAudit(sql, actor.id, 'USER_CREATED', id);
      await recordEvent(sql, 'UserCreated', id);
      return (await this.users.byId(sql, id))!;
    });
  }
  async update(
    actor: UserView,
    id: string,
    data: z.infer<typeof updateUserSchema>,
  ): Promise<UserView> {
    return this.db.transaction(async (sql) => {
      await this.users.lockAuthority(sql);
      await this.owner(sql, actor);
      const current = await this.users.byId(sql, id);
      if (!current) throw new AppError('NOT_FOUND', 'ไม่พบบัญชี', 404);
      if (current.rowVersion !== data.rowVersion)
        throw new AppError('STALE_STATE', 'มีผู้แก้ข้อมูลไปแล้ว กรุณาโหลดล่าสุด', 409);
      if (
        current.role === 'ADMIN_PROMAX' &&
        current.status === 'ACTIVE' &&
        (data.role !== 'ADMIN_PROMAX' || data.status !== 'ACTIVE') &&
        (await this.users.activeOwners(sql)) <= 1
      )
        throw new AppError('LAST_OWNER', 'ต้องเหลือเจ้าของที่ใช้งานได้อย่างน้อยหนึ่งบัญชี', 409);
      await this.users.update(sql, id, data);
      if (
        current.role !== data.role ||
        current.department !== data.department ||
        current.status !== data.status
      )
        await this.auth.revokeSessions(sql, id);
      await recordAudit(sql, actor.id, 'USER_UPDATED', id, data.reason, {
        before: { role: current.role, department: current.department, status: current.status },
        after: { role: data.role, department: data.department, status: data.status },
      });
      await recordEvent(sql, 'UserAuthorityChanged', id);
      return (await this.users.byId(sql, id))!;
    });
  }
  async resetPassword(
    actor: UserView,
    id: string,
    data: z.infer<typeof resetPasswordSchema>,
  ): Promise<void> {
    await this.owner(this.db, actor);
    const hash = await hashPassword(data.temporaryPassword);
    await this.db.transaction(async (sql) => {
      await this.users.lockAuthority(sql);
      await this.owner(sql, actor);
      const current = await this.users.byId(sql, id);
      if (!current) throw new AppError('NOT_FOUND', 'ไม่พบบัญชี', 404);
      if (current.rowVersion !== data.rowVersion)
        throw new AppError('STALE_STATE', 'ข้อมูลบัญชีเปลี่ยน กรุณาโหลดล่าสุด', 409);
      await this.auth.resetCredentials(sql, id, hash);
      await this.users.bump(sql, id);
      await recordAudit(sql, actor.id, 'PASSWORD_RESET', id, data.reason);
    });
  }
}
