import { config as loadDotenv } from "dotenv";

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
 * Worker configuration from the environment (NFR-MAINT-003). Reads a local .env
 * in development; in cloud environments these are Cloud Run Job env vars.
 */
export function loadConfig(): WorkerConfig {
  loadDotenv();
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
