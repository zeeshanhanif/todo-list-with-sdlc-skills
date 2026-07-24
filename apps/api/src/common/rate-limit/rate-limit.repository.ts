import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';

/**
 * DB-backed per-IP fixed-window counter (FEAT-003 §4.4; FR-AUTH-018). Backs the
 * RateLimitGuard so the limit holds across Cloud Run's many instances (an
 * in-memory counter cannot — architecture §8). One upsert-increment per request.
 */
@Injectable()
export class RateLimitRepository {
  constructor(private readonly db: DbService) {}

  /** Increment the (ip, route, window) bucket and return the new count. */
  async hitAndCount(
    ip: string,
    route: string,
    windowStart: Date,
  ): Promise<number> {
    const res = await this.db.query<{ count: number }>(
      `INSERT INTO auth_rate_buckets (ip, route, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (ip, route, window_start)
       DO UPDATE SET count = auth_rate_buckets.count + 1
       RETURNING count`,
      [ip, route, windowStart],
    );
    return res.rows[0].count;
  }
}
