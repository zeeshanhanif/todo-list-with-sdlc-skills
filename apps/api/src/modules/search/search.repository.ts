import { Injectable } from '@nestjs/common';
import type { TaskPriority } from '@todo/shared';
import { DbService } from '../../infra/db.service';
import type { SearchCriteria } from './search.criteria';

/** A search hit as this module reads it. Mapped to the wire `SearchResult` by
 * the service, which owns the ISO-8601 formatting and the `isOverdue`
 * derivation — reusing FEAT-011's single definition, never adding a second. */
export interface SearchRow {
  id: string;
  listId: string;
  listName: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
  dueAt: Date | null;
  priority: TaskPriority;
}

interface RawRow {
  id: string;
  list_id: string;
  list_name: string;
  title: string;
  completed_at: Date | null;
  created_at: Date;
  due_at: Date | null;
  priority: TaskPriority;
}

/**
 * Persistence for search (FEAT-015 technical-design §5.1/§5.2).
 *
 * **One statement, assembled from only the criteria supplied.** Ownership is
 * enforced here the way every data module since FEAT-009 D3 enforces it: the
 * `WHERE owner_id = $1` is not optional and not conditional, so no combination
 * of parameters can widen the corpus past the caller's own tasks
 * (FR-AUTHZ-002/003).
 *
 * Reading the `lists` table is not a boundary violation — the rule forbids
 * `modules/search` *importing* `modules/lists`, and `modules/tasks` already
 * reads it the same way (FEAT-010 D8). The user's *timezone*, by contrast, now
 * comes through `common/preferences` rather than a fourth copy of that SQL,
 * which is the interface D8 asked the third case to mint (FEAT-015 D1).
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly db: DbService) {}

  /**
   * One page of matches, plus whether another page exists.
   *
   * `LIMIT n + 1` is how "is there more?" is answered without a second count
   * query: if the extra row comes back, there is a next page and the extra row
   * is dropped from the response.
   */
  async search(
    ownerId: string,
    criteria: SearchCriteria,
    timeZone: string,
  ): Promise<{ rows: SearchRow[]; hasMore: boolean }> {
    const where: string[] = [
      't.owner_id = $1',
      // Always, for every parameter combination (FR-TASK-013, FR-SRCH-002's
      // note). Soft-deleted tasks are not reachable by any query shape.
      't.deleted_at IS NULL',
    ];
    const params: unknown[] = [ownerId];

    if (criteria.term !== null) {
      // FR-SRCH-001: case-insensitive substring. The term arrives already
      // escaped for LIKE metacharacters (D8); ESCAPE names the escape character
      // explicitly so the behaviour does not depend on the server's default.
      params.push(criteria.term);
      where.push(`t.title ILIKE '%' || $${params.length} || '%' ESCAPE '\\'`);
    }

    if (criteria.status !== null) {
      where.push(statusPredicate(criteria.status));
    }

    if (criteria.due !== null) {
      // The zone is bound ONLY for the buckets that reference it. `overdue` and
      // `none` are zone-free (D5), and binding a parameter no clause mentions
      // makes Postgres reject the statement outright — it cannot infer a type
      // for an unused placeholder.
      if (criteria.due === 'today' || criteria.due === 'upcoming') {
        params.push(timeZone);
        where.push(duePredicate(criteria.due, `$${params.length}`));
      } else {
        where.push(duePredicate(criteria.due, ''));
      }
    }

    if (criteria.cursor !== null) {
      // Keyset: strictly past the last row of the previous page, in the same
      // total order the ORDER BY imposes (D4). The row comparison is what makes
      // ties on created_at resolve by id rather than by luck.
      params.push(criteria.cursor.createdAt, criteria.cursor.id);
      where.push(
        `(t.created_at, t.id) < ($${params.length - 1}, $${params.length})`,
      );
    }

    params.push(criteria.limit + 1);

    const res = await this.db.query<RawRow>(
      `SELECT t.id, t.list_id, l.name AS list_name, t.title,
              t.completed_at, t.created_at, t.due_at, t.priority
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
        WHERE ${where.join('\n          AND ')}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $${params.length}`,
      params,
    );

    const hasMore = res.rows.length > criteria.limit;
    const rows = (hasMore ? res.rows.slice(0, criteria.limit) : res.rows).map(
      toRow,
    );
    return { rows, hasMore };
  }
}

/** FR-SRCH-003. `overdue` is **the same predicate** the due-bucket below uses —
 * one definition of overdue in this system (FEAT-011 D3, FEAT-015 D5). */
function statusPredicate(status: 'active' | 'completed' | 'overdue'): string {
  switch (status) {
    case 'active':
      return 't.completed_at IS NULL';
    case 'completed':
      return 't.completed_at IS NOT NULL';
    case 'overdue':
      return OVERDUE;
  }
}

/**
 * FR-SRCH-004, in the caller's timezone (technical-design §5.2).
 *
 * `today` and `upcoming` are **calendar-day** questions, so they are computed
 * against the zone: `AT TIME ZONE` converts the stored instant to that zone's
 * wall clock, and `::date` takes the day from it. `overdue` is an **instant**
 * question and therefore takes no zone at all — the asymmetry is the design's
 * (D5), not an oversight, and it is why the two shapes sit together here.
 */
function duePredicate(
  due: 'today' | 'upcoming' | 'overdue' | 'none',
  tz: string,
): string {
  switch (due) {
    case 'today':
      return `t.due_at IS NOT NULL
          AND (t.due_at AT TIME ZONE ${tz})::date = (now() AT TIME ZONE ${tz})::date`;
    case 'upcoming':
      return `t.due_at IS NOT NULL
          AND (t.due_at AT TIME ZONE ${tz})::date > (now() AT TIME ZONE ${tz})::date`;
    case 'overdue':
      return OVERDUE;
    case 'none':
      return 't.due_at IS NULL';
  }
}

/** The single overdue rule, spelled once: active, has a due date, and that
 * instant has passed (FR-TASK-007; FEAT-011 D3). Zone-invariant by nature. */
const OVERDUE =
  '(t.completed_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < now())';

function toRow(row: RawRow): SearchRow {
  return {
    id: row.id,
    listId: row.list_id,
    listName: row.list_name,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    dueAt: row.due_at,
    priority: row.priority,
  };
}
