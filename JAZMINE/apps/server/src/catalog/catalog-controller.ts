import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { catalogInput, catalogUpdate } from '../../../../packages/contracts/src/catalog';
import { SessionAccess } from '../identity/http/session-access';
import { CatalogService } from './catalog-service';
import { CatalogChoicesService } from './catalog-choices-service';
import { choicesSchema } from '../../../../packages/contracts/src/catalog-choices';

@Controller('api/v1/catalog')
export class CatalogController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(CatalogService) private service: CatalogService,
    @Inject(CatalogChoicesService) private choices: CatalogChoicesService,
  ) {}
  @Put(':id/availability') async availability(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.access.current(req),
      data = z
        .object({
          rowVersion: z.number().int().positive(),
          status: z.enum(['UNKNOWN', 'AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK']),
          reason: z.string().trim().min(1).max(500),
        })
        .strict()
        .parse(body);
    return this.service.availability(
      actor,
      z.uuid().parse(id),
      data.rowVersion,
      data.status,
      data.reason,
    );
  }
  @Get(':id/choices') async getChoices(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.choices.get(await this.access.current(req), z.uuid().parse(id));
  }
  @Put(':id/choices') async saveChoices(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.choices.save(
      await this.access.current(req),
      z.uuid().parse(id),
      choicesSchema.parse(body),
    );
  }
  @Get() async list(@Req() req: FastifyRequest, @Query('after') after?: string) {
    return this.service.list(await this.access.current(req), z.uuid().optional().parse(after));
  }
  @Get('options') async options(@Req() req: FastifyRequest) {
    return this.service.options(await this.access.current(req));
  }
  @Post(':id') async create(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(
      await this.access.current(req),
      z.uuid().parse(id),
      catalogInput.parse(body),
    );
  }
  @Put(':id') async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const data = catalogUpdate.parse(body);
    return this.service.save(
      await this.access.current(req),
      z.uuid().parse(id),
      data,
      data.rowVersion,
    );
  }
  @Get(':id/image') async image(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.service.image(await this.access.current(req), z.uuid().parse(id));
  }
  @Put(':id/image') async setImage(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const data = z
      .object({ image: z.string().max(180000).nullable(), rowVersion: z.number().int().positive() })
      .strict()
      .parse(body);
    return this.service.setImage(
      await this.access.current(req),
      z.uuid().parse(id),
      data.image,
      data.rowVersion,
    );
  }
}
