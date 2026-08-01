import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AccountDeleteRepository } from './account-delete.repository';

// FEAT-018 T9 — AC-14 at the NFR-SCAL-002 ceiling: an account holding 100 lists
// and 5,000 tasks is deleted inside the 2 s budget, leaving zero rows on every
// one of its tables.
//
// Separate from the repository's own spec because the seeding dominates its
// runtime, and because this is the criterion the whole "one DELETE, let the
// cascades do it" decision (D1) rests on: an application-level per-table delete
// would show up here first.
const LISTS = 100;
const TASKS = 5_000;
const BUDGET_MS = 2_000;

describe('AccountDeleteRepository at the scalability ceiling (AC-14)', () => {
  let db: DbService;
  let repo: AccountDeleteRepository;
  let userId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        AccountDeleteRepository,
        DbService,
        { provide: APP_CONFIG, useFactory: readConfig },
      ],
    }).compile();
    db = mod.get(DbService);
    repo = mod.get(AccountDeleteRepository);

    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`deletescale-${randomUUID()}@example.com`],
    );
    userId = u.rows[0].id;

    await db.query(
      `INSERT INTO lists (owner_id, name, position)
       SELECT $1, 'List ' || g, g FROM generate_series(1, $2) g`,
      [userId, LISTS],
    );
    // Spread evenly across the lists, a tenth of them soft-deleted — those are
    // destroyed too, and they are the rows a naive "delete the live ones" would
    // leave behind.
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, position, deleted_at)
       SELECT $1,
              l.id,
              'Task ' || g,
              g,
              CASE WHEN g % 10 = 0 THEN now() ELSE NULL END
         FROM generate_series(1, $2) g
         JOIN LATERAL (
           SELECT id FROM lists
            WHERE owner_id = $1
            ORDER BY position
            OFFSET (g % $3) LIMIT 1
         ) l ON true`,
      [userId, TASKS, LISTS],
    );
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       SELECT $1, 'scale-' || g || '-' || $2, now() + interval '30 days'
         FROM generate_series(1, 3) g`,
      [userId, randomUUID()],
    );
  }, 120_000);

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.onModuleDestroy();
  });

  it('AC-14: deletes 100 lists / 5,000 tasks within the 2 s budget, leaving nothing', async () => {
    const seeded = await counts(db, userId);
    // The fixture is real before anything is claimed about destroying it.
    expect(seeded).toEqual({
      users: 1,
      lists: LISTS,
      tasks: TASKS,
      sessions: 3,
    });

    const started = Date.now();
    const deleted = await repo.deleteAccount(userId);
    const elapsed = Date.now() - started;

    expect(deleted).toBe(true);
    expect(await counts(db, userId)).toEqual({
      users: 0,
      lists: 0,
      tasks: 0,
      sessions: 0,
    });

    console.log(
      `AC-14: ${LISTS} lists / ${TASKS} tasks deleted in ${elapsed} ms (budget ${BUDGET_MS} ms)`,
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 60_000);
});

const counts = async (
  db: DbService,
  userId: string,
): Promise<Record<string, number>> => {
  const r = await db.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM users    WHERE id       = $1) AS users,
            (SELECT count(*) FROM lists    WHERE owner_id = $1) AS lists,
            (SELECT count(*) FROM tasks    WHERE owner_id = $1) AS tasks,
            (SELECT count(*) FROM sessions WHERE user_id  = $1) AS sessions`,
    [userId],
  );
  const row = r.rows[0];
  return {
    users: Number(row.users),
    lists: Number(row.lists),
    tasks: Number(row.tasks),
    sessions: Number(row.sessions),
  };
};
