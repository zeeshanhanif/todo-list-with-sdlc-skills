import { Injectable } from '@nestjs/common';
import {
  isTaskOverdue,
  type SearchResponse,
  type SearchResult,
} from '@todo/shared';
import { UserTimeZoneService } from '../../common/preferences/user-timezone.service';
import { SearchRepository, type SearchRow } from './search.repository';
import {
  encodeCursor,
  parseCriteria,
  type RawSearchQuery,
} from './search.criteria';

/**
 * Search & filters (FEAT-015 technical-design §5.1) — FR-SRCH-001..006, 009.
 *
 * Takes the **session** user's id; nothing here accepts a subject from the
 * request, so the corpus searched is always the caller's own (FR-AUTHZ-002).
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly zones: UserTimeZoneService,
  ) {}

  /**
   * One page of results (FR-SRCH-009).
   *
   * Two statements, in order: the caller's effective timezone (D1), then the
   * search. The zone is resolved even when no due filter is supplied — a
   * conditional read would save ~1 ms on some requests and add a branch that
   * only the due-filter tests would ever cover.
   */
  async search(userId: string, raw: RawSearchQuery): Promise<SearchResponse> {
    const criteria = parseCriteria(raw);
    const timeZone = await this.zones.effectiveFor(userId);
    const { rows, hasMore } = await this.repo.search(
      userId,
      criteria,
      timeZone,
    );

    const last = rows[rows.length - 1];
    return {
      results: rows.map(toResult),
      // Only when another page exists — a cursor on the last page would invite
      // a request that returns nothing and looks like a bug (D4).
      nextCursor:
        hasMore && last
          ? encodeCursor({ sortKey: last.sortKeyExact, id: last.id })
          : null,
    };
  }
}

/**
 * Row → wire (FR-SRCH-002).
 *
 * `isOverdue` comes from the **shared** derivation, which is FEAT-011 D3's
 * single definition — so a task's overdue state is the same fact here, in the
 * list view and in the detail panel, and FEAT-015 D5's promise that
 * `status=overdue` and `due=overdue` agree with the payload holds by
 * construction rather than by coincidence.
 */
function toResult(row: SearchRow): SearchResult {
  return {
    id: row.id,
    listId: row.listId,
    listName: row.listName,
    title: row.title,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    priority: row.priority,
    isOverdue: isTaskOverdue(row),
  };
}
