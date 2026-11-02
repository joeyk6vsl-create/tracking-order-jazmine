import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  WORK_STAGES,
  workQuerySchema,
  workActionSchema,
} from '../../../../packages/contracts/src/production-work';
import { SessionAccess } from '../identity/http/session-access';
import { WorkService } from './work-service';
@Controller('api/v1/production-work')
export class WorkController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(WorkService) private work: WorkService,
  ) {}
  @Get('jobs') async queue(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.work.queue(await this.access.current(req), workQuerySchema.parse(query));
  }
  @Get('jobs/:id') async detail(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const input = z
      .object({ version: z.coerce.number().int().positive().max(1000000).optional() })
      .strict()
      .parse(query);
    return this.work.detail(await this.access.current(req), z.uuid().parse(id), input.version);
  }
  @Post('jobs/:id/stages/:department') async action(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('department') department: string,
    @Body() body: unknown,
  ) {
    return this.work.action(
      await this.access.current(req),
      z.uuid().parse(id),
      z.enum(WORK_STAGES).parse(department),
      workActionSchema.parse(body),
    );
  }
  @Get('jobs/:id/versions/:version/:kind/:fileId/content') async content(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('version') version: string,
    @Param('kind') kind: string,
    @Param('fileId') fileId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.work.content(
      await this.access.current(req),
      z.uuid().parse(id),
      z.coerce.number().int().positive().max(1000000).parse(version),
      z.uuid().parse(fileId),
      z.enum(['part', 'asset']).parse(kind),
    );
    reply
      .header('Content-Type', file.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header(
        'Content-Disposition',
        `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, '%27')}`,
      )
      .send(file.bytes);
  }
}
