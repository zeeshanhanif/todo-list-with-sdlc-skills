// The fallback refetch schedule (FEAT-019 technical-design D4) — pure, so the
// timing behaviour NFR-PERF-004 depends on is asserted directly instead of
// being inferred from a browser's clock.
//
// ADR-006 keeps refetch-on-focus/reconnect plus light polling as its retained
// degradation path, and today that path is the ONLY one: no Supabase project is
// provisioned, so `{ enabled: false }` is what every environment gets. This
// module is therefore what makes "a change is visible on another online device
// within 5 s" true right now — not a consolation prize.

/** Coalescing window for incoming signals (D6). Two signals inside it cause one
 * refresh: a duplicate refresh costs a refetch, a dropped one leaves a stale
 * screen, so we always refresh — just not twice. */
export const COALESCE_MS = 250;

/** Poll interval while the tab is visible and recently used. Four seconds, not
 * five: the refetch itself has to fit inside NFR-PERF-004's budget. */
export const ACTIVE_POLL_MS = 4_000;

/** Poll interval once the tab has been idle. Sync still converges, at a
 * thirtieth of the load — the objection that retired the original polling ADR
 * (NFR-SCAL-001, 1k concurrent users). */
export const IDLE_POLL_MS = 30_000;

/** How long without interaction counts as idle. */
export const IDLE_AFTER_MS = 120_000;

export interface SyncState {
  /** A live Realtime subscription is delivering signals. */
  connected: boolean;
  /** The tab is visible (`document.visibilityState === "visible"`). */
  visible: boolean;
  /** Milliseconds since the last pointer/key/focus activity in this tab. */
  msSinceActivity: number;
}

/**
 * The delay before the next fallback refetch, or `null` for "do not poll".
 *
 * Two `null` cases, for opposite reasons:
 * - **connected** — signals arrive; polling on top of them is pure waste.
 * - **hidden** — nobody is looking, and a hidden tab that polls is the load
 *   pattern this schedule exists to avoid. Visibility returning triggers an
 *   immediate refetch (the provider's listeners), so a hidden tab is never
 *   stale by the time it is looked at.
 */
export function nextPollDelay(state: SyncState): number | null {
  if (state.connected || !state.visible) return null;
  return state.msSinceActivity >= IDLE_AFTER_MS ? IDLE_POLL_MS : ACTIVE_POLL_MS;
}

/** When to re-mint a Realtime token: at 80% of its lifetime, so the socket is
 * re-authenticated before the current token expires rather than after the
 * server drops it. Never negative — an already-expired token re-mints now. */
export function tokenRefreshDelay(
  expiresAt: string,
  now: number = Date.now(),
): number {
  const lifetime = new Date(expiresAt).getTime() - now;
  return Math.max(0, Math.floor(lifetime * 0.8));
}
