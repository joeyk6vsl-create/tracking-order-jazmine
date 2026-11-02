import { Body, Controller, Get, Inject, Param, Put, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { draftSchema } from '../../../../packages/contracts/src/orders';
import { SessionAccess } from '../identity/http/session-access';
import { DraftService } from './draft-service';
@Controller('api/v1/order-drafts')
export class DraftController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(DraftService) private service: DraftService,
  ) {}
  @Get() async list(@Req() req: FastifyRequest) {
    return this.service.list(await this.access.current(req));
  }
  @Post('preview') async preview(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.service.preview(await this.access.current(req), draftSchema.parse(body));
  }
  @Put(':id') async save(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(
      await this.access.current(req),
      z.uuid().parse(id),
      draftSchema.parse(body),
    );
  }
}
