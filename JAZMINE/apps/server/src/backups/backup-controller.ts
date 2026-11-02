import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { backupSchema } from '../../../../packages/contracts/src/backups';
import { SessionAccess } from '../identity/http/session-access';
import { AppError } from '../errors';
import { BackupService } from './backup-service';
function header(req: FastifyRequest, name: string) {
  const value = req.headers[name];
  if (typeof value !== 'string' || value.length > 6000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new AppError('INVALID_INPUT', 'ກະລຸນາກວດຂໍ້ມູນ / Check input', 400);
  return Buffer.from(value, 'base64').toString('utf8');
}
@Controller('api/v1/backups')
export class BackupController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(BackupService) private backups: BackupService,
  ) {}
  @Get('status') async status(@Req() req: FastifyRequest) {
    return this.backups.status(await this.access.current(req));
  }
  @Get('recoveries/:id') async recovery(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.backups.recovery(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('create') @HttpCode(200) async create(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.backups.create(
      await this.access.current(req),
      backupSchema.parse(body),
    );
    return reply
      .type('application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(file.bytes);
  }
  @Post('restore') async restore(@Req() req: FastifyRequest, @Body() body: unknown) {
    if (!Buffer.isBuffer(body))
      throw new AppError('INVALID_INPUT', 'ເລືອກໄຟລ໌ສຳຮອງ / Select backup file', 400);
    return this.backups.restore(
      await this.access.current(req),
      z.uuid().parse(req.headers['x-recovery-request']),
      body,
      backupSchema.parse({
        password: header(req, 'x-backup-password'),
        reason: header(req, 'x-recovery-reason'),
      }),
    );
  }
}
