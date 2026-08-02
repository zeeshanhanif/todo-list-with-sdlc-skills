import { randomUUID } from "crypto";
import { Pool } from "pg";
import { PurgeRepository } from "./purge.repository";

// Integration test (needs local Postgres; schema via jest globalSetup).
// Covers the purge predicate itself — FEAT-020 design §6 AC-1, AC-2, AC-3, AC-5,
// AC-6, AC-11 (FR-TASK-015).
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const RETENTION = 30;

describe("PurgeRepository (integration)", () => {
  let pool: Pool;
  let repo: PurgeRepository;
  // Every fixture row this suite creates hangs off one user, so cleanup is a
  // single cascading delete and a parallel worker's rows can never be in scope.
  const email = `purge-${randomUUID()}@example.com`;
  let ownerId: string;
  let listId: string;
  let otherOwnerId: string;
  let otherListId: string;
  const otherEmail = `purge-other-${randomUUID()}@example.com`;

  /** Seed a task. `deletedAgo`/`createdAgo` are SQL intervals, or null. */
  const seedTask = async (over: {
    deletedAgo?: string | null;
    createdAgo?: string;
    completed?: boolean;
    owner?: "mine" | "other";
  }): Promise<string> => {
    const owner = over.owner === "other" ? otherOwnerId : ownerId;
    const list = over.owner === "other" ? otherListId : listId;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, created_at, completed_at, deleted_at)
       VALUES ($1, $2, $3,
               now() - ($4::text)::interval,
               CASE WHEN $5::boolean THEN now() - ($4::text)::interval ELSE NULL END,
               CASE WHEN $6::text IS NULL THEN NULL ELSE now() - ($6::text)::interval END)
       RETURNING id`,
      [
        owner,
        list,
        "purge fixture",
        over.createdAgo ?? "1 day",
        over.completed ?? false,
        over.deletedAgo ?? null,
      ],
    );
    return res.rows[0].id;
  };

  const exists = async (id: string): Promise<boolean> => {
    const res = await pool.query(`SELECT 1 FROM tasks WHERE id = $1`, [id]);
    return res.rowCount === 1;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB });
    repo = new PurgeRepository(pool);
    const mk = async (
      addr: string,
    ): Promise<{ owner: string; list: string }> => {
      const u = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
        [addr],
      );
      const l = await pool.query<{ id: string }>(
        `INSERT INTO lists (owner_id, name, is_default) VALUES ($1, 'Inbox', true) RETURNING id`,
        [u.rows[0].id],
      );
      return { owner: u.rows[0].id, list: l.rows[0].id };
    };
    ({ owner: ownerId, list: listId } = await mk(email));
    ({ owner: otherOwnerId, list: otherListId } = await mk(otherEmail));
  });

  afterAll(async () => {
    // users → lists → tasks all cascade, so this removes every fixture row.
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [
      [email, otherEmail],
    ]);
    await pool.end();
  });

  it("AC-1: purges a task soft-deleted longer ago than the retention window", async () => {
    const id = await seedTask({ deletedAgo: "31 days" });

    const purged = await repo.purgeExpired({
      retentionDays: RETENTION,
      limit: 500,
    });

    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await exists(id)).toBe(false);
  });

  it("AC-2: leaves a task soft-deleted within the window, so it stays restorable", async () => {
    const id = await seedTask({ deletedAgo: "29 days" });

    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });

    expect(await exists(id)).toBe(true);
  });

  it("AC-3: never purges a task with deleted_at NULL, however old — active or completed", async () => {
    const active = await seedTask({ deletedAgo: null, createdAgo: "400 days" });
    const completed = await seedTask({
      deletedAgo: null,
      createdAgo: "400 days",
      completed: true,
    });

    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });

    expect(await exists(active)).toBe(true);
    expect(await exists(completed)).toBe(true);
  });

  it("AC-5: purges a soft-deleted task that had been completed before deletion", async () => {
    const id = await seedTask({ deletedAgo: "31 days", completed: true });

    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });

    expect(await exists(id)).toBe(false);
  });

  it("AC-6: purges by the configured window, not a hard-coded 30 days", async () => {
    const id = await seedTask({ deletedAgo: "10 days" });

    // Untouched at the default window...
    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });
    expect(await exists(id)).toBe(true);

    // ...and gone once the window is shorter than its age.
    await repo.purgeExpired({ retentionDays: 7, limit: 500 });
    expect(await exists(id)).toBe(false);
  });

  it("AC-11: touches nothing outside the expired set — another user's rows and the lists survive", async () => {
    const mineExpired = await seedTask({ deletedAgo: "31 days" });
    const mineActive = await seedTask({ deletedAgo: null });
    const theirsInWindow = await seedTask({
      deletedAgo: "2 days",
      owner: "other",
    });
    const theirsActive = await seedTask({ deletedAgo: null, owner: "other" });

    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });

    expect(await exists(mineExpired)).toBe(false);
    expect(await exists(mineActive)).toBe(true);
    expect(await exists(theirsInWindow)).toBe(true);
    expect(await exists(theirsActive)).toBe(true);
    const lists = await pool.query(
      `SELECT 1 FROM lists WHERE id = ANY($1)`,
      [[listId, otherListId]],
    );
    expect(lists.rowCount).toBe(2);
  });

  it("AC-6/AC-1 boundary: a row exactly at the window edge is not purged until it passes it", async () => {
    // Deleted 30 days ago minus a minute: still inside a 30-day window.
    const id = await seedTask({ deletedAgo: "30 days" });
    await pool.query(
      `UPDATE tasks SET deleted_at = now() - make_interval(days => 30) + interval '1 minute' WHERE id = $1`,
      [id],
    );

    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });
    expect(await exists(id)).toBe(true);

    // A minute the other side of the edge and it goes.
    await pool.query(
      `UPDATE tasks SET deleted_at = now() - make_interval(days => 30) - interval '1 minute' WHERE id = $1`,
      [id],
    );
    await repo.purgeExpired({ retentionDays: RETENTION, limit: 500 });
    expect(await exists(id)).toBe(false);
  });
});
