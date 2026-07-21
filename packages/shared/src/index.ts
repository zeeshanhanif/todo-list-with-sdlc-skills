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
