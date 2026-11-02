import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { issueCorrectionSchema } from '../../../../packages/contracts/src/issue-corrections';
import { SessionAccess } from '../identity/http/session-access';
import { IssueCorrectionService } from './issue-correction-service';
@Controller('api/v1/production-exceptions/issues')
export class IssueCorrectionController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(IssueCorrectionService) private corrections: IssueCorrectionService,
  ) {}
  @Get(':id/correction') async preview(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.corrections.preview(await this.access.current(req), z.uuid().parse(id));
  }
  @Post(':id/corrections') async correct(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.corrections.correct(
      await this.access.current(req),
      z.uuid().parse(id),
      issueCorrectionSchema.parse(body),
    );
  }
}
