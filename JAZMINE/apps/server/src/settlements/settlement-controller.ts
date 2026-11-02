import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  receiptSchema,
  refundSchema,
  settlementActionSchema,
  shipmentPrepareSchema,
  shipmentConfirmSchema,
  shipmentMetadataSchema,
} from '../../../../packages/contracts/src/settlement';
import { SessionAccess } from '../identity/http/session-access';
import { SettlementService } from './settlement-service';
import { PaymentService } from './payment-service';
import { ShipmentService } from './shipment-service';
@Controller('api/v1/settlements')
export class SettlementController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(SettlementService) private settlements: SettlementService,
    @Inject(PaymentService) private payments: PaymentService,
    @Inject(ShipmentService) private shipments: ShipmentService,
  ) {}
  @Get('orders') async list(@Req() req: FastifyRequest, @Query() query: unknown) {
    const q = z
      .object({
        search: z.string().trim().max(100).default(''),
        includeArchived: z.enum(['true', 'false']).default('false'),
      })
      .strict()
      .parse(query);
    return this.settlements.list(
      await this.access.current(req),
      q.search,
      q.includeArchived === 'true',
    );
  }
  @Get('orders/:id') async detail(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.settlements.detail(await this.access.current(req), z.uuid().parse(id));
  }
  @Post('orders/:id/receipts') async receipt(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.payments.receipt(
      await this.access.current(req),
      z.uuid().parse(id),
      receiptSchema.parse(body),
    );
  }
  @Post('orders/:id/refunds') async refund(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.payments.refund(
      await this.access.current(req),
      z.uuid().parse(id),
      refundSchema.parse(body),
    );
  }
  @Post('orders/:id/entries/:entryId/void') async void(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() body: unknown,
  ) {
    return this.payments.void(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(entryId),
      settlementActionSchema.parse(body),
    );
  }
  @Post('orders/:id/shipments') async prepare(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shipments.prepare(
      await this.access.current(req),
      z.uuid().parse(id),
      shipmentPrepareSchema.parse(body),
    );
  }
  @Post('orders/:id/shipments/:shipmentId/confirm') async confirm(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
  ) {
    return this.shipments.confirm(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(shipmentId),
      shipmentConfirmSchema.parse(body),
    );
  }
  @Post('orders/:id/shipments/:shipmentId/cancel') async cancel(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
  ) {
    return this.shipments.cancel(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(shipmentId),
      settlementActionSchema.parse(body),
    );
  }
  @Post('orders/:id/shipments/:shipmentId/details') async metadata(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
  ) {
    return this.shipments.metadata(
      await this.access.current(req),
      z.uuid().parse(id),
      z.uuid().parse(shipmentId),
      shipmentMetadataSchema.parse(body),
    );
  }
}
