import { Module } from "@nestjs/common";
import { Pool } from "pg";
import { readConfig, type WorkerConfig } from "./config";
import { getPool } from "./infra/db";
import { EMAIL_PORT } from "./email/email.port";
import { createEmailPort } from "./email/email.provider";
import { EmailRenderer } from "./email/email-renderer";
import { OutboxRepository } from "./outbox/outbox.repository";
import { OutboxDrainService } from "./outbox/outbox-drain.service";
import { PurgeRepository } from "./purge/purge.repository";
import { TaskPurgeService } from "./purge/task-purge.service";

export const WORKER_CONFIG = "WORKER_CONFIG";

// Wires the job's two passes (technical-design §5): the outbox drain (FEAT-007)
// and the soft-deleted task purge (FEAT-020). The worker is a standalone Cloud
// Run Job; main.ts resolves both services and runs each once per invocation.
@Module({
  providers: [
    { provide: WORKER_CONFIG, useFactory: () => readConfig() },
    { provide: Pool, useFactory: () => getPool() },
    {
      provide: EMAIL_PORT,
      useFactory: (c: WorkerConfig) => createEmailPort(c),
      inject: [WORKER_CONFIG],
    },
    {
      provide: EmailRenderer,
      useFactory: (c: WorkerConfig) => new EmailRenderer(c),
      inject: [WORKER_CONFIG],
    },
    {
      provide: OutboxRepository,
      useFactory: (p: Pool) => new OutboxRepository(p),
      inject: [Pool],
    },
    {
      provide: OutboxDrainService,
      useFactory: (repo, renderer, port, config) =>
        new OutboxDrainService(repo, renderer, port, config),
      inject: [OutboxRepository, EmailRenderer, EMAIL_PORT, WORKER_CONFIG],
    },
    {
      provide: PurgeRepository,
      useFactory: (p: Pool) => new PurgeRepository(p),
      inject: [Pool],
    },
    {
      provide: TaskPurgeService,
      useFactory: (repo: PurgeRepository, c: WorkerConfig) =>
        new TaskPurgeService(repo, c),
      inject: [PurgeRepository, WORKER_CONFIG],
    },
  ],
})
export class WorkerModule {}
