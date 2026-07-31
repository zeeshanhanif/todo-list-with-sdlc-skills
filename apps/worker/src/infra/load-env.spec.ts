import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findEnvFile, loadEnv } from "./load-env";
import { readConfig } from "../config";

// DEF-007 regression guard, worker side. Same defect as the API's: `readConfig()`
// called dotenv with no path, so a workspace-script start (`npm run worker:run`)
// resolved `.env` against `apps/worker`, which has none — so EMAIL_PROVIDER,
// SMTP_URL and the backoff settings silently stayed at their defaults. For this
// app that mattered in a specific way: an operator could configure real SMTP and
// the worker would go on logging emails instead of sending them.

function fakeRepo(envBody: string): { root: string; nested: string } {
  const root = mkdtempSync(join(tmpdir(), "def007-worker-"));
  const nested = join(root, "apps", "worker");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(root, ".env"), envBody);
  return { root, nested };
}

describe("DEF-007: worker env resolution from a workspace directory", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("finds the repo-root .env from the workspace dir", () => {
    const { root, nested } = fakeRepo("EMAIL_PROVIDER=smtp\n");
    expect(findEnvFile(nested)).toBe(join(root, ".env"));
  });

  it("applies them to the config the worker reads", () => {
    const { nested } = fakeRepo(
      "EMAIL_PROVIDER=smtp\nSMTP_URL=smtps://u:p@smtp.example.com:465\nEMAIL_MAX_ATTEMPTS=9\n",
    );
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SMTP_URL;
    delete process.env.EMAIL_MAX_ATTEMPTS;

    loadEnv(nested);

    const config = readConfig();
    // The one that would have bitten hardest: configured SMTP actually selected.
    expect(config.emailProvider).toBe("smtp");
    expect(config.smtpUrl).toBe("smtps://u:p@smtp.example.com:465");
    expect(config.emailMaxAttempts).toBe(9);
  });

  it("lets the real environment win over the file", () => {
    const { nested } = fakeRepo("EMAIL_PROVIDER=smtp\n");
    process.env.EMAIL_PROVIDER = "log";
    loadEnv(nested);
    expect(readConfig().emailProvider).toBe("log");
  });

  it("readConfig performs no file loading of its own", () => {
    const { nested } = fakeRepo("EMAIL_PROVIDER=smtp\n");
    loadEnv(nested);
    delete process.env.EMAIL_PROVIDER;
    expect(readConfig().emailProvider).toBe("log");
  });
});
