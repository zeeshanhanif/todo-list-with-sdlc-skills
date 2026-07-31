import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";
import { OutboxDrainService } from "./outbox/outbox-drain.service";
import { getPool } from "./infra/db";
import { loadEnv } from "./infra/load-env";

// Batch entrypoint (Cloud Run Job, ADR-007): build a standalone Nest context (no
// HTTP server), drain the email outbox once, then exit. Cloud Scheduler triggers
// this ~every minute. (FEAT-020 will add the soft-delete purge alongside.)
async function run(): Promise<void> {
  // Bring the repo's .env into process.env before anything reads config
  // (DEF-007): a Cloud Run Job and `npm run worker:run` both start with a CWD
  // that has no .env of its own.
  const envFile = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    await app.get(OutboxDrainService).drain();
  } finally {
    await app.close();
    await getPool().end(); // release the shared pg pool so the process exits
  }
  new Logger("Worker").log(
    JSON.stringify({
      msg: "worker run complete",
      envFile: envFile ?? "none (using defaults + process env)",
    }),
  );
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({ msg: "worker run failed", error: String(err) }),
  );
  process.exit(1);
});
