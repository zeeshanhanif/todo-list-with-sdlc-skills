import { defineConfig } from "@playwright/test";
import path from "node:path";

// E2E drives the real local stack: Playwright starts the API and the web dev
// server (both from the monorepo root) and the tests hit the web shell, which
// server-side-fetches the API, which round-trips Postgres. Postgres must be up
// (`npm run db:up`) and migrated (`npm run db:migrate`) first — the root
// `npm run test:e2e` script does the migrate step for you.
const repoRoot = path.resolve(__dirname, "..");
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  // `retain-on-failure`, NOT `on-first-retry`: this project runs with the
  // default `retries: 0`, so "on first retry" meant a trace was never captured
  // at all — every DEF-016 failure in CI produced zero diagnostic evidence.
  // Deliberately not solved by setting `retries: 1`, which would let a flaky
  // test pass on retry and exit 0, hiding the very defect we are hunting while
  // CI gates deployment.
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run start -w @todo/api",
      cwd: repoRoot,
      url: "http://localhost:3001/healthz",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL,
        PORT: "3001",
        WEB_ORIGIN: "http://localhost:3000",
        // Pinned, not inherited (DEF-007). The API's CWD here is the repo root,
        // so it loads the repo `.env` — and a developer with REALTIME_PROVIDER=
        // supabase in theirs would otherwise have this suite publishing to a
        // real external service on every write. The suite tests the fallback
        // path deliberately (FEAT-019 AC-2); that must not depend on whose
        // machine it runs on.
        REALTIME_PROVIDER: "none",
        // The suite's own fixtures register ~25-30 users per run against a
        // production-shaped limit of 30 per 15 minutes, so a full run sat one
        // run away from red and two runs in a window failed outright — the
        // carried FEAT-009 acceptance minor, which cost this session two
        // false alarms. Raised here, in the harness, NOT by weakening a test:
        // no E2E test asserts rate limiting, and the limiter's own coverage
        // lives in the api specs (sign-in / reset / change-password AC cases)
        // with their own IP ranges and their own config.
        AUTH_RATELIMIT_MAX: "100000",
      },
    },
    {
      command: "npm run dev -w @todo/web",
      cwd: repoRoot,
      url: "http://localhost:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        API_URL: "http://localhost:3001",
        PORT: "3000",
        // FEAT-019: exposes window.__todoSync so the sync spec can deliver a
        // signal deterministically without a Realtime socket (technical-design
        // §5). Test-only — absent from production builds.
        NEXT_PUBLIC_SYNC_TEST_HOOK: "1",
        // DEF-014: suppress Next's dev tools indicator. It is a dev-only
        // `<nextjs-portal>` pinned to the bottom-left corner — where the shell
        // puts sign-out — and it hit-tests above the app, so Playwright will
        // not click through it. It mounts ~1s after paint, so it silently
        // decided verdicts by machine speed: UC-007 passed locally (1.6s) and
        // timed out in CI. Suppressed in the HARNESS rather than worked around
        // in the tests: a `force: true` click would have hidden this instead of
        // fixing it, and would hide a real overlay regression next time.
        NEXT_DISABLE_DEV_INDICATORS: "1",
      },
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
