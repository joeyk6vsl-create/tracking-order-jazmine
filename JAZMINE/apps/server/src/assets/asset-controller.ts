import { Body, Controller, Get, Inject, Param, Put, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  uploadAssetSchema,
  uploadBrandAssetSchema,
  reviewAssetSchema,
} from '../../../../packages/contracts/src/assets';
import { SessionAccess } from '../identity/http/session-access';
import { AssetService } from './asset-service';
@Controller('api/v1/graphic-assets')
export class AssetController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(AssetService) private assets: AssetService,
  ) {}
  @Get('queue') async queue(@Req() req: FastifyRequest) {
    return this.assets.queue(await this.access.current(req));
  }
  @Get('draft/:id') async checklist(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.assets.checklist(await this.access.current(req), z.uuid().parse(id));
  }
  @Get('library/jazmine') async jazmineLibrary(@Req() req: FastifyRequest) {
    return this.assets.library(await this.access.current(req), null);
  }
  @Get('library/customer/:customerId') async customerLibrary(
    @Req() req: FastifyRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.assets.library(await this.access.current(req), z.uuid().parse(customerId));
  }
  @Put('library/jazmine/:id') async uploadJazmine(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.assets.uploadLibrary(
      await this.access.current(req),
      z.uuid().parse(id),
      null,
      uploadBrandAssetSchema.parse(body),
    );
  }
  @Put('library/customer/:customerId/:id') async uploadCustomer(
    @Req() req: FastifyRequest,
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.assets.uploadLibrary(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(customerId),
      uploadBrandAssetSchema.parse(body),
    );
  }
  @Put(':id') async upload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.access.current(req);
    return this.assets.upload(actor, z.uuid().parse(id), uploadAssetSchema.parse(body));
  }
  @Put(':id/review') async review(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.access.current(req),
      data = reviewAssetSchema.parse(body);
    return this.assets.review(actor, z.uuid().parse(id), data.decision, data.reason);
  }
  @Get(':id/content') async content(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.assets.content(await this.access.current(req), z.uuid().parse(id));
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
