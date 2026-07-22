import { randomUUID } from "crypto";
import { Pool } from "pg";
import { OutboxRepository } from "./outbox.repository";

// Integration test (needs local Postgres; schema via jest globalSetup).
// Covers claimDue gating (AC-5) and the mark operations (AC-4 backoff schedule).
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const CLAIM = { limit: 50, backoffBaseSeconds: 60, backoffCapSeconds: 3600 };

describe("OutboxRepository (integration)", () => {
  let pool: Pool;
  let repo: OutboxRepository;
  const marker = `obx-${randomUUID()}`;

  const insert = async (
    over: { type?: string; status?: string; nextAttemptAt?: string | null } = {},
  ): Promise<string> => {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO email_outbox (type, recipient, payload, status, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        over.type ?? "verification",
        `${marker}@example.com`,
        JSON.stringify({ token: "t", userId: "u" }),
        over.status ?? "pending",
        over.nextAttemptAt ?? null,
      ],
    );
    return res.rows[0].id;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: DB });
    repo = new OutboxRepository(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM email_outbox WHERE recipient = $1`, [
      `${marker}@example.com`,
    ]);
    await pool.end();
  });

  it("claims a due pending row, incrementing attempts and scheduling the next retry (AC-4)", async () => {
    const id = await insert({}); // pending, due now (next_attempt_at NULL)
    const claimed = await repo.claimDue(CLAIM);
    const mine = claimed.find((r) => r.id === id);
    expect(mine).toBeDefined();
    expect(mine!.attempts).toBe(1);
    const row = await pool.query<{ next_attempt_at: Date }>(
      `SELECT next_attempt_at FROM email_outbox WHERE id = $1`,
      [id],
    );
    // backoff = base * 2^0 = 60s in the future
    const deltaMs = new Date(row.rows[0].next_attempt_at).getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(30_000);
    expect(deltaMs).toBeLessThan(90_000);
  });

  it("does not claim a row whose next_attempt_at is in the future (AC-5)", async () => {
    const id = await insert({}); // pending
    await pool.query(
      `UPDATE email_outbox SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`,
      [id],
    );
    const claimed = await repo.claimDue(CLAIM);
    expect(claimed.find((r) => r.id === id)).toBeUndefined();
  });

  it("does not claim a sent row (AC-5)", async () => {
    const id = await insert({ status: "sent" });
    const claimed = await repo.claimDue(CLAIM);
    expect(claimed.find((r) => r.id === id)).toBeUndefined();
  });

  it("markSent sets status=sent and sent_at", async () => {
    const id = await insert({});
    await repo.markSent(id);
    const r = await pool.query<{ status: string; sent_at: Date | null }>(
      `SELECT status, sent_at FROM email_outbox WHERE id = $1`,
      [id],
    );
    expect(r.rows[0].status).toBe("sent");
    expect(r.rows[0].sent_at).not.toBeNull();
  });

  it("markFailed dead-letters (status=failed) with last_error", async () => {
    const id = await insert({});
    await repo.markFailed(id, "smtp exploded");
    const r = await pool.query<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM email_outbox WHERE id = $1`,
      [id],
    );
    expect(r.rows[0].status).toBe("failed");
    expect(r.rows[0].last_error).toBe("smtp exploded");
  });

  it("recordRetry keeps status=pending and records last_error", async () => {
    const id = await insert({});
    await repo.recordRetry(id, "temporary blip");
    const r = await pool.query<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM email_outbox WHERE id = $1`,
      [id],
    );
    expect(r.rows[0].status).toBe("pending");
    expect(r.rows[0].last_error).toBe("temporary blip");
  });
});
