import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  lifecycleCommandSchema,
  cancellationAgreementSchema,
} from '../../../../packages/contracts/src/order-lifecycle';
import { SessionAccess } from '../identity/http/session-access';
import { OrderLifecycleService } from './order-lifecycle-service';
@Controller('api/v1/order-lifecycle')
export class OrderLifecycleController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(OrderLifecycleService) private service: OrderLifecycleService,
  ) {}
  @Get(':id') async preview(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.service.preview(await this.access.current(req), z.uuid().parse(id));
  }
  @Post(':id/:operation') async command(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
  ) {
    const op = z.enum(['cancel', 'agreement', 'archive', 'restore']).parse(operation);
    return this.service.command(
      await this.access.current(req),
      z.uuid().parse(id),
      op,
      op === 'agreement'
        ? cancellationAgreementSchema.parse(body)
        : lifecycleCommandSchema.parse(body),
    );
  }
}
