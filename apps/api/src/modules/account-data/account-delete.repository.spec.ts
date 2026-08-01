import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AccountDeleteRepository } from './account-delete.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-018 T3 — AccountDeleteRepository: AC-2 (every table emptied by one
// DELETE), AC-8 (a second user is untouched), AC-9 (outbox rows purged),
// AC-10 (a mid-transaction failure deletes nothing).
const providers = [
  AccountDeleteRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('AccountDeleteRepository (integration)', () => {
  let db: DbService;
  let repo: AccountDeleteRepository;
  const userIds: string[] = [];

  /** A user with an Inbox, a second list, four tasks in assorted states, two
   * live sessions and two outbox rows — i.e. every table the deletion must
   * empty, populated. */
  const seedAccount = async (): Promise<{
    id: string;
    email: string;
    inbox: string;
    work: string;
  }> => {
    const email = `deleterepo-${randomUUID()}@example.com`;
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    const id = u.rows[0].id;
    userIds.push(id);

    const inbox = (
      await db.query<{ id: string }>(
        `INSERT INTO lists (owner_id, name, is_default, position)
         VALUES ($1, 'Inbox', true, 0) RETURNING id`,
        [id],
      )
    ).rows[0].id;
    const work = (
      await db.query<{ id: string }>(
        `INSERT INTO lists (owner_id, name, position) VALUES ($1, 'Work', 1)
         RETURNING id`,
        [id],
      )
    ).rows[0].id;

    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, position, completed_at, deleted_at)
       VALUES ($1, $2, 'active',    0, NULL,  NULL),
              ($1, $2, 'completed', 1, now(), NULL),
              ($1, $3, 'in work',   0, NULL,  NULL),
              ($1, $3, 'soft-deleted', 1, NULL, now())`,
      [id, inbox, work],
    );

    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 days'),
              ($1, $3, now() + interval '30 days')`,
      [id, `hash-${randomUUID()}`, `hash-${randomUUID()}`],
    );

    // One pending and one already-sent outbox row (AC-9 covers both).
    await db.query(
      `INSERT INTO email_outbox (type, recipient, payload, status, sent_at)
       VALUES ('verification', $1, $2, 'pending', NULL),
              ('password_reset', $1, $2, 'sent',  now())`,
      [email, JSON.stringify({ token: 'tok', userId: id })],
    );

    return { id, email, inbox, work };
  };

  const countsFor = async (
    userId: string,
    email: string,
  ): Promise<Record<string, number>> => {
    const one = async (sql: string, param: string): Promise<number> => {
      const r = await db.query<{ n: string }>(sql, [param]);
      return Number(r.rows[0].n);
    };
    return {
      users: await one('SELECT count(*) AS n FROM users WHERE id = $1', userId),
      lists: await one(
        'SELECT count(*) AS n FROM lists WHERE owner_id = $1',
        userId,
      ),
      tasks: await one(
        'SELECT count(*) AS n FROM tasks WHERE owner_id = $1',
        userId,
      ),
      sessions: await one(
        'SELECT count(*) AS n FROM sessions WHERE user_id = $1',
        userId,
      ),
      outbox: await one(
        `SELECT count(*) AS n FROM email_outbox WHERE recipient = $1`,
        email,
      ),
    };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    repo = mod.get(AccountDeleteRepository);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query(
        `DELETE FROM email_outbox WHERE payload->>'userId' = $1`,
        [id],
      );
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  describe('findCredential', () => {
    it('reads the stored hash for a live account', async () => {
      const { id } = await seedAccount();

      await expect(repo.findCredential(id)).resolves.toEqual({
        passwordHash: 'x',
      });
    });

    it('returns null for an id with no user row (the session outlived its user)', async () => {
      await expect(repo.findCredential(randomUUID())).resolves.toBeNull();
    });
  });

  describe('deleteAccount (AC-2, FR-DATA-003/005)', () => {
    it('AC-2: one DELETE empties users, lists, tasks (incl. soft-deleted) and sessions', async () => {
      const { id, email } = await seedAccount();
      // The fixture is real before anything is asserted about its removal.
      expect(await countsFor(id, email)).toEqual({
        users: 1,
        lists: 2,
        tasks: 4,
        sessions: 2,
        outbox: 2,
      });

      await expect(repo.deleteAccount(id)).resolves.toBe(true);

      // Asserted per table rather than inferred from the cascade: the
      // correctness of this feature IS the correctness of those FKs (D1).
      expect(await countsFor(id, email)).toEqual({
        users: 0,
        lists: 0,
        tasks: 0,
        sessions: 0,
        outbox: 0,
      });
    });

    it('AC-9: purges the account`s outbox rows — pending and already sent', async () => {
      const { id, email } = await seedAccount();
      const before = await db.query<{ status: string }>(
        `SELECT status FROM email_outbox WHERE payload->>'userId' = $1
         ORDER BY status`,
        [id],
      );
      expect(before.rows.map((r) => r.status)).toEqual(['pending', 'sent']);

      await repo.deleteAccount(id);

      const byId = await db.query(
        `SELECT 1 FROM email_outbox WHERE payload->>'userId' = $1`,
        [id],
      );
      const byRecipient = await db.query(
        `SELECT 1 FROM email_outbox WHERE recipient = $1`,
        [email],
      );
      expect(byId.rowCount).toBe(0);
      expect(byRecipient.rowCount).toBe(0);
    });

    it('AC-8: another account keeps every one of its rows', async () => {
      const victim = await seedAccount();
      const bystander = await seedAccount();

      await repo.deleteAccount(victim.id);

      expect(await countsFor(bystander.id, bystander.email)).toEqual({
        users: 1,
        lists: 2,
        tasks: 4,
        sessions: 2,
        outbox: 2,
      });
    });

    it('returns false when the row is already gone (a concurrent second delete)', async () => {
      const { id } = await seedAccount();
      await repo.deleteAccount(id);

      await expect(repo.deleteAccount(id)).resolves.toBe(false);
    });

    it('AC-10: a failure after the outbox delete rolls the whole transaction back', async () => {
      const { id, email } = await seedAccount();

      await expect(
        repo.deleteAccount(id, () => {
          throw new Error('boom mid-transaction');
        }),
      ).rejects.toThrow('boom mid-transaction');

      // Nothing partially deleted — including the outbox rows, which the
      // statement before the failure had already removed inside the tx.
      expect(await countsFor(id, email)).toEqual({
        users: 1,
        lists: 2,
        tasks: 4,
        sessions: 2,
        outbox: 2,
      });
    });
  });
});
