import { config as loadDotenv } from 'dotenv';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  webOrigin: string;
  /** Verification-link lifetime in hours (NFR-SEC-004, default 24). */
  verificationTokenTtlHours: number;
}

/**
 * Loads configuration from the environment (NFR-MAINT-003 — externalized config,
 * no committed secrets). Reads a local .env in development; in cloud environments
 * the values are Cloud Run environment variables set at deploy time.
 */
export function loadConfig(): AppConfig {
  loadDotenv();
  return {
    port: Number(process.env.PORT ?? 3001),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    verificationTokenTtlHours: Number(
      process.env.VERIFICATION_TOKEN_TTL_HOURS ?? 24,
    ),
  };
}
