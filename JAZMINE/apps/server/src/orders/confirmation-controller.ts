import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { readinessSchema, confirmSchema } from '../../../../packages/contracts/src/confirmation';
import { SessionAccess } from '../identity/http/session-access';
import { ConfirmationService } from './confirmation-service';
@Controller('api/v1/orders')
export class ConfirmationController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(ConfirmationService) private orders: ConfirmationService,
  ) {}
  @Get() async list(@Req() req: FastifyRequest) {
    return this.orders.list(await this.access.current(req));
  }
  @Get(':id/history') async history(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.orders.history(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('check') async check(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.orders.check(await this.access.current(req), readinessSchema.parse(body));
  }
  @Post('confirm') async confirm(@Req() req: FastifyRequest, @Body() body: unknown) {
    const actor = await this.access.current(req),
      data = confirmSchema.parse(body);
    return this.orders.confirm(actor, data, data.checkToken, data.reason);
  }
}
