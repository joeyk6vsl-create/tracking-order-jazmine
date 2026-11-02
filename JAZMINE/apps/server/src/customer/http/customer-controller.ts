import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createCustomerSchema,
  customerListSchema,
  phoneMatchesSchema,
  updateCustomerSchema,
} from '../../../../../packages/contracts/src/customers';
import { SessionAccess } from '../../identity/http/session-access';
import { CustomerService } from '../application/customer-service';

@Controller('api/v1/customers')
export class CustomerController {
  constructor(
    @Inject(SessionAccess) private readonly access: SessionAccess,
    @Inject(CustomerService) private readonly customers: CustomerService,
  ) {}
  @Get() async list(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.customers.list(await this.access.current(req), customerListSchema.parse(query));
  }
  @Get('phone-matches') async matches(@Req() req: FastifyRequest, @Query() query: unknown) {
    const actor = await this.access.current(req),
      input = phoneMatchesSchema.parse(query);
    return { customers: await this.customers.phoneMatches(actor, input.phone, input.excludeId) };
  }
  @Get(':id') async detail(@Req() req: FastifyRequest, @Param('id') id: string) {
    return {
      customer: await this.customers.byId(await this.access.current(req), z.uuid().parse(id)),
    };
  }
  @Post() async create(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = await this.access.current(req);
    return this.customers.create(actor, createCustomerSchema.parse(body), z.uuid().parse(key));
  }
  @Patch(':id') async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.customers.update(
      await this.access.current(req),
      z.uuid().parse(id),
      updateCustomerSchema.parse(body),
    );
  }
}
