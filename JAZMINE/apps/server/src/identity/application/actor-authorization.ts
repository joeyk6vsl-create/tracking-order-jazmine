import type { Permission, UserView } from '../../../../../packages/contracts/src/identity';
import type { Sql } from '../../database';
import { AppError } from '../../errors';
import { permissionsFor } from '../domain/permissions';
import { UserRepository } from '../infrastructure/identity-repositories';

export class ActorAuthorization {
  private readonly users = new UserRepository();
  async require(
    sql: Sql,
    actor: UserView,
    permission: Permission,
    lock = false,
  ): Promise<UserView> {
    if (lock) await sql.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [actor.id]);
    const fresh = await this.users.byId(sql, actor.id);
    if (!fresh || fresh.status !== 'ACTIVE' || fresh.rowVersion !== actor.rowVersion)
      throw new AppError('AUTHENTICATION_REQUIRED', 'บัญชีเปลี่ยน กรุณาเข้าสู่ระบบใหม่', 401);
    if (!permissionsFor(fresh).includes(permission))
      throw new AppError('PERMISSION_DENIED', 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้', 403);
    return fresh;
  }
}
