import { Injectable, Logger } from '@nestjs/common';
import type { SkeletonPingResponse } from '@todo/shared';
import { DbService } from '../infra/db.service';

/**
 * SCAFFOLDING — not a product feature. Proves the API can round-trip Postgres
 * (write + read) end-to-end and exercises migration 001's `skeleton_ping` table.
 * Delete this module (and the table) once the first real domain slice lands;
 * the health endpoint (liveness) stays.
 */
@Injectable()
export class SkeletonService {
  private readonly logger = new Logger(SkeletonService.name);

  constructor(private readonly db: DbService) {}

  async ping(): Promise<SkeletonPingResponse> {
    const base = { time: new Date().toISOString(), service: 'api' };
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
        JSON.stringify({
          msg: 'skeleton ping db round-trip failed',
          error: String(err),
        }),
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
