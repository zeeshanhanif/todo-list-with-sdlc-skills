import { Module } from "@nestjs/common";
import { Pool } from "pg";
import { loadConfig, type WorkerConfig } from "./config";
import { getPool } from "./infra/db";
import { EMAIL_PORT } from "./email/email.port";
import { createEmailPort } from "./email/email.provider";
import { EmailRenderer } from "./email/email-renderer";
import { OutboxRepository } from "./outbox/outbox.repository";
import { OutboxDrainService } from "./outbox/outbox-drain.service";

export const WORKER_CONFIG = "WORKER_CONFIG";

// Wires the outbox drain pipeline (technical-design §5). The worker is a
// standalone Cloud Run Job; main.ts resolves OutboxDrainService and runs it once.
@Module({
  providers: [
    { provide: WORKER_CONFIG, useFactory: () => loadConfig() },
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
  ],
})
export class WorkerModule {}
