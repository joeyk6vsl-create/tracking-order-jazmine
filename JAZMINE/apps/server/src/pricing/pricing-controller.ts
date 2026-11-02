import { Body, Controller, Get, Inject, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionAccess } from '../identity/http/session-access';
import { PricingService } from './pricing-service';
import { pricingSaveSchema, quoteSchema } from '../../../../packages/contracts/src/pricing';
@Controller('api/v1/pricing')
export class PricingController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(PricingService) private service: PricingService,
  ) {}
  @Get() async current(@Req() req: FastifyRequest) {
    return this.service.current(await this.access.current(req));
  }
  @Put() async save(@Req() req: FastifyRequest, @Body() body: unknown) {
    const actor = await this.access.current(req),
      data = pricingSaveSchema.parse(body);
    return this.service.save(actor, data.revision, data.config, data.reason);
  }
  @Post('quote') async quote(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.service.quote(await this.access.current(req), quoteSchema.parse(body));
  }
}
