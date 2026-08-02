import { randomUUID } from "crypto";
import { Pool } from "pg";
import { PURGE_EXPIRED_SQL } from "./purge.repository";

// FEAT-020 design §6 AC-10 (D5): the every-minute purge must not seq-scan the
// whole tasks table. This EXPLAINs the EXACT statement the repository runs
// (imported, not copied, so it cannot drift) and asserts the planner reaches the
// expired rows through `tasks_purge_due_idx`.
//
// It seeds a corpus first, deliberately: on an empty table a seq scan is the
// CORRECT plan, so asserting index usage without scale would be asserting
// something Postgres has no reason to do. The seed is what makes the question
// meaningful — which is also D5's whole point, that the cost grows with the
// corpus while the expired set does not.
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const LIVE_ROWS = 5000;

describe("purge query plan (integration)", () => {
  let pool: Pool;
  const email = `purge-plan-${randomUUID()}@example.com`;
  let ownerId: string;
  let listId: string;

  const explain = async (): Promise<string> => {
    const res = await pool.query<{ "QUERY PLAN": string }>(
      `EXPLAIN ${PURGE_EXPIRED_SQL}`,
      [30, 500],
    );
    return res.rows.map((r) => r["QUERY PLAN"]).join("\n");
  };

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

    await pool.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       SELECT $1, $2, 'live ' || g, NULL FROM generate_series(1, $3) g`,
      [ownerId, listId, LIVE_ROWS],
    );
    await pool.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       SELECT $1, $2, 'expired ' || g, now() - make_interval(days => 31)
         FROM generate_series(1, 20) g`,
      [ownerId, listId],
    );
    await pool.query("ANALYZE tasks");
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await pool.query("ANALYZE tasks");
    await pool.end();
  });

  it("AC-10: reaches the expired rows through tasks_purge_due_idx, not a seq scan of tasks", async () => {
    const plan = await explain();

    expect(plan).toContain("tasks_purge_due_idx");
    // The inner selection must not walk the table. (The outer DELETE's own
    // access to the matched ids is by primary key, which is not a table scan.)
    expect(plan).not.toMatch(/Seq Scan on tasks/);
  });

  it("AC-10: the index is what avoids the scan — without it the planner falls back to one", async () => {
    // Discrimination: the assertion above must be reporting the index's effect,
    // not a plan Postgres would have chosen anyway. Dropped inside a rolled-back
    // transaction so the schema is untouched when this test ends.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DROP INDEX tasks_purge_due_idx");
      const res = await client.query<{ "QUERY PLAN": string }>(
        `EXPLAIN ${PURGE_EXPIRED_SQL}`,
        [30, 500],
      );
      const without = res.rows.map((r) => r["QUERY PLAN"]).join("\n");

      expect(without).toMatch(/Seq Scan on tasks/);
      expect(without).not.toContain("tasks_purge_due_idx");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    // The index survived the probe.
    const still = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'tasks_purge_due_idx'`,
    );
    expect(still.rowCount).toBe(1);
  });
});
