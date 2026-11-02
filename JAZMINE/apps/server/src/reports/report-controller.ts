import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reportQuerySchema } from '../../../../packages/contracts/src/reports';
import { SessionAccess } from '../identity/http/session-access';
import { ReportService } from './report-service';
@Controller('api/v1/reports')
export class ReportController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(ReportService) private reports: ReportService,
  ) {}
  @Get('summary') async read(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.reports.read(await this.access.current(req), reportQuerySchema.parse(query));
  }
}
