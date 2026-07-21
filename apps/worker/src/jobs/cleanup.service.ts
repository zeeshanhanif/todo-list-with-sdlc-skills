import { Injectable, Logger } from "@nestjs/common";
import { getPool } from "../infra/db";

export interface CleanupResult {
  outboxDrained: number;
  tasksPurged: number;
}

/**
 * Skeleton stub for the scheduled Cloud Run Job (ADR-007). It proves the async
 * path exists — reaches Postgres through the job entrypoint and exits — but does
 * no real work. Real jobs replace this:
 *   - outbox drain + email send  -> FEAT-007
 *   - soft-deleted task purge     -> FEAT-020
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  async runOnce(): Promise<CleanupResult> {
    const pool = getPool();
    await pool.query("SELECT 1"); // prove DB reachable via the job path
    const result: CleanupResult = { outboxDrained: 0, tasksPurged: 0 };
    this.logger.log(JSON.stringify({ msg: "cleanup tick", ...result }));
    await pool.end();
    return result;
  }
}
