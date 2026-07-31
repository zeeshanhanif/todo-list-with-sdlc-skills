import { Injectable } from '@nestjs/common';
import {
  SMART_VIEWS,
  type SmartView,
  type SmartViewResponse,
} from '@todo/shared';
import { UserTimeZoneService } from '../../common/preferences/user-timezone.service';
import { SearchRepository } from './search.repository';
import { toResult } from './search.service';
import {
  decodeCursor,
  encodeCursor,
  parseLimit,
  type SearchCriteria,
} from './search.criteria';
import { SmartViewNotFoundError } from './views.errors';

/** The raw shape the controller hands over (query strings, so mostly text). */
export interface RawViewQuery {
  limit?: number;
  cursor?: string;
}

/**
 * Smart views (FEAT-016 technical-design §5.1) — FR-SRCH-007, FR-SRCH-008.
 *
 * **A view is the search query with fixed criteria** (D1). Nothing here builds
 * SQL: the predicates all live in `SearchRepository`, already tested by
 * FEAT-015, and reimplementing them would spell the overdue rule a fourth time
 * — which is exactly how FEAT-011 D3's single definition would stop being
 * single.
 *
 * Takes the **session** user's id; nothing accepts a subject from the request,
 * so the corpus is always the caller's own (FR-AUTHZ-002).
 */
@Injectable()
export class ViewsService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly zones: UserTimeZoneService,
  ) {}

  /**
   * One page of a view (FR-SRCH-009).
   *
   * Two statements, in order: the caller's effective timezone (FEAT-015 D1),
   * then the view. The zone is resolved even for `overdue` and `all`, which do
   * not use it — a conditional read would save ~1 ms on two of four views and
   * add a branch only their tests would cover.
   */
  async view(
    userId: string,
    view: string,
    raw: RawViewQuery,
  ): Promise<SmartViewResponse> {
    const resolved = parseView(view);
    const criteria = criteriaFor(resolved, raw);
    const timeZone = await this.zones.effectiveFor(userId);
    const { rows, hasMore } = await this.repo.search(
      userId,
      criteria,
      timeZone,
    );

    const last = rows[rows.length - 1];
    return {
      // Echoed rather than reflected from the URL: a client that fired two view
      // requests must not render the slower one's answer under the other's
      // heading (technical-design §3.1).
      view: resolved,
      results: rows.map(toResult),
      nextCursor:
        hasMore && last
          ? encodeCursor({ sortKey: last.sortKeyExact, id: last.id })
          : null,
    };
  }
}

/** The path segment is a resource name, so an unknown one is a 404 (D6). */
function parseView(view: string): SmartView {
  if (!(SMART_VIEWS as readonly string[]).includes(view)) {
    throw new SmartViewNotFoundError();
  }
  return view as SmartView;
}

/**
 * The view → criteria mapping (technical-design §5.2), and the whole of this
 * feature's domain logic.
 *
 * `status: 'active'` is what FR-SRCH-008's "completed and soft-deleted tasks
 * are excluded" compiles to — the `deleted_at IS NULL` half is unconditional in
 * the repository and reachable by no parameter.
 *
 * The three due views sort by due date because that is the question they ask;
 * `all` cannot, because it is the one view whose members may have no due date,
 * so it keeps search's newest-first order (D2). `limit` and `cursor` go through
 * FEAT-015's own rules rather than a second copy of them.
 */
function criteriaFor(view: SmartView, raw: RawViewQuery): SearchCriteria {
  const base = {
    term: null,
    status: 'active' as const,
    limit: parseLimit(raw.limit),
    cursor: decodeCursor(raw.cursor),
  };

  switch (view) {
    case 'today':
      return { ...base, due: 'today', sort: 'due' };
    case 'upcoming':
      return { ...base, due: 'upcoming', sort: 'due' };
    case 'overdue':
      return { ...base, due: 'overdue', sort: 'due' };
    case 'all':
      return { ...base, due: null, sort: 'newest' };
  }
}
