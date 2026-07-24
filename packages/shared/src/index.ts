// Shared contracts across web / api / worker (ADR-002 — one language, shared types).
// The walking skeleton uses these to prove the end-to-end path; per-slice DTOs
// (auth, lists, tasks, ...) are added here by detailed-design.

/** Path of the API liveness endpoint (NFR-OBS-002 — uptime monitoring). */
export const HEALTH_PATH = "/healthz";

/**
 * Liveness response for GET /healthz. Cheap, dependency-free: answers "is the
 * process up and serving?" — deliberately does NOT touch the database, so uptime
 * monitoring doesn't depend on (or load) Postgres. Readiness/DB checks, if needed,
 * belong on a separate endpoint later.
 */
export interface HealthResponse {
  status: "ok";
  service: string;
  /** Server timestamp (ISO-8601, UTC — NFR-LOC-001). */
  time: string;
}

/** Path of the skeleton DB round-trip proof. Temporary — removed once real slices exist. */
export const SKELETON_PING_PATH = "/healthz/ping";

/**
 * Response of GET /healthz/ping — the walking skeleton's proof that the API can
 * round-trip Postgres (write + read). A sub-route of /healthz that liveness
 * monitors do not hit. Scaffolding, NOT a product feature: it exists only to
 * demonstrate the end-to-end path and exercise migration 001, and is deleted
 * when the first real domain slice lands.
 */
export interface SkeletonPingResponse {
  status: "ok" | "degraded";
  /** Whether the Postgres write+read succeeded. */
  db: "up" | "down";
  /** Id of the ping row written this request (null when db is down). */
  pingId: number | null;
  /** Total ping rows read back after the write (null when db is down). */
  pingCount: number | null;
  /** Server timestamp (ISO-8601, UTC). */
  time: string;
  service: string;
}

// --- Auth: registration (FEAT-001) ---

/** Path of the registration endpoint. */
export const REGISTER_PATH = "/auth/register";

/** Password policy bounds (NFR-SEC-003). Reused by the web client for the
 * min-length hint so the UI can never drift from the server rule. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Request body of POST /auth/register. */
export interface RegisterRequest {
  email: string;
  password: string;
}

/** Success response (201) of POST /auth/register — neutral (SW-002). */
export interface RegisterResponse {
  status: "verification_sent";
}

/** Standard API error envelope (established by FEAT-001, technical-design D6).
 * `fields` is present for field-level validation failures. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  fields?: Array<{ field: string; message: string }>;
}

// --- Auth: verify email + resend (FEAT-002) ---

/** Path of the email-verification endpoint. Consumes a single-use token. */
export const VERIFY_PATH = "/auth/verify";

/** Path of the resend-verification endpoint. Neutral response (no enumeration). */
export const RESEND_VERIFICATION_PATH = "/auth/verify/resend";

/** Request body of POST /auth/verify — the raw token from the email link. */
export interface VerifyRequest {
  token: string;
}

/** Success response (200) of POST /auth/verify. */
export interface VerifyResponse {
  status: "verified";
}

/** Request body of POST /auth/verify/resend. */
export interface ResendVerificationRequest {
  email: string;
}

/** Success response (200) of POST /auth/verify/resend — neutral: the same body
 * whether or not the address exists / is already verified / is in cooldown
 * (FEAT-002 technical-design D3). */
export interface ResendVerificationResponse {
  status: "verification_sent";
}
