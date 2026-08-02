import type { Pool } from "pg";

export interface PurgeParams {
  retentionDays: number;
  limit: number;
}

/**
 * Data access for the soft-deleted task purge (technical-design §5, D2/D3;
 * FR-TASK-015). Raw pg (the worker does not use the API's DbService).
 */
export class PurgeRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Hard-delete one batch of tasks whose retention clock has run out, returning
   * how many rows went. Three properties here are load-bearing:
   *
   * - `deleted_at IS NOT NULL` — an active or completed task is never touched,
   *   however old it is. Age alone does not purge; only the retention clock
   *   FEAT-013 starts does.
   * - strict `<` against a `now()`-relative cutoff — the row purges the instant
   *   it passes the window, and the window is read per call rather than baked in.
   * - `FOR UPDATE SKIP LOCKED` — Cloud Scheduler can overlap runs when one is
   *   slow, so a second pass partitions the remaining batches instead of blocking
   *   behind the first (the convention OutboxRepository.claimDue established).
   *
   * Oldest-first matches `tasks_purge_due_idx`'s order, so successive batches are
   * sequential index ranges rather than repeated re-scans.
   */
  async purgeExpired(params: PurgeParams): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM tasks
        WHERE id IN (
          SELECT id FROM tasks
           WHERE deleted_at IS NOT NULL
             AND deleted_at < now() - make_interval(days => $1)
           ORDER BY deleted_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )`,
      [params.retentionDays, params.limit],
    );
    return res.rowCount ?? 0;
  }
}
