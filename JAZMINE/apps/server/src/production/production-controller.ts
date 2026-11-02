import { Body, Controller, Get, Inject, Param, Put, Post, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  sheetSchema,
  partFileSchema,
  sheetActionSchema,
} from '../../../../packages/contracts/src/production';
import { SessionAccess } from '../identity/http/session-access';
import { ProductionService } from './production-service';
@Controller('api/v1/production')
export class ProductionController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(ProductionService) private production: ProductionService,
  ) {}
  @Get('orders') async queue(@Req() req: FastifyRequest) {
    return this.production.queue(await this.access.current(req));
  }
  @Get('orders/:id') async list(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.production.list(await this.access.current(req), z.uuid().parse(id));
  }
  @Get('sheets/:id') async detail(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.production.detail(await this.access.current(req), z.uuid().parse(id));
  }
  @Get('sheets/:id/history') async history(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.production.history(await this.access.current(req), z.uuid().parse(id));
  }
  @Put('sheets/:id') async save(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.production.save(
      await this.access.current(req),
      z.uuid().parse(id),
      sheetSchema.parse(body),
    );
  }
  @Put('sheets/:id/files/:fileId') async upload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body() body: unknown,
  ) {
    return this.production.upload(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(fileId),
      partFileSchema.parse(body),
    );
  }
  @Post('sheets/:id/:action') async action(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    const actor = await this.access.current(req),
      input = sheetActionSchema.parse(body);
    return this.production.action(
      actor,
      z.uuid().parse(id),
      input.rowVersion,
      input.reason,
      z.enum(['ready', 'cancel']).parse(action),
    );
  }
  @Get('files/:id/content') async content(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.production.content(await this.access.current(req), z.uuid().parse(id));
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
