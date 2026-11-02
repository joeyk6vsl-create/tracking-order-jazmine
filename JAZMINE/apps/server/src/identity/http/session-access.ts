import type { FastifyRequest } from 'fastify';
import type { UserView } from '../../../../../packages/contracts/src/identity';
import type { AppConfig } from '../../config';
import { AppError } from '../../errors';
import { AuthService } from '../application/auth-service';
import { sessionName } from './cookie-names';

export class SessionAccess {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}
  async current(req: FastifyRequest, allowForced = false): Promise<UserView> {
    const name = sessionName(this.config);
    const user = await this.auth.authenticate(req.cookies[name]);
    if (!user) throw new AppError('AUTHENTICATION_REQUIRED', 'กรุณาเข้าสู่ระบบ', 401);
    if (!allowForced && user.mustChangePassword)
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'ต้องเปลี่ยนรหัสผ่านก่อนเริ่มงาน', 403);
    return user;
  }
}
