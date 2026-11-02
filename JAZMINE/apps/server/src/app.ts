import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  setupSchema,
  updateUserSchema,
  type SessionView,
  type UserView,
} from '../../../packages/contracts/src/identity';
import type { AppConfig } from './config';
import { Database } from './database';
import { ApiErrorFilter, AppError } from './errors';
import { sessionName, csrfName } from './identity/http/cookie-names';
import { AuthService } from './identity/application/auth-service';
import { UserService } from './identity/application/user-service';
import { permissionsFor } from './identity/domain/permissions';
import { SessionAccess } from './identity/http/session-access';
import { ActorAuthorization } from './identity/application/actor-authorization';
import { CustomerService } from './customer/application/customer-service';
import { CustomerController } from './customer/http/customer-controller';
import { CatalogController } from './catalog/catalog-controller';
import { CatalogService } from './catalog/catalog-service';
import { CatalogChoicesService } from './catalog/catalog-choices-service';
import { PricingController } from './pricing/pricing-controller';
import { PricingService } from './pricing/pricing-service';
import { DraftService } from './orders/draft-service';
import { DraftController } from './orders/draft-controller';
import { QuotationController } from './orders/quotation-controller';
import { QuotationService } from './orders/quotation-service';
import { AssetController } from './assets/asset-controller';
import { AssetService } from './assets/asset-service';
import { ConfirmationService } from './orders/confirmation-service';
import { ConfirmationController } from './orders/confirmation-controller';
import { OrderLifecycleController } from './orders/order-lifecycle-controller';
import { OrderLifecycleService } from './orders/order-lifecycle-service';
import { ArchiveAutomationService } from './orders/archive-automation-service';
import { ArchiveSettingsController } from './orders/archive-settings-controller';
import { ProductionService } from './production/production-service';
import { ProductionController } from './production/production-controller';
import { RevisionReviewController } from './production/revision-review-controller';
import { RevisionReviewService } from './production/revision-review-service';
import { RevisionReversalService } from './production/revision-reversal-service';
import { WorkController } from './production/work-controller';
import { WorkService } from './production/work-service';
import { ExceptionService } from './production/exception-service';
import { ExceptionController } from './production/exception-controller';
import { IssueCorrectionController } from './production/issue-correction-controller';
import { IssueCorrectionService } from './production/issue-correction-service';
import { SettlementController } from './settlements/settlement-controller';
import { SettlementService } from './settlements/settlement-service';
import { PaymentService } from './settlements/payment-service';
import { ShipmentService } from './settlements/shipment-service';
import {
  TrackingController,
  PublicTrackingController,
  TRACKING_SECURE,
  TRACKING_COOKIE,
} from './tracking/tracking-controller';
import { TrackingLinkService } from './tracking/link-service';
import { CustomerRequestService } from './tracking/request-service';
import { PublicTrackingService } from './tracking/public-service';
import { ReportService } from './reports/report-service';
import { ReportController } from './reports/report-controller';
import { SearchService } from './search/search-service';
import { SearchController } from './search/search-controller';
import { BackupService } from './backups/backup-service';
import { BackupController } from './backups/backup-controller';
import { MAX_BACKUP_BYTES } from '../../../packages/contracts/src/backups';
import { DocumentService } from './documents/document-service';
import { DocumentController } from './documents/document-controller';
import { PaymentQrService } from './payment-qr/payment-qr-service';
import { PaymentQrController } from './payment-qr/payment-qr-controller';

const CONFIG = Symbol('CONFIG');
function requestBucket(request: FastifyRequest) {
  if (request.method !== 'GET') return 'write';
  return /^\/api\/v1\/(?:catalog\/[^/]+\/image|graphic-assets\/[^/]+\/content|production\/files\/[^/]+\/content|production-work\/jobs\/[^/]+\/versions\/\d+\/(?:part|asset)\/[^/]+\/content)(?:\?|$)/.test(
    request.url,
  )
    ? 'media'
    : 'read';
}
function cookieOptions(config: AppConfig) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.production,
    maxAge: 8 * 60 * 60,
  };
}

