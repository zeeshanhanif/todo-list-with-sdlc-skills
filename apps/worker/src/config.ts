export type EmailProvider = "log" | "smtp";

export interface WorkerConfig {
  databaseUrl: string;
  emailProvider: EmailProvider;
  smtpUrl: string | undefined;
  emailFrom: string;
  /** Base URL of the web app, used to build verification/reset links. */
  publicAppUrl: string;
  /** Dead-letter after this many attempts (technical-design §5). */
  emailMaxAttempts: number;
  emailBatchSize: number;
  backoffBaseSeconds: number;
  backoffCapSeconds: number;
}

/**
 * Worker configuration from the environment (NFR-MAINT-003). In cloud
 * environments these are Cloud Run Job env vars.
 *
 * **A pure read: it loads no file.** Bringing a local `.env` into `process.env`
 * is `loadEnv()`'s job, called once from `main.ts` (DEF-007) — the workspace-CWD
 * defect this app shared with the API.
 *
 * Called once, at boot, by `WorkerModule`'s `WORKER_CONFIG` factory — the shape
 * the API adopted in DEF-008. This app had it right first.
 */
export function readConfig(): WorkerConfig {
  const provider = process.env.EMAIL_PROVIDER === "smtp" ? "smtp" : "log";
  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo",
    emailProvider: provider,
    smtpUrl: process.env.SMTP_URL,
    emailFrom: process.env.EMAIL_FROM ?? "To-Do <no-reply@todo.local>",
    publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
    emailMaxAttempts: Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5),
    emailBatchSize: Number(process.env.EMAIL_BATCH_SIZE ?? 50),
    backoffBaseSeconds: Number(process.env.EMAIL_BACKOFF_BASE_SECONDS ?? 60),
    backoffCapSeconds: Number(process.env.EMAIL_BACKOFF_CAP_SECONDS ?? 3600),
  };
}
