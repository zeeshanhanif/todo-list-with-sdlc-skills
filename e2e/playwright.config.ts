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
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
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
      },
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
