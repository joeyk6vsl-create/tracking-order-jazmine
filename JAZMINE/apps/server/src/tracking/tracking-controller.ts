import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  issueLinkSchema,
  trackingCommandSchema,
  verifyTrackingSchema,
  customerRequestSchema,
  reviewRequestSchema,
  requestQuerySchema,
  invoiceTrackingSchema,
} from '../../../../packages/contracts/src/tracking';
import { SessionAccess } from '../identity/http/session-access';
import { TrackingLinkService } from './link-service';
import { CustomerRequestService } from './request-service';
import { PublicTrackingService } from './public-service';
@Controller('api/v1/tracking')
export class TrackingController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(TrackingLinkService) private links: TrackingLinkService,
    @Inject(CustomerRequestService) private requests: CustomerRequestService,
  ) {}
  @Get('orders/:id') async status(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.links.status(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('orders/:id/issue') async issue(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.links.issue(
      await this.access.current(req),
      z.uuid().parse(id),
      issueLinkSchema.parse(body),
    );
  }
  @Post('orders/:id/invoice-link') async invoice(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.links.invoice(
      await this.access.current(req),
      z.uuid().parse(id),
      invoiceTrackingSchema.parse(body).token,
    );
  }
  @Post('orders/:id/revoke') async revoke(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.links.revoke(
      await this.access.current(req),
      z.uuid().parse(id),
      trackingCommandSchema.parse(body),
    );
  }
  @Get('requests') async list(@Req() req: FastifyRequest, @Query() q: unknown) {
    return this.requests.list(await this.access.current(req), requestQuerySchema.parse(q));
  }
  @Post('requests/:id/review') async review(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.requests.review(
      await this.access.current(req),
      z.uuid().parse(id),
      reviewRequestSchema.parse(body),
    );
  }
}
export const TRACKING_SECURE = Symbol('TRACKING_SECURE');
export const TRACKING_COOKIE = Symbol('TRACKING_COOKIE');
const tokenHeader = (req: FastifyRequest) =>
  typeof req.headers['x-tracking-token'] === 'string' ? req.headers['x-tracking-token'] : undefined;
@Controller('api/v1/public-tracking')
export class PublicTrackingController {
  constructor(
    @Inject(TrackingLinkService) private links: TrackingLinkService,
    @Inject(PublicTrackingService) private tracking: PublicTrackingService,
    @Inject(CustomerRequestService) private requests: CustomerRequestService,
    @Inject(TRACKING_SECURE) private secure: boolean,
    @Inject(TRACKING_COOKIE) private cookieName: string,
  ) {}
  private cookie(req: FastifyRequest) {
    return req.cookies[this.cookieName];
  }
  @Post('verify') async verify(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.links.verify(verifyTrackingSchema.parse(body), req.ip);
    reply.setCookie(this.cookieName, session, {
      path: '/api/v1/public-tracking',
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      maxAge: 1800,
    });
    return { ok: true };
  }
  @Get('view') view(@Req() req: FastifyRequest) {
    return this.tracking.view(this.cookie(req), tokenHeader(req));
  }
  @Get('mockup') async mockup(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const file = await this.tracking.mockup(this.cookie(req), tokenHeader(req));
    return reply.type(file.mime).header('X-Content-Type-Options', 'nosniff').send(file.bytes);
  }
  @Post('requests') submit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.requests.submit(
      this.cookie(req),
      tokenHeader(req),
      customerRequestSchema.parse(body),
    );
  }
}
