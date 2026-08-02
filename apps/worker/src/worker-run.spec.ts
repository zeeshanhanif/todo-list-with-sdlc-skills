import { execFile } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import { promisify } from "util";
import { Pool } from "pg";

const run = promisify(execFile);

// FEAT-020 rework round 1 — AC-8's SECOND clause: "the job's completion line
// reports both passes' summaries".
//
// This spawns the REAL entrypoint. The acceptance audit's finding was precisely
// that nothing anywhere asserted the completion line — every existing test
// stopped at the individual passes' own log lines, so the clause was neither
// implemented nor checked. A unit test on a helper would repeat that mistake:
// it could not prove `main.ts` puts the summaries on the line it actually emits.
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const workerDir = path.resolve(__dirname, "..");

interface CompletionLine {
  msg: string;
  envFile: string;
  drain: { sent: number; retried: number; deadLettered: number } | null;
  purge: { purged: number } | null;
  failed: number;
}

/**
 * Nest's Logger colourises when it thinks it is attached to a TTY, so the raw
 * output may or may not carry ANSI escapes. Stripping them first keeps the
 * extraction from depending on which — and the escape is written as an
 * explicit \u001b, never a literal control byte sitting invisibly in the source.
 */
const ANSI = /\u001b\[[0-9;]*m/g;

/** Run the entrypoint and pull its `worker run complete` line out of the logs. */
const runJob = async (): Promise<CompletionLine> => {
  const { stdout, stderr } = await run(
    "npx",
    ["ts-node", "--transpile-only", "src/main.ts"],
    { cwd: workerDir, env: { ...process.env, DATABASE_URL: DB } },
  );
  const out = `${stdout}\n${stderr}`.replace(ANSI, "");
  const line = out
    .split("\n")
    .find((l) => l.includes('"msg":"worker run complete"'));
  if (!line) throw new Error(`no completion line in worker output:\n${out}`);
  // The prefix ends where the JSON begins, and the JSON runs to end of line.
  return JSON.parse(line.slice(line.indexOf("{"))) as CompletionLine;
};

describe("worker entrypoint completion line (AC-8)", () => {
  jest.setTimeout(120_000); // spawns a real ts-node process

  let pool: Pool;
  const email = `worker-run-${randomUUID()}@example.com`;
  let ownerId: string;
  let listId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB });
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    ownerId = u.rows[0].id;
    const l = await pool.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, is_default) VALUES ($1, 'Inbox', true) RETURNING id`,
      [ownerId],
    );
    listId = l.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await pool.end();
  });

  it("reports BOTH passes' summaries, not just a failure count", async () => {
    // Seed one expired task so the purge summary has something non-zero to
    // carry — a line reporting `purged: 0` could be right by accident.
    await pool.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       VALUES ($1, $2, 'expired for the completion line', now() - make_interval(days => 31))`,
      [ownerId, listId],
    );

    const line = await runJob();

    // The drain's summary, with all three of its keys.
    expect(line.drain).toEqual({
      sent: expect.any(Number),
      retried: expect.any(Number),
      deadLettered: expect.any(Number),
    });
    // The purge's summary, and it counted the row we seeded.
    expect(line.purge).not.toBeNull();
    expect(line.purge!.purged).toBeGreaterThanOrEqual(1);
    expect(line.failed).toBe(0);

    // ...and the row really went.
    const left = await pool.query(
      `SELECT 1 FROM tasks WHERE owner_id = $1 AND deleted_at IS NOT NULL`,
      [ownerId],
    );
    expect(left.rowCount).toBe(0);
  });

  it("a second run reports both summaries again with nothing left to do", async () => {
    const line = await runJob();

    // Still BOTH keys present — the clause is about the line's shape, which must
    // not depend on there being work.
    expect(line.drain).not.toBeNull();
    expect(line.purge).toEqual({ purged: 0 });
    expect(line.failed).toBe(0);
  });
});
