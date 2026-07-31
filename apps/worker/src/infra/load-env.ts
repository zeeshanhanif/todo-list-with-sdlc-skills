import { existsSync } from "fs";
import { dirname, join, parse } from "path";
import { config as loadDotenv } from "dotenv";

/**
 * Loads the repo's `.env` at the **process entrypoint** (DEF-007).
 *
 * The defect this replaces: `loadConfig()` called dotenv with no path, so it
 * resolved `.env` against the process CWD. npm workspace scripts run with the
 * CWD set to the workspace directory (`apps/worker`), where there is no `.env`, so
 * every value an operator set in the root file was silently ignored and the API
 * ran on defaults — while `.env.example` told them to do exactly that.
 *
 * Two properties matter:
 *
 * - **Resolved by walking up**, not by CWD, so `npm run worker:run` from anywhere
 *   finds the same file the root scripts and `node-pg-migrate` use.
 * - **Called once, from `main.ts`** — never from `loadConfig()`, which stays a
 *   pure read of `process.env`. That is what keeps unit tests hermetic: a spec
 *   that deletes a variable gets the default rather than whatever a developer
 *   happens to have in their `.env`. (It also stops dotenv running on every
 *   request — `loadConfig()` is called per run.)
 *
 * Precedence is dotenv's own and is deliberate: **the real environment wins**.
 * In Cloud Run these arrive as service env vars with no file present at all, so
 * a stray `.env` in an image could never override deployed configuration.
 */
export function findEnvFile(startDir: string): string | null {
  const { root } = parse(startDir);
  let dir = startDir;

  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Finds and loads the nearest `.env` at or above `startDir`.
 * Returns the file it loaded, or `null` when there is none — the caller logs
 * which, because the failure mode this defect had was **silence**.
 */
export function loadEnv(startDir: string = process.cwd()): string | null {
  const file = findEnvFile(startDir);
  if (!file) return null;
  loadDotenv({ path: file });
  return file;
}
