import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  quotationCheckSchema,
  quotationIssueSchema,
  quotationQuerySchema,
} from '../../../../packages/contracts/src/quotations';
import { SessionAccess } from '../identity/http/session-access';
import { QuotationService } from './quotation-service';
@Controller('api/v1/quotations')
export class QuotationController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(QuotationService) private service: QuotationService,
  ) {}
  @Get() async list(@Req() req: FastifyRequest, @Query() query: unknown) {
    const q = quotationQuerySchema.parse(query);
    return this.service.list(await this.access.current(req), q.search, q.page);
  }
  @Get('revisions/:id') async detail(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.service.detail(await this.access.current(req), z.uuid().parse(id));
  }
  @Get('drafts/:id') async history(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const q = quotationQuerySchema.pick({ page: true }).parse(query);
    return this.service.history(await this.access.current(req), z.uuid().parse(id), q.page);
  }
  @Post('drafts/:id/check') async check(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.check(
      await this.access.current(req),
      z.uuid().parse(id),
      quotationCheckSchema.parse(body),
    );
  }
  @Post('drafts/:id/issue') async issue(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.issue(
      await this.access.current(req),
      z.uuid().parse(id),
      quotationIssueSchema.parse(body),
    );
  }
}
