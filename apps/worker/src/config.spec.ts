import { readConfig } from "./config";

// FEAT-020 acceptance: AC-6's FIRST clause — "the window is read from
// TASK_RETENTION_DAYS and defaults to 30". The feature's own tests proved that a
// DIFFERENT retentionDays purges differently, but nothing asserted where that
// number comes from: readConfig's mapping was only ever demonstrated by hand, so
// a typo'd env key or a changed default would have shipped green.
describe("readConfig — purge settings (AC-6)", () => {
  const keys = ["TASK_RETENTION_DAYS", "PURGE_BATCH_SIZE"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Jest reuses a worker process across suites, so an unrestored env var leaks
    // into whatever runs next (the convention the auth specs established).
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults the retention window to 30 days — the SRS §3.4 figure", () => {
    expect(readConfig().taskRetentionDays).toBe(30);
  });

  it("defaults the purge batch size to 500", () => {
    expect(readConfig().purgeBatchSize).toBe(500);
  });

  it("reads the retention window from TASK_RETENTION_DAYS", () => {
    process.env.TASK_RETENTION_DAYS = "7";
    expect(readConfig().taskRetentionDays).toBe(7);
  });

  it("reads the batch size from PURGE_BATCH_SIZE", () => {
    process.env.PURGE_BATCH_SIZE = "50";
    expect(readConfig().purgeBatchSize).toBe(50);
  });
});
