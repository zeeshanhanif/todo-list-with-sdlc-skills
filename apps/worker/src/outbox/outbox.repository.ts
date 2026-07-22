import type { Pool } from "pg";
import type { OutboxRow } from "./outbox.types";

export interface ClaimParams {
  limit: number;
  backoffBaseSeconds: number;
  backoffCapSeconds: number;
}

/**
 * Data access for the outbox drain (technical-design §5, D2). Raw pg (the worker
 * does not use the API's DbService).
 */
export class OutboxRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Atomically claim a batch of due rows: pre-increment attempts and schedule the
   * next retry (exponential backoff, capped) in a single statement, using
   * FOR UPDATE SKIP LOCKED so overlapping job runs never double-claim. The SET
   * expressions read the OLD `attempts`, so backoff uses the pre-increment count.
   */
  async claimDue(params: ClaimParams): Promise<OutboxRow[]> {
    const res = await this.pool.query<OutboxRow>(
      `UPDATE email_outbox
         SET attempts = attempts + 1,
             next_attempt_at = now() + make_interval(secs =>
               LEAST($2::double precision * power(2::double precision, attempts), $3::double precision))
       WHERE id IN (
         SELECT id FROM email_outbox
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, type, recipient, payload, attempts`,
      [params.limit, params.backoffBaseSeconds, params.backoffCapSeconds],
    );
    return res.rows;
  }

  async markSent(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`,
      [id],
    );
  }

  /** Dead-letter: no more retries. */
  async markFailed(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_outbox SET status = 'failed', last_error = $2 WHERE id = $1`,
      [id, error],
    );
  }

  /** Keep pending for the next attempt (next_attempt_at already set by claimDue). */
  async recordRetry(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_outbox SET last_error = $2 WHERE id = $1`,
      [id, error],
    );
  }
}
