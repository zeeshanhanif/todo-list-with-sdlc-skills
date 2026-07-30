import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';

/**
 * The caller's **effective** timezone — the one cross-module read of a profile
 * preference (FEAT-015 technical-design D1).
 *
 * **Why this exists here rather than as SQL in each module.** FEAT-008 stores
 * `users.timezone` (nullable, verbatim, with `UTC` as the computed fallback —
 * FEAT-008 D2), and `modules/search` may not import `modules/profile`
 * (dependency-cruiser). FEAT-010 D8 recorded that the **third** cross-module
 * read should stop copying SQL and mint an explicit interface; this is that
 * third case, and it is a different shape from the first two — a *preference*,
 * not an ownership check — which is what makes `common/` the right home. The
 * effective timezone is a cross-cutting concern applied to queries, exactly like
 * `common/authz`'s session; it is not an entity operation, which is what D8
 * correctly refused to put here.
 *
 * Deliberately minimal: **one read, no writes, no cache.** A future feature that
 * needs more makes that decision itself rather than inheriting it from here.
 * Writing preferences stays entirely with the `profile` module.
 */
@Injectable()
export class UserTimeZoneService {
  constructor(private readonly db: DbService) {}

  /**
   * The user's stored zone, or `'UTC'`.
   *
   * `UTC` is returned for all three of: a stored `NULL` (FEAT-008's "not yet
   * established"), and an id with no row. The last case matters — a search must
   * not `500` because a preference could not be found; the session guard has
   * already established who the caller is, and a missing row is that account
   * disappearing mid-request, which the endpoints above this handle on their own
   * terms.
   */
  async effectiveFor(userId: string): Promise<string> {
    const res = await this.db.query<{ timezone: string }>(
      `SELECT COALESCE(timezone, 'UTC') AS timezone FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.timezone ?? 'UTC';
  }
}
