// Shared contracts across web / api / worker (ADR-002 — one language, shared types).
// The walking skeleton uses the health contract to prove the end-to-end path;
// per-slice DTOs (auth, lists, tasks, ...) are added here by detailed-design.

/** Path of the skeleton health endpoint on the API service. */
export const HEALTH_PATH = "/healthz";

/** Response shape of GET /healthz — the skeleton's trivial end-to-end payload. */
export interface HealthResponse {
  /** Overall service status. */
  status: "ok" | "degraded";
  /** Whether the Postgres round-trip (write + read) succeeded. */
  db: "up" | "down";
  /** Id of the ping row written this request (null when db is down). */
  pingId: number | null;
  /** Total ping rows read back after the write (null when db is down). */
  pingCount: number | null;
  /** Server timestamp (ISO-8601, UTC — NFR-LOC-001). */
  time: string;
  /** Emitting service name. */
  service: string;
}
