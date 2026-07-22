import { randomUUID } from "crypto";
import { Logger } from "@nestjs/common";
import { Pool } from "pg";
import type { WorkerConfig } from "../config";
import type { EmailPort, EmailMessage } from "../email/email.port";
import { EmailRenderer } from "../email/email-renderer";
import { OutboxRepository } from "./outbox.repository";
import { OutboxDrainService } from "./outbox-drain.service";

// Integration test (local Postgres via jest globalSetup; worker runs --runInBand
// so specs don't race on email_outbox). Covers AC-1, AC-2, AC-3, AC-5, AC-6, AC-8.
const DB =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";

const baseConfig: WorkerConfig = {
  databaseUrl: DB,
  emailProvider: "log",
  smtpUrl: undefined,
  emailFrom: "from@todo.local",
  publicAppUrl: "https://app.todo.test",
  emailMaxAttempts: 5,
  emailBatchSize: 50,
  backoffBaseSeconds: 60,
  backoffCapSeconds: 3600,
};

describe("OutboxDrainService (integration)", () => {
  let pool: Pool;
  let repo: OutboxRepository;
  const renderer = new EmailRenderer({ publicAppUrl: baseConfig.publicAppUrl });
  const marker = `drain-${randomUUID()}`;

  const okPort = (): EmailPort & { sent: EmailMessage[] } => {
    const sent: EmailMessage[] = [];
    return { sent, send: jest.fn(async (m: EmailMessage) => void sent.push(m)) };
  };
  const failPort = (): EmailPort =>
    ({ send: jest.fn().mockRejectedValue(new Error("smtp down")) }) as EmailPort;

  const insert = async (o: {
    n: number;
    type?: string;
    status?: string;
    futureDue?: boolean;
  }): Promise<string> => {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO email_outbox (type, recipient, payload, status, next_attempt_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        o.type ?? "verification",
        `${marker}-${o.n}@example.com`,
        JSON.stringify({ token: `tok-${o.n}`, userId: "u" }),
        o.status ?? "pending",
        o.futureDue ? new Date(Date.now() + 3600_000).toISOString() : null,
      ],
    );
    return res.rows[0].id;
  };
  const rowById = async (id: string) =>
    (
      await pool.query<{
        status: string;
        attempts: number;
        sent_at: Date | null;
        last_error: string | null;
        next_attempt_at: Date | null;
      }>(`SELECT status, attempts, sent_at, last_error, next_attempt_at FROM email_outbox WHERE id=$1`, [id])
    ).rows[0];

  beforeAll(() => {
    pool = new Pool({ connectionString: DB });
    repo = new OutboxRepository(pool);
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM email_outbox WHERE recipient LIKE $1`, [`${marker}-%`]);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("AC-1/AC-8: sends a pending verification row, marks it sent, returns a summary", async () => {
    const id = await insert({ n: 1, type: "verification" });
    const port = okPort();
    const result = await new OutboxDrainService(repo, renderer, port, baseConfig).drain();

    const mine = port.sent.find((m) => m.to === `${marker}-1@example.com`);
    expect(mine).toBeDefined();
    expect(mine!.text).toContain("https://app.todo.test/verify?token=tok-1");
    const row = await rowById(id);
    expect(row.status).toBe("sent");
    expect(row.sent_at).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        sent: expect.any(Number),
        retried: expect.any(Number),
        deadLettered: expect.any(Number),
      }),
    );
    expect(result.sent).toBeGreaterThanOrEqual(1);
  });

  it("AC-6: sends a password_reset row with the reset link", async () => {
    await insert({ n: 2, type: "password_reset" });
    const port = okPort();
    await new OutboxDrainService(repo, renderer, port, baseConfig).drain();
    const mine = port.sent.find((m) => m.to === `${marker}-2@example.com`);
    expect(mine).toBeDefined();
    expect(mine!.text).toContain("https://app.todo.test/reset-password?token=tok-2");
  });

  it("AC-2: on send failure the row is retried (still pending, attempts up, backoff scheduled) — not lost", async () => {
    const id = await insert({ n: 3 });
    const result = await new OutboxDrainService(repo, renderer, failPort(), baseConfig).drain();
    const row = await rowById(id);
    expect(row.status).toBe("pending"); // retained, not sent
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe("smtp down");
    expect(new Date(row.next_attempt_at!).getTime()).toBeGreaterThan(Date.now());
    expect(result.retried).toBeGreaterThanOrEqual(1);
  });

  it("AC-3: after max attempts the row is dead-lettered and logged", async () => {
    const errSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
    const id = await insert({ n: 4 });
    const cfg = { ...baseConfig, emailMaxAttempts: 1 }; // dead-letter on first failure
    const result = await new OutboxDrainService(repo, renderer, failPort(), cfg).drain();
    const row = await rowById(id);
    expect(row.status).toBe("failed");
    expect(result.deadLettered).toBeGreaterThanOrEqual(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("dead-lettered"));
    errSpy.mockRestore();
  });

  it("AC-5: never touches a sent row or one whose next_attempt_at is in the future", async () => {
    await insert({ n: 5, status: "sent" });
    const futureId = await insert({ n: 6, futureDue: true });
    const port = okPort();
    await new OutboxDrainService(repo, renderer, port, baseConfig).drain();
    expect(port.sent.some((m) => m.to === `${marker}-5@example.com`)).toBe(false);
    expect(port.sent.some((m) => m.to === `${marker}-6@example.com`)).toBe(false);
    expect((await rowById(futureId)).status).toBe("pending"); // untouched
  });
});
