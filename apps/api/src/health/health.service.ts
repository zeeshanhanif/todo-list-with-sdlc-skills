import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@todo/shared';
import { DbService } from '../infra/db.service';

/**
 * Skeleton domain stub: proves the API can round-trip Postgres (write + read).
 * This is NOT a feature — real health/readiness depth and all domain logic are
 * added per-slice. It writes one ping row and reads the total back.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly db: DbService) {}

  async check(): Promise<HealthResponse> {
    const base = {
      time: new Date().toISOString(),
      service: 'api',
    };
    try {
      const inserted = await this.db.query<{ id: number }>(
        'INSERT INTO skeleton_ping DEFAULT VALUES RETURNING id',
      );
      const counted = await this.db.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM skeleton_ping',
      );
      return {
        ...base,
        status: 'ok',
        db: 'up',
        pingId: inserted.rows[0]?.id ?? null,
        pingCount: Number(counted.rows[0]?.count ?? 0),
      };
    } catch (err) {
      this.logger.error(
        JSON.stringify({ msg: 'health db check failed', error: String(err) }),
      );
      return {
        ...base,
        status: 'degraded',
        db: 'down',
        pingId: null,
        pingCount: null,
      };
    }
  }
}
