// Jest globalSetup for the API: ensure the database schema exists before any
// integration test runs, so `npm test` is self-contained and order-independent
// (it does not rely on a separate migrate step running first). Idempotent —
// already-applied migrations are a no-op. Uses DATABASE_URL from the environment
// (CI sets it; locally it defaults to the docker-compose Postgres).
const { execSync } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

module.exports = async () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const databaseUrl =
    process.env.DATABASE_URL || 'postgres://todo:todo@localhost:5432/todo';
  execSync('npx node-pg-migrate up -m migrations', {
    cwd: repoRoot,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  // DEF-013: start every run with an empty rate-limit table.
  //
  // `auth_rate_buckets` is keyed (ip, route, window_start) on a 15-MINUTE fixed
  // window, and every spec's `nextIp()` counter restarts at `.1` each run — so
  // two runs inside one window hit the SAME keys and their counts add together.
  // Measured: one key went 31 -> 62 -> 93 over three consecutive runs against a
  // default AUTH_RATELIMIT_MAX of 30. Left alone, the suite's repeatability
  // depends on what time it is and how recently it last ran, which is precisely
  // the "order- or timing-dependent" behaviour DEF-002 chased.
  //
  // Truncating here (not per-spec) is deliberate: specs already delete their own
  // IP prefixes, and DEF-001 showed that per-spec deletes racing each other is
  // its own hazard. globalSetup runs once, before any worker starts, so it is
  // the only place that can clear the table without landing mid-request.
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('TRUNCATE auth_rate_buckets');
  } finally {
    await pool.end();
  }
};
