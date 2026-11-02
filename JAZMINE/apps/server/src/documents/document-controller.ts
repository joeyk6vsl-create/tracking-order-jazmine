import { Body, Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  documentKindSchema,
  documentRetrySchema,
} from '../../../../packages/contracts/src/documents';
import { SessionAccess } from '../identity/http/session-access';
import { DocumentService } from './document-service';
@Controller('api/v1/documents')
export class DocumentController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(DocumentService) private documents: DocumentService,
  ) {}
  private target(p: Record<string, string>) {
    return {
      kind: documentKindSchema.parse(p.kind),
      id: z.uuid().parse(p.id),
      version: z.coerce.number().int().min(1).max(2147483647).parse(p.version),
    };
  }
  @Get(':kind/:id/:version/current-status') async currentStatus(
    @Req() req: FastifyRequest,
    @Param() p: Record<string, string>,
  ) {
    const t = this.target(p);
    return this.documents.currentStatus(await this.access.current(req), t.kind, t.id, t.version);
  }
  @Get(':kind/:id/:version/current-copy') async currentCopy(
    @Req() req: FastifyRequest,
    @Param() p: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const t = this.target(p),
      file = await this.documents.currentCopy(
        await this.access.current(req),
        t.kind,
        t.id,
        t.version,
      );
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Document-SHA256', file.sha256)
      .header('X-Document-Status-Checked-At', file.checkedAt)
      .send(file.bytes);
  }
  @Get(':kind/:id/:version') async status(
    @Req() req: FastifyRequest,
    @Param() p: Record<string, string>,
  ) {
    const t = this.target(p);
    return this.documents.status(await this.access.current(req), t.kind, t.id, t.version);
  }
  @Get(':kind/:id/:version/file') async file(
    @Req() req: FastifyRequest,
    @Param() p: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const t = this.target(p),
      file = await this.documents.file(await this.access.current(req), t.kind, t.id, t.version);
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Document-SHA256', file.sha256)
      .send(file.bytes);
  }
  @Post(':kind/:id/:version/retry') async retry(
    @Req() req: FastifyRequest,
    @Param() p: Record<string, string>,
    @Body() body: unknown,
  ) {
    const t = this.target(p);
    return this.documents.retry(
      await this.access.current(req),
      t.kind,
      t.id,
      t.version,
      documentRetrySchema.parse(body),
    );
  }
}
