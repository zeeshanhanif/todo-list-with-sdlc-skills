import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { config as dotenvDefault } from 'dotenv';
import { findEnvFile, loadEnv } from './load-env';
import { loadConfig } from './config';

// DEF-007 regression guard.
//
// The defect: `loadConfig()` called dotenv with no path, so it resolved `.env`
// against the process CWD — which is `apps/api` when the API is started as a
// workspace script (`npm run dev:api`, `npm run start -w @todo/api`). The repo's
// only `.env` lives at the root, so every value an operator set was silently
// ignored and the API ran on defaults. `.env.example` documents the path that
// did not work, which is what makes this worth a guard rather than a comment.
//
// The fix moves env loading to the process entrypoint and resolves the file by
// walking up from the start directory, so the loader finds the repo root from
// any depth. `loadConfig()` is now a pure read of `process.env`.

/** A throwaway tree shaped like the monorepo: root `.env` + nested workspace. */
function fakeRepo(envBody: string): { root: string; nested: string } {
  const root = mkdtempSync(join(tmpdir(), 'def007-'));
  const nested = join(root, 'apps', 'api');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(root, '.env'), envBody);
  return { root, nested };
}

describe('DEF-007: env resolution from a workspace directory', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('finds the repo-root .env when started from the workspace dir', () => {
    const { root, nested } = fakeRepo('SESSION_TTL_DAYS=99\n');

    expect(findEnvFile(nested)).toBe(join(root, '.env'));
    // ...and from the root itself, and from a deeper path.
    expect(findEnvFile(root)).toBe(join(root, '.env'));
    expect(findEnvFile(join(nested, 'src', 'infra'))).toBe(join(root, '.env'));
  });

  it('applies those values to the config the API actually reads', () => {
    const { nested } = fakeRepo('SESSION_TTL_DAYS=99\nAUTH_RATELIMIT_MAX=7\n');
    delete process.env.SESSION_TTL_DAYS;
    delete process.env.AUTH_RATELIMIT_MAX;

    loadEnv(nested);

    // The reported symptom, inverted: values from the root file are now visible
    // to a process whose CWD is the workspace directory.
    expect(loadConfig().sessionTtlDays).toBe(99);
    expect(loadConfig().authRateLimitMax).toBe(7);
  });

  it('lets the real environment win over the file (documented precedence)', () => {
    const { nested } = fakeRepo('SESSION_TTL_DAYS=99\n');
    process.env.SESSION_TTL_DAYS = '3';

    loadEnv(nested);

    // Cloud Run passes env vars directly; a stray .env must never override the
    // deployed configuration.
    expect(loadConfig().sessionTtlDays).toBe(3);
  });

  it('returns null rather than throwing when there is no .env anywhere', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'def007-none-'));
    expect(findEnvFile(orphan)).toBeNull();
    expect(loadEnv(orphan)).toBeNull();
  });

  it('loadConfig performs no file loading of its own', () => {
    const { nested } = fakeRepo('SESSION_TTL_DAYS=99\n');
    loadEnv(nested);
    delete process.env.SESSION_TTL_DAYS;

    // Config is a pure read: it must not quietly re-inject the file. This is
    // what keeps unit tests hermetic — a spec that deletes a variable gets the
    // default, not whatever a developer happens to have in their .env.
    expect(loadConfig().sessionTtlDays).toBe(30);
  });

  it('documents the defect itself: dotenv from a workspace CWD finds nothing', () => {
    const { nested } = fakeRepo('DEF007_MARKER=loaded\n');
    const cwd = process.cwd();
    try {
      process.chdir(nested);
      delete process.env.DEF007_MARKER;
      // Exactly what the shipped code did. There is no .env in `apps/api`.
      dotenvDefault();
      expect(process.env.DEF007_MARKER).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });
});
