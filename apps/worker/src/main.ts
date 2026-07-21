import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";
import { CleanupService } from "./jobs/cleanup.service";

// Batch entrypoint (Cloud Run Job, ADR-007): build a standalone Nest context
// (no HTTP server), run one cleanup tick, then exit. Cloud Scheduler triggers
// this on a schedule (~every minute) in cloud environments.
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    await app.get(CleanupService).runOnce();
  } finally {
    await app.close();
  }
  new Logger("Worker").log(JSON.stringify({ msg: "worker run complete" }));
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ msg: "worker run failed", error: String(err) }));
  process.exit(1);
});
