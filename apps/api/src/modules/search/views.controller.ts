import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SMART_VIEW_ERROR_CODES,
  type SessionUser,
  type SmartViewResponse,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { ViewsService } from './views.service';
import { SmartViewQueryDto } from './dto/smart-view-query.dto';
import { SearchCriteriaInvalidError } from './search.errors';
import { SmartViewNotFoundError } from './views.errors';

// Smart-view endpoint (FR-SRCH-007, FR-SRCH-008) — FEAT-016.
// Authenticated (FR-AUTHZ-001) and scoped to the session user: the corpus is
// always the caller's own tasks, and the only path parameter is a view NAME
// from a closed set, so there is no request shape that reads someone else's
// (FR-AUTHZ-002).
//
// It lives in the `search` module beside SearchController because a view is the
// same query with fixed criteria (technical-design D1) — not because views are
// a kind of search from the user's point of view.
//
// **No ChangeSignalInterceptor**: that publishes the per-user `changed` signal
// after a write, and this controller has none.
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints.
@Controller('views')
@UseGuards(SessionGuard)
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  // GET /views/{today|upcoming|overdue|all} (FR-SRCH-007/008/006/009; UC-014)
  // — matches smartViewPath().
  @Get(':view')
  async find(
    @Param('view') view: string,
    @Query() query: SmartViewQueryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<SmartViewResponse> {
    try {
      return await this.views.view(user.id, view, query);
    } catch (err) {
      throw toHttp(err);
    }
  }
}

/** Map the module's domain errors onto the designed responses
 * (technical-design §3.1); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown): unknown {
  if (err instanceof SmartViewNotFoundError) {
    // 404, not 400: the segment names a resource, not a filter value (D6).
    return new NotFoundException({
      code: SMART_VIEW_ERROR_CODES.viewNotFound,
      message: err.message,
    });
  }
  if (err instanceof SearchCriteriaInvalidError) {
    // `limit` and `cursor` are validated by search's own rules, so they fail
    // with search's own error — one set of messages for one set of rules.
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field: err.field, message: err.requirement }],
    });
  }
  return err;
}
