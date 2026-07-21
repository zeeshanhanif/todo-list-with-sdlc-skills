import {
  HEALTH_PATH,
  SKELETON_PING_PATH,
  type HealthResponse,
  type SkeletonPingResponse,
} from "@todo/shared";

// Server-side base URL for the API tier (ADR-002 — web and API are separate
// deployables). In cloud environments this is the API service URL from config.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** API liveness (no DB). null if unreachable. */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}${HEALTH_PATH}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** Skeleton DB round-trip proof (web -> API -> Postgres -> back). null if unreachable. */
export async function fetchSkeletonPing(): Promise<SkeletonPingResponse | null> {
  try {
    const res = await fetch(`${API_URL}${SKELETON_PING_PATH}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SkeletonPingResponse;
  } catch {
    return null;
  }
}
