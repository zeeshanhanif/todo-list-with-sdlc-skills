import { randomUUID } from "crypto";
import { Logger } from "@nestjs/common";
import { Pool } from "pg";
import type { WorkerConfig } from "../config";
import { PurgeRepository } from "./purge.repository";
import { TaskPurgeService } from "./task-purge.service";

// Integration test (needs local Postgres; schema via jest globalSetup).
// Covers the batch loop and the run summary — FEAT-020 design §6 AC-7, AC-8.
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";

const config = (over: Partial<WorkerConfig> = {}): WorkerConfig =>
  ({
    taskRetentionDays: 30,
    purgeBatchSize: 500,
    ...over,
  }) as WorkerConfig;

describe("TaskPurgeService (integration)", () => {
  let pool: Pool;
  let repo: PurgeRepository;
  const email = `purge-svc-${randomUUID()}@example.com`;
  let ownerId: string;
  let listId: string;

  /** Seed `n` tasks soft-deleted well outside the window. */
  const seedExpired = async (n: number): Promise<void> => {
    await pool.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       SELECT $1, $2, 'purge svc fixture', now() - make_interval(days => 31)
         FROM generate_series(1, $3)`,
      [ownerId, listId, n],
    );
  };

  const remaining = async (): Promise<number> => {
    const res = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM tasks WHERE owner_id = $1`,
      [ownerId],
    );
    return Number(res.rows[0].n);
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB });
    repo = new PurgeRepository(pool);
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

  afterEach(async () => {
    await pool.query(`DELETE FROM tasks WHERE owner_id = $1`, [ownerId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await pool.end();
  });

  it("AC-7: purges every expired row when there are more of them than one batch holds", async () => {
    await seedExpired(25);
    // A batch size that cannot clear the set in one pass — the loop has to run
    // at least three times, which is the property under test.
    const service = new TaskPurgeService(repo, config({ purgeBatchSize: 10 }));

    const result = await service.purge();

    expect(result.purged).toBe(25);
    expect(await remaining()).toBe(0);
  });

  it("AC-7: stops cleanly when nothing is expired, deleting nothing", async () => {
    await pool.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       VALUES ($1, $2, 'still in window', now() - make_interval(days => 2))`,
      [ownerId, listId],
    );
    const service = new TaskPurgeService(repo, config());

    const result = await service.purge();

    expect(result.purged).toBe(0);
    expect(await remaining()).toBe(1);
  });

  it("AC-8: emits one structured summary line carrying the purged count", async () => {
    await seedExpired(3);
    const logged: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation((msg: unknown) => {
        logged.push(String(msg));
      });
    const service = new TaskPurgeService(repo, config());

    try {
      await service.purge();
    } finally {
      spy.mockRestore();
    }

    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0])).toEqual({
      msg: "task purge complete",
      purged: 3,
    });
  });

  it("AC-7: an overlapping run skips rows another pass holds instead of blocking on them", async () => {
    await seedExpired(20);
    // Stand in for a slow concurrent job run: a transaction holding row locks on
    // part of the expired set. Without FOR UPDATE SKIP LOCKED the purge would
    // wait on these until this transaction ends — with it, the purge steps over
    // them and clears the rest, which is the property under test. (Racing two
    // purge() calls would NOT prove this: a blocking delete still sums to 20.)
    const holder = await pool.connect();
    let purged: number;
    try {
      await holder.query("BEGIN");
      const held = await holder.query<{ id: string }>(
        `SELECT id FROM tasks WHERE owner_id = $1 ORDER BY id LIMIT 6 FOR UPDATE`,
        [ownerId],
      );
      expect(held.rowCount).toBe(6);

      const service = new TaskPurgeService(repo, config());
      // Resolves promptly rather than waiting on the open transaction.
      ({ purged } = await service.purge());

      expect(purged).toBe(14);
      expect(await remaining()).toBe(6);
      await holder.query("ROLLBACK");
    } finally {
      holder.release();
    }

    // Once the lock is gone, the next run collects the skipped remainder — the
    // rows were deferred, never lost.
    const after = await new TaskPurgeService(repo, config()).purge();
    expect(after.purged).toBe(6);
    expect(await remaining()).toBe(0);
  });
});