@Controller('api/v1')
class IdentityController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UserService) private readonly users: UserService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(Database) private readonly db: Database,
    @Inject(SessionAccess) private readonly access: SessionAccess,
  ) {}
  private async current(req: FastifyRequest, allowForced = false): Promise<UserView> {
    return this.access.current(req, allowForced);
  }
  @Get('health') async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', database: 'ready', version: '0.2.0' };
  }
  @Get('auth/session') async session(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionView> {
    const user = await this.auth.authenticate(req.cookies[sessionName(this.config)]);
    const csrfToken = req.cookies[csrfName(this.config)] || randomBytes(32).toString('base64url');
    reply.setCookie(csrfName(this.config), csrfToken, cookieOptions(this.config));
    return {
      user,
      permissions: user ? permissionsFor(user) : [],
      csrfToken,
      bootstrapRequired: await this.auth.bootstrapRequired(),
      recoveryMode: !!this.config.recoveryMode,
    };
  }
  @Post('auth/setup') async setup(@Body() body: unknown) {
    await this.auth.bootstrap(setupSchema.parse(body));
    return { ok: true };
  }
  @Post('auth/login') async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = loginSchema.parse(body);
    const result = await this.auth.login(input.username, input.password, req.ip);
    reply.setCookie(sessionName(this.config), result.token, cookieOptions(this.config));
    return { user: result.user };
  }
  @Post('auth/logout') async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(req.cookies[sessionName(this.config)]);
    reply.clearCookie(sessionName(this.config), { path: '/' });
    return { ok: true };
  }
  @Post('auth/change-password') async changePassword(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.current(req, true);
    await this.auth.changePassword(user, changePasswordSchema.parse(body));
    reply.clearCookie(sessionName(this.config), { path: '/' });
    return { ok: true };
  }
  @Get('users') async list(@Req() req: FastifyRequest) {
    return { users: await this.users.list(await this.current(req)) };
  }
  @Post('users') async create(@Req() req: FastifyRequest, @Body() body: unknown) {
    return { user: await this.users.create(await this.current(req), createUserSchema.parse(body)) };
  }
  @Patch('users/:id') async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return {
      user: await this.users.update(
        await this.current(req),
        z.uuid().parse(id),
        updateUserSchema.parse(body),
      ),
    };
  }
  @Post('users/:id/reset-password') async reset(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.users.resetPassword(
      await this.current(req),
      z.uuid().parse(id),
      resetPasswordSchema.parse(body),
    );
    return { ok: true };
  }
}

