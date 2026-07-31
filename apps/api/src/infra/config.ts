export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  webOrigin: string;
  /** Verification-link lifetime in hours (NFR-SEC-004, default 24). */
  verificationTokenTtlHours: number;
  /** Password-reset-link lifetime in hours (NFR-SEC-004, default 1). */
  resetTokenTtlHours: number;
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
  /** Cross-device sync provider (FEAT-019; ADR-006). `none` (the default) mints
   * no token and publishes no signal — the web client falls back to its adaptive
   * refetch schedule, which is what keeps NFR-PERF-004 satisfied without a
   * socket. `supabase` turns on the Broadcast path. */
  realtimeProvider: 'none' | 'supabase';
  /** Supabase project URL, e.g. `https://<ref>.supabase.co` (ADR-006). */
  supabaseUrl: string;
  /** **Secret.** Service-role key — authenticates the API's broadcast POSTs.
   * Server-side only; it never reaches a response body or the browser. */
  supabaseServiceRoleKey: string;
  /** Publishable (anon) key — public by design; handed to the client with its
   * minted token so it can open the socket. */
  supabasePublishableKey: string;
  /** **Secret.** Signs the short-lived Realtime tokens the API mints (D5). */
  supabaseJwtSecret: string;
  /** Minted Realtime-token lifetime in minutes (D5; default 30). Short by
   * design: it bounds a leaked token far below the 30-day session. */
  realtimeTokenTtlMinutes: number;
  /** Hard cap on a single broadcast publish, in ms (D3; default 250). The write
   * is already committed — sync must degrade latency, never the operation. */
  realtimePublishTimeoutMs: number;
}

/**
 * DI token for the single, boot-time `AppConfig` instance (DEF-008).
 *
 * Injected rather than called: config is a dependency a service *declares*, not
 * an ambient global it reaches for, and the values cannot change while the
 * process lives — so reading `process.env` per request was pure waste.
 */
export const APP_CONFIG = 'APP_CONFIG';

/**
 * Reads configuration from the environment (NFR-MAINT-003 — externalized config,
 * no committed secrets). In cloud environments these are Cloud Run environment
 * variables set at deploy time.
 *
 * **A pure read: it loads no file.** Bringing a local `.env` into `process.env`
 * is `loadEnv()`'s job, called once from `main.ts` (DEF-007).
 *
 * **Called once, at boot**, by `InfraModule`'s `APP_CONFIG` factory — not by
 * consumers (DEF-008). It must stay a `useFactory` rather than a `useValue`:
 * `useValue` would evaluate at module *import* time, before `main.ts` has had a
 * chance to call `loadEnv()`, and would silently produce a defaults-only config.
 */
export function readConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    verificationTokenTtlHours: Number(
      process.env.VERIFICATION_TOKEN_TTL_HOURS ?? 24,
    ),
    resetTokenTtlHours: Number(process.env.RESET_TOKEN_TTL_HOURS ?? 1),
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
    realtimeProvider:
      process.env.REALTIME_PROVIDER === 'supabase' ? 'supabase' : 'none',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
    supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
    realtimeTokenTtlMinutes: Number(
      process.env.REALTIME_TOKEN_TTL_MINUTES ?? 30,
    ),
    realtimePublishTimeoutMs: Number(
      process.env.REALTIME_PUBLISH_TIMEOUT_MS ?? 250,
    ),
  };
}
