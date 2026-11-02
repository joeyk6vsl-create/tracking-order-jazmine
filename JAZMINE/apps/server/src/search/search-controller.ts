import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { searchQuerySchema } from '../../../../packages/contracts/src/search';
import { SessionAccess } from '../identity/http/session-access';
import { SearchService } from './search-service';
@Controller('api/v1/search')
export class SearchController {
  constructor(
    @Inject(SessionAccess) private access: SessionAccess,
    @Inject(SearchService) private search: SearchService,
  ) {}
  @Get() async read(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.search.read(await this.access.current(req), searchQuerySchema.parse(query));
  }
}
