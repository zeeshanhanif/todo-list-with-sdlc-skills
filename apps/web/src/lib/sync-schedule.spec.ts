import {
  ACTIVE_POLL_MS,
  IDLE_AFTER_MS,
  IDLE_POLL_MS,
  nextPollDelay,
  tokenRefreshDelay,
} from "@/lib/sync-schedule";

// FEAT-019 T6 / AC-2 — the back-off half of NFR-PERF-004, asserted directly.
// This is the spec the web unit runner was stood up for: through Playwright,
// "polls every 4s while active but every 30s after two idle minutes" is a
// two-minute test that flakes; here it is four assertions.

describe("nextPollDelay", () => {
  it("does not poll while a Realtime subscription is delivering", () => {
    expect(
      nextPollDelay({ connected: true, visible: true, msSinceActivity: 0 }),
    ).toBeNull();
  });

  it("does not poll while the tab is hidden", () => {
    expect(
      nextPollDelay({ connected: false, visible: false, msSinceActivity: 0 }),
    ).toBeNull();
    // Even a busy hidden tab stays quiet — visibility returning refetches
    // immediately, so this costs no freshness.
    expect(
      nextPollDelay({
        connected: false,
        visible: false,
        msSinceActivity: IDLE_AFTER_MS + 1,
      }),
    ).toBeNull();
  });

  it("polls at the active interval while visible and recently used", () => {
    expect(
      nextPollDelay({ connected: false, visible: true, msSinceActivity: 0 }),
    ).toBe(ACTIVE_POLL_MS);
    // The interval has to leave room for the refetch inside 5 s.
    expect(ACTIVE_POLL_MS).toBeLessThan(5_000);
  });

  it("backs off once the tab has been idle", () => {
    // One millisecond before the threshold is still active.
    expect(
      nextPollDelay({
        connected: false,
        visible: true,
        msSinceActivity: IDLE_AFTER_MS - 1,
      }),
    ).toBe(ACTIVE_POLL_MS);
    expect(
      nextPollDelay({
        connected: false,
        visible: true,
        msSinceActivity: IDLE_AFTER_MS,
      }),
    ).toBe(IDLE_POLL_MS);
    expect(
      nextPollDelay({
        connected: false,
        visible: true,
        msSinceActivity: 10 * IDLE_AFTER_MS,
      }),
    ).toBe(IDLE_POLL_MS);
  });
});

describe("tokenRefreshDelay", () => {
  const now = Date.parse("2026-07-29T12:00:00.000Z");

  it("re-mints at 80% of the token's remaining lifetime", () => {
    const expiresAt = new Date(now + 30 * 60_000).toISOString();
    expect(tokenRefreshDelay(expiresAt, now)).toBe(24 * 60_000);
  });

  it("re-mints immediately for an already-expired token", () => {
    const expiresAt = new Date(now - 60_000).toISOString();
    expect(tokenRefreshDelay(expiresAt, now)).toBe(0);
  });
});
