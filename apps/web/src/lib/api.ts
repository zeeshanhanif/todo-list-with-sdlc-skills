import { HEALTH_PATH, type HealthResponse } from "@todo/shared";

// Server-side base URL for the API tier (ADR-002 — web and API are separate
// deployables). In cloud environments this is the API service URL from config.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** Fetch the skeleton health payload from the API; null if unreachable. */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}${HEALTH_PATH}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
