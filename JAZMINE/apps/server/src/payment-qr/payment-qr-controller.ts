import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  paymentQrCurrency,
  paymentQrSaveSchema,
  paymentQrCheckSchema,
} from '../../../../packages/contracts/src/payment-qr';
import { SessionAccess } from '../identity/http/session-access';
import { PaymentQrService } from './payment-qr-service';
@Controller('api/v1/payment-qr')
export class PaymentQrController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(PaymentQrService) private service: PaymentQrService,
  ) {}
  @Get() async list(@Req() req: FastifyRequest) {
    return this.service.list(await this.access.current(req));
  }
  @Post('check') async check(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.service.check(await this.access.current(req), paymentQrCheckSchema.parse(body));
  }
  @Post(':currency/inspect') async inspect(
    @Req() req: FastifyRequest,
    @Param('currency') c: string,
    @Body() body: unknown,
  ) {
    const data = z
      .object({ imageBase64: z.string().min(16).max(1400000) })
      .strict()
      .parse(body);
    return this.service.inspect(
      await this.access.current(req),
      paymentQrCurrency.parse(c),
      data.imageBase64,
    );
  }
  @Post(':currency') async save(
    @Req() req: FastifyRequest,
    @Param('currency') c: string,
    @Body() body: unknown,
  ) {
    return this.service.save(
      await this.access.current(req),
      paymentQrCurrency.parse(c),
      paymentQrSaveSchema.parse(body),
    );
  }
  @Get(':currency/history') async history(
    @Req() req: FastifyRequest,
    @Param('currency') c: string,
    @Query() query: unknown,
  ) {
    const q = z
      .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
      .strict()
      .parse(query);
    return this.service.history(await this.access.current(req), paymentQrCurrency.parse(c), q.page);
  }
  @Get(':currency/versions/:version/image') async image(
    @Req() req: FastifyRequest,
    @Param('currency') c: string,
    @Param('version') v: string,
    @Res() reply: FastifyReply,
  ) {
    const bytes = await this.service.image(
      await this.access.current(req),
      paymentQrCurrency.parse(c),
      z.coerce.number().int().positive().parse(v),
    );
    return reply.type('image/png').header('X-Content-Type-Options', 'nosniff').send(bytes);
  }
}
