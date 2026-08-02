import { Pool } from 'pg';

/**
 * DEF-013 regression guard — the api suite must start each run from a clean
 * rate-limit table.
 *
 * `auth_rate_buckets` rows are keyed `(ip, route, window_start)` with a
 * **15-minute** fixed window, and every spec's `nextIp()` counter restarts at
 * `.1` on every run. So two runs of the suite inside one window hit the *same*
 * bucket keys and their counts add up. Measured before the fix: the same key
 * went 31 → 62 → 93 across three consecutive runs, while the default
 * `AUTH_RATELIMIT_MAX` is **30**. Any spec whose per-run usage crosses that
 * threshold on the second or third run starts getting `429` where it expects a
 * success — and the specs that omit `X-Forwarded-For` all share one bucket keyed
 * on the localhost socket address, so they accumulate fastest of all.
 *
 * The suite is only order-independent and repeat-safe if the table is empty when
 * it starts, which `test/global-setup.js` now guarantees. This asserts that
 * guarantee rather than trusting it: it is the DEF-001 shape — the invariant that
 * would otherwise decay silently, made into a test.
 */
const DB =
  process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo';

describe('DEF-013: rate-limit buckets do not survive across suite runs', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: DB });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('carries no bucket from a window older than this run', async () => {
    // Anything older than the current 15-minute window can only be a leftover:
    // no spec in this run could have written it. Rows in the *current* window
    // are this run's own traffic and are expected.
    const windowMs = 15 * 60 * 1000;
    const currentWindowStart = new Date(
      Math.floor(Date.now() / windowMs) * windowMs,
    );

    const stale = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM auth_rate_buckets WHERE window_start < $1',
      [currentWindowStart],
    );

    expect(Number(stale.rows[0].n)).toBe(0);
  });

  it('never lets a bucket exceed the default limit through accumulation alone', async () => {
    // The failure mode DEF-013 names: a key climbing past AUTH_RATELIMIT_MAX
    // (default 30) because runs stack inside one window. A single run's own
    // traffic can legitimately exceed it — the specs that deliberately test
    // `429` do exactly that — so this checks only that nothing is *already*
    // over the line at a level no single run produces. Three stacked runs
    // measured 93 on one key; one run measures 31.
    const hot = await pool.query<{ ip: string; route: string; count: number }>(
      'SELECT ip, route, count FROM auth_rate_buckets WHERE count > $1 ORDER BY count DESC LIMIT 5',
      [60],
    );

    expect(hot.rows).toEqual([]);
  });
});
