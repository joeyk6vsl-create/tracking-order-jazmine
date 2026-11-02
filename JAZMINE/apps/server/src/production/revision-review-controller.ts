import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  revisionReviewSchema,
  revisionReversalSchema,
} from '../../../../packages/contracts/src/production-revisions';
import { SessionAccess } from '../identity/http/session-access';
import { RevisionReviewService } from './revision-review-service';
import { RevisionReversalService } from './revision-reversal-service';
@Controller('api/v1/production-revisions')
export class RevisionReviewController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(RevisionReviewService) private reviews: RevisionReviewService,
    @Inject(RevisionReversalService) private reversals: RevisionReversalService,
  ) {}
  @Get('reviews/:id/reversal') async reversalPreview(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ) {
    return this.reversals.preview(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('reviews/:id/reversal') async reverse(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.reversals.reverse(
      await this.access.current(req),
      z.uuid().parse(id),
      revisionReversalSchema.parse(body),
    );
  }
  @Get('orders/:id') async preview(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.reviews.preview(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('orders/:id') async apply(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.reviews.apply(
      await this.access.current(req),
      z.uuid().parse(id),
      revisionReviewSchema.parse(body),
    );
  }
}
