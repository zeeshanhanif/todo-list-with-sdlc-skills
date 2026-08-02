import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";
import { OutboxDrainService } from "./outbox/outbox-drain.service";
import { TaskPurgeService } from "./purge/task-purge.service";
import { getPool } from "./infra/db";
import { loadEnv } from "./infra/load-env";

/**
 * Run one pass, converting a failure into a returned error rather than a thrown
 * one, so the caller can run the other pass regardless (FEAT-020 D4). A broken
 * email provider must not be able to stop retention, and vice versa — putting
 * both in one job (ADR-007) is only safe if neither can starve the other.
 */
async function runPass(
  name: string,
  pass: () => Promise<unknown>,
): Promise<Error | null> {
  try {
    await pass();
    return null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    new Logger("Worker").error(
      JSON.stringify({ msg: `${name} pass failed`, error: error.message }),
    );
    return error;
  }
}

// Batch entrypoint (Cloud Run Job, ADR-007): build a standalone Nest context (no
// HTTP server), run both passes once — drain the email outbox (FEAT-007), then
// purge soft-deleted tasks past the retention window (FEAT-020, FR-TASK-015) —
// then exit. Cloud Scheduler triggers this ~every minute.
async function run(): Promise<void> {
  // Bring the repo's .env into process.env before anything reads config
  // (DEF-007): a Cloud Run Job and `npm run worker:run` both start with a CWD
  // that has no .env of its own.
  const envFile = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });

  let failures: (Error | null)[];
  try {
    // Drain first: it carries user-facing latency (a verification email waiting
    // to go out), where the purge is maintenance that can wait a minute.
    failures = [
      await runPass("outbox drain", () => app.get(OutboxDrainService).drain()),
      await runPass("task purge", () => app.get(TaskPurgeService).purge()),
    ];
  } finally {
    await app.close();
    await getPool().end(); // release the shared pg pool so the process exits
  }

  new Logger("Worker").log(
    JSON.stringify({
      msg: "worker run complete",
      envFile: envFile ?? "none (using defaults + process env)",
      failed: failures.filter((f) => f !== null).length,
    }),
  );

  // Both passes always attempt, but the exit code stays honest: Cloud Run's
  // maxRetries must see a real failure. Re-running a pass that already succeeded
  // is harmless — the drain finds nothing pending, the purge nothing expired.
  const failed = failures.find((f) => f !== null);
  if (failed) throw failed;
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({ msg: "worker run failed", error: String(err) }),
  );
  process.exit(1);
});
