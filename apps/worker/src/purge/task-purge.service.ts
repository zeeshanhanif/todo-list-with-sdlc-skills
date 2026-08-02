import { Logger } from "@nestjs/common";
import type { WorkerConfig } from "../config";
import { PurgeRepository } from "./purge.repository";

export interface PurgeResult {
  purged: number;
}

/**
 * The soft-deleted task purge (technical-design §5; FR-TASK-015, UC-012 alt-3a;
 * ADR-007). Deletes expired rows in batches until none are left, then reports
 * how many went. The second of the job's two passes — see main.ts.
 */
export class TaskPurgeService {
  private readonly logger = new Logger("TaskPurge");
  private static readonly MAX_ITERATIONS = 1000; // safety cap on batch loops

  constructor(
    private readonly repo: PurgeRepository,
    private readonly config: WorkerConfig,
  ) {}

  async purge(): Promise<PurgeResult> {
    let purged = 0;

    for (let i = 0; i < TaskPurgeService.MAX_ITERATIONS; i++) {
      const deleted = await this.repo.purgeExpired({
        retentionDays: this.config.taskRetentionDays,
        limit: this.config.purgeBatchSize,
      });
      if (deleted === 0) break;
      purged += deleted;
    }

    this.logger.log(JSON.stringify({ msg: "task purge complete", purged }));
    return { purged };
  }
}
