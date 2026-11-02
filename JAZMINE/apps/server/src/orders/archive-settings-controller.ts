import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { archiveSettingsSchema } from '../../../../packages/contracts/src/order-lifecycle';
import { SessionAccess } from '../identity/http/session-access';
import { ArchiveAutomationService } from './archive-automation-service';
@Controller('api/v1/archive-settings')
export class ArchiveSettingsController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(ArchiveAutomationService) private service: ArchiveAutomationService,
  ) {}
  @Get() async settings(@Req() req: FastifyRequest) {
    return this.service.settings(await this.access.current(req));
  }
  @Post() async save(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.service.save(await this.access.current(req), archiveSettingsSchema.parse(body));
  }
}
