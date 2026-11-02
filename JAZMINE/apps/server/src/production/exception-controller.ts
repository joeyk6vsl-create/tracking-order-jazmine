import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  issueReportSchema,
  issueResolveSchema,
  replacementSchema,
} from '../../../../packages/contracts/src/production-exceptions';
import { SessionAccess } from '../identity/http/session-access';
import { ExceptionService } from './exception-service';
@Controller('api/v1/production-exceptions')
export class ExceptionController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(ExceptionService) private exceptions: ExceptionService,
  ) {}
  @Get('sheets/:id') async detail(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.exceptions.detail(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('sheets/:id/reports') async report(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.exceptions.report(
      await this.access.current(req),
      z.uuid().parse(id),
      issueReportSchema.parse(body),
    );
  }
  @Post('issues/:id/resolve') async resolve(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.exceptions.resolve(
      await this.access.current(req),
      z.uuid().parse(id),
      issueResolveSchema.parse(body),
    );
  }
  @Post('issues/:id/replacements') async replacement(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.exceptions.createReplacement(
      await this.access.current(req),
      z.uuid().parse(id),
      replacementSchema.parse(body),
    );
  }
}
