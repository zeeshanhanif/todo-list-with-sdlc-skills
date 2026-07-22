import { Logger } from "@nestjs/common";
import type { WorkerConfig } from "../config";
import type { EmailPort } from "../email/email.port";
import { EmailRenderer } from "../email/email-renderer";
import { OutboxRepository } from "./outbox.repository";

export interface DrainResult {
  sent: number;
  retried: number;
  deadLettered: number;
}

/**
 * The outbox drain (technical-design §5; ADR-007, SW-002). Claims due rows in
 * batches, renders + sends each via the EmailPort, then marks sent — or, on
 * failure, dead-letters once attempts reach the max, else leaves it pending for
 * the backoff already scheduled by claimDue. At-least-once (D2).
 */
export class OutboxDrainService {
  private readonly logger = new Logger("OutboxDrain");
  private static readonly MAX_ITERATIONS = 1000; // safety cap on batch loops

  constructor(
    private readonly repo: OutboxRepository,
    private readonly renderer: EmailRenderer,
    private readonly emailPort: EmailPort,
    private readonly config: WorkerConfig,
  ) {}

  async drain(): Promise<DrainResult> {
    const result: DrainResult = { sent: 0, retried: 0, deadLettered: 0 };

    for (let i = 0; i < OutboxDrainService.MAX_ITERATIONS; i++) {
      const rows = await this.repo.claimDue({
        limit: this.config.emailBatchSize,
        backoffBaseSeconds: this.config.backoffBaseSeconds,
        backoffCapSeconds: this.config.backoffCapSeconds,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        try {
          await this.emailPort.send(this.renderer.render(row));
          await this.repo.markSent(row.id);
          result.sent++;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          if (row.attempts >= this.config.emailMaxAttempts) {
            await this.repo.markFailed(row.id, error);
            result.deadLettered++;
            this.logger.error(
              JSON.stringify({
                msg: "email dead-lettered",
                id: row.id,
                type: row.type,
                attempts: row.attempts,
                error,
              }),
            );
          } else {
            await this.repo.recordRetry(row.id, error);
            result.retried++;
          }
        }
      }
    }

    this.logger.log(JSON.stringify({ msg: "outbox drain complete", ...result }));
    return result;
  }
}