@Module({})
class AppModule {}
export async function createApplication(
  config: AppConfig,
  db: Database,
  logging = true,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: logging
      ? {
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-tracking-token"]',
            'req.body.token',
            'req.body.phone',
            'req.body.password',
            'req.headers["x-backup-password"]',
            'req.headers.x-csrf-token',
            'res.headers["set-cookie"]',
          ],
        }
      : false,
    bodyLimit: 3 * 1024 * 1024,
    trustProxy: false,
  });
  const auth = new AuthService(db, !config.production);
  const access = new SessionAccess(auth, config);
  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      controllers: [
        IdentityController,
        DocumentController,
        PaymentQrController,
        CustomerController,
        CatalogController,
        PricingController,
        DraftController,
        QuotationController,
        AssetController,
        ConfirmationController,
        OrderLifecycleController,
        ArchiveSettingsController,
        ProductionController,
        RevisionReviewController,
        WorkController,
        ExceptionController,
        IssueCorrectionController,
        SettlementController,
        TrackingController,
        PublicTrackingController,
        ReportController,
        SearchController,
        BackupController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DocumentService, useValue: new DocumentService(db) },
        { provide: PaymentQrService, useValue: new PaymentQrService(db) },
        { provide: Database, useValue: db },
        { provide: CatalogService, useValue: new CatalogService(db) },
        { provide: CatalogChoicesService, useValue: new CatalogChoicesService(db) },
        { provide: PricingService, useValue: new PricingService(db) },
        { provide: QuotationService, useValue: new QuotationService(db) },
        { provide: AssetService, useValue: new AssetService(db) },
        { provide: ConfirmationService, useValue: new ConfirmationService(db) },
        { provide: OrderLifecycleService, useValue: new OrderLifecycleService(db) },
        { provide: ArchiveAutomationService, useValue: new ArchiveAutomationService(db) },
        { provide: ProductionService, useValue: new ProductionService(db) },
        { provide: RevisionReviewService, useValue: new RevisionReviewService(db) },
        { provide: RevisionReversalService, useValue: new RevisionReversalService(db) },
        { provide: WorkService, useValue: new WorkService(db) },
        { provide: ExceptionService, useValue: new ExceptionService(db) },
        { provide: IssueCorrectionService, useValue: new IssueCorrectionService(db) },
        { provide: SettlementService, useValue: new SettlementService(db) },
        { provide: PaymentService, useValue: new PaymentService(db) },
        { provide: ShipmentService, useValue: new ShipmentService(db) },
        { provide: TRACKING_SECURE, useValue: config.production },
        {
          provide: TRACKING_COOKIE,
          useValue: `${config.production ? '__Secure-' : ''}${config.recoveryMode ? 'jazmine_recovery' : 'jazmine'}_tracking`,
        },
        { provide: TrackingLinkService, useValue: new TrackingLinkService(db) },
        { provide: CustomerRequestService, useValue: new CustomerRequestService(db) },
        { provide: PublicTrackingService, useValue: new PublicTrackingService(db) },
        { provide: ReportService, useValue: new ReportService(db) },
        { provide: SearchService, useValue: new SearchService(db) },
        { provide: BackupService, useValue: new BackupService(db, config) },
        { provide: DraftService, useValue: new DraftService(db, new PricingService(db)) },
        { provide: AuthService, useValue: auth },
        { provide: UserService, useValue: new UserService(db, auth) },
        { provide: SessionAccess, useValue: access },
        { provide: CustomerService, useValue: new CustomerService(db, new ActorAuthorization()) },
      ],
    },
    adapter,
    { logger: false },
  );
  await app.register(cookie);
  adapter
    .getInstance()
    .addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_BACKUP_BYTES },
      (_req, body, done) => done(null, body),
    );
  adapter.getInstance().addHook('onRoute', (route) => {
    if (route.url === '/api/v1/backups/restore') route.bodyLimit = MAX_BACKUP_BYTES;
  });
  await app.register(helmet, {
    contentSecurityPolicy: config.production
      ? { directives: { imgSrc: ["'self'", 'data:', 'blob:'] } }
      : false,
  });
  await app.register(rateLimit, {
    // Image grids issue one authenticated read per image. Keep writes more restrictive.
    max: (request: FastifyRequest) =>
      requestBucket(request) === 'media' ? 1200 : requestBucket(request) === 'read' ? 600 : 120,
    keyGenerator: (request: FastifyRequest) => `${request.ip}:${requestBucket(request)}`,
    timeWindow: '1 minute',
  });
  adapter.getInstance().addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (req.url.startsWith('/api/v1/backups/')) {
      try {
        const actor = await access.current(req);
        await new ActorAuthorization().require(db, actor, 'backups.manage');
      } catch (e) {
        if (e instanceof AppError) return reply.status(e.getStatus()).send(e.getResponse());
        throw e;
      }
    }
    if (req.url.startsWith('/api/v1/public-tracking'))
      reply.header('Referrer-Policy', 'no-referrer');
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return;
    const sent = req.headers['x-csrf-token'];
    const expected = req.cookies[csrfName(config)];
    const origins = new Set([config.origin]);
    const localOrigin = new URL(config.origin);
    if (!config.production && ['localhost', '127.0.0.1'].includes(localOrigin.hostname)) {
      localOrigin.hostname = localOrigin.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      origins.add(localOrigin.origin);
    }
    if (
      !origins.has(req.headers.origin ?? '') ||
      typeof sent !== 'string' ||
      !expected ||
      Buffer.byteLength(sent) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
    ) {
      reply
        .status(403)
        .send({ code: 'CSRF_REJECTED', message: 'กรุณาเปิดหน้าจอใหม่แล้วลองอีกครั้ง' });
    }
  });
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();
  await adapter.getInstance().ready();
  return app;
}
