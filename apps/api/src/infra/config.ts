import { config as loadDotenv } from 'dotenv';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  webOrigin: string;
  /** Verification-link lifetime in hours (NFR-SEC-004, default 24). */
  verificationTokenTtlHours: number;
  /** Minimum seconds between verification-email resends for one recipient
   * (FEAT-002 D4 feature-local cooldown; default 60). */
  resendCooldownSeconds: number;
  /** Session lifetime in days (FR-AUTH-016 long-lived; ADR-005; default 30). */
  sessionTtlDays: number;
  /** Whether the session cookie carries the `Secure` attribute. Defaults on in
   * production; off in dev/test so the cookie round-trips over plain HTTP
   * (NFR-SEC-007 — Secure is env-gated, HttpOnly + SameSite are always on). */
  cookieSecure: boolean;
  /** Consecutive failed sign-ins before an account is locked (FR-AUTH-019;
   * default 5). */
  loginMaxFailedAttempts: number;
  /** Lockout duration in minutes once the failed-attempt threshold is hit
   * (FR-AUTH-019; NFR-SEC-006; default 15). */
  loginLockoutMinutes: number;
  /** Per-IP auth rate-limit window in seconds (FR-AUTH-018; default 900). */
  authRateLimitWindowSeconds: number;
  /** Max auth-endpoint hits per IP per window before 429 (FR-AUTH-018,
   * NFR-SEC-006; default 30). */
  authRateLimitMax: number;
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
    resendCooldownSeconds: Number(process.env.RESEND_COOLDOWN_SECONDS ?? 60),
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
    cookieSecure:
      (process.env.COOKIE_SECURE ??
        String((process.env.NODE_ENV ?? 'development') === 'production')) ===
      'true',
    loginMaxFailedAttempts: Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 5),
    loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15),
    authRateLimitWindowSeconds: Number(
      process.env.AUTH_RATELIMIT_WINDOW_SECONDS ?? 900,
    ),
    authRateLimitMax: Number(process.env.AUTH_RATELIMIT_MAX ?? 30),
  };
}
