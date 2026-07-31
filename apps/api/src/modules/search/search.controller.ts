import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type SearchResponse, type SessionUser } from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  NoSearchCriteriaError,
  SearchCriteriaInvalidError,
} from './search.errors';

// Search endpoint (FR-SRCH-*) — FEAT-015.
// Authenticated (FR-AUTHZ-001) and scoped to the session user: the corpus is
// always the caller's own tasks, and no id appears in the path, the query or a
// body, so there is no request shape that searches someone else's (FR-AUTHZ-002).
//
// **No ChangeSignalInterceptor**: that publishes the per-user `changed` signal
// after a write, and this controller has none. A read-only surface carries no
// interceptor.
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints.
@Controller('search')
@UseGuards(SessionGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // GET /search (FR-SRCH-001..006, 009; UC-013) — matches SEARCH_PATH.
  @Get()
  async find(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<SearchResponse> {
    try {
      return await this.search.search(user.id, query);
    } catch (err) {
      throw toHttp(err);
    }
  }
}

/** Map the module's domain errors onto the designed responses
 * (technical-design §3.1); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown): unknown {
  if (err instanceof SearchCriteriaInvalidError) {
    // The error carries its own field, so there is no mapping table here to
    // drift out of step with the one in search.criteria.ts.
    return validationFailed(err.field, err.requirement);
  }
  if (err instanceof NoSearchCriteriaError) {
    // The synthetic `_` field names the request itself rather than any one
    // parameter — the convention FEAT-008 established for its empty patch.
    // Spelled literally rather than imported from PROFILE_ERROR_CODES: the
    // convention is shared, but a search module reaching into a constant named
    // for the profile's empty patch would read as a dependency it does not have.
    return validationFailed('_', err.message);
  }
  return err;
}

function validationFailed(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'validation_failed',
    message: 'Validation failed.',
    fields: [{ field, message }],
  });
}
