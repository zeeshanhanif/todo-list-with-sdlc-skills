import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AccountExportRepository } from './account-export.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-017 T2 — AccountExportRepository: AC-2 (every list, incl. an empty one,
// in order), AC-3 (active + completed both read), AC-4 (soft-deleted excluded),
// AC-5 (a second user's rows never appear), AC-9 (one REPEATABLE READ snapshot).
const providers = [
  AccountExportRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('AccountExportRepository (integration)', () => {
  let db: DbService;
  let repo: AccountExportRepository;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`exportrepo-${randomUUID()}@example.com`],
    );
    const id = u.rows[0].id;
    userIds.push(id);
    const l = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, is_default, position)
       VALUES ($1, 'Inbox', true, 0) RETURNING id`,
      [id],
    );
    return { id, inbox: l.rows[0].id };
  };

  const addList = async (
    ownerId: string,
    name: string,
    position: number,
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, position) VALUES ($1, $2, $3)
       RETURNING id`,
      [ownerId, name, position],
    );
    return r.rows[0].id;
  };

  const seed = async (
    ownerId: string,
    listId: string,
    title: string,
    opts: {
      completed?: boolean;
      deleted?: boolean;
      position?: number;
      dueAt?: string | null;
    } = {},
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, position, due_at,
                          completed_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz,
               ${opts.completed ? 'now()' : 'NULL'},
               ${opts.deleted ? 'now()' : 'NULL'})
       RETURNING id`,
      [ownerId, listId, title, opts.position ?? 0, opts.dueAt ?? null],
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    repo = mod.get(AccountExportRepository);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  describe('the account row (FR-DATA-001)', () => {
    it('reads the five content/preference columns and no others', async () => {
      const { id } = await freshUser();
      await db.query(
        `UPDATE users SET display_name = 'Sam', timezone = 'Asia/Calcutta',
                          theme = 'dark' WHERE id = $1`,
        [id],
      );

      const { account } = await repo.readAll(id);

      expect(account?.email).toContain('exportrepo-');
      expect(account?.displayName).toBe('Sam');
      expect(account?.timezone).toBe('Asia/Calcutta');
      expect(account?.theme).toBe('dark');
      expect(account?.createdAt).toBeInstanceOf(Date);
      // The key set is asserted exhaustively on purpose: a credential column
      // added to this projection later would fail here rather than reach a
      // downloaded file.
      expect(Object.keys(account!).sort()).toEqual([
        'createdAt',
        'displayName',
        'email',
        'theme',
        'timezone',
      ]);
    });

    it('returns a null account for an unknown user rather than throwing', async () => {
      const { account, lists, tasks } = await repo.readAll(randomUUID());

      expect(account).toBeNull();
      expect(lists).toEqual([]);
      expect(tasks).toEqual([]);
    });
  });

  describe('lists (AC-2, FR-DATA-002)', () => {
    it('AC-2: returns every list — including one holding no tasks — in position order', async () => {
      const { id, inbox } = await freshUser();
      const work = await addList(id, 'Work', 1);
      const empty = await addList(id, 'Someday', 2);
      await seed(id, inbox, 'Buy milk');
      await seed(id, work, 'Ship the thing');

      const { lists } = await repo.readAll(id);

      expect(lists.map((l) => l.name)).toEqual(['Inbox', 'Work', 'Someday']);
      expect(lists.map((l) => l.id)).toEqual([inbox, work, empty]);
      expect(lists[0].isDefault).toBe(true);
      expect(lists[1].isDefault).toBe(false);
      expect(lists[0].createdAt).toBeInstanceOf(Date);
      expect(lists[0].updatedAt).toBeInstanceOf(Date);
    });

    it('AC-2: orders by created_at when positions tie', async () => {
      const { id } = await freshUser();
      // Both at position 0, alongside the Inbox — the tiebreaker decides.
      await db.query(
        `INSERT INTO lists (owner_id, name, position, created_at)
         VALUES ($1, 'Later', 0, now() + interval '1 second'),
                ($1, 'Sooner', 0, now() + interval '500 milliseconds')`,
        [id],
      );

      const { lists } = await repo.readAll(id);

      expect(lists.map((l) => l.name)).toEqual(['Inbox', 'Sooner', 'Later']);
    });
  });

  describe('tasks (AC-3, AC-4, FR-DATA-002)', () => {
    it('AC-3: returns active and completed tasks, with the columns the export carries', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'Active one', {
        position: 0,
        dueAt: '2026-09-01T09:00:00Z',
      });
      await seed(id, inbox, 'Done one', { completed: true, position: 1 });

      const { tasks } = await repo.readAll(id);

      expect(tasks.map((t) => t.title)).toEqual(['Active one', 'Done one']);
      expect(tasks[0].completedAt).toBeNull();
      expect(tasks[0].dueAt).toBeInstanceOf(Date);
      expect(tasks[0].listId).toBe(inbox);
      expect(tasks[0].priority).toBe('none');
      expect(tasks[1].completedAt).toBeInstanceOf(Date);
    });

    it('AC-4: excludes a soft-deleted task and nothing else', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'Kept', { position: 0 });
      await seed(id, inbox, 'Trashed', { deleted: true, position: 1 });
      await seed(id, inbox, 'Kept and done', { completed: true, position: 2 });
      // A task that is BOTH completed and soft-deleted is still out: deleted
      // wins, which is the rule every other read path applies.
      await seed(id, inbox, 'Trashed after finishing', {
        completed: true,
        deleted: true,
        position: 3,
      });

      const { tasks } = await repo.readAll(id);

      expect(tasks.map((t) => t.title)).toEqual(['Kept', 'Kept and done']);
    });

    it('AC-3: groups by list and orders within a list by position', async () => {
      const { id, inbox } = await freshUser();
      const work = await addList(id, 'Work', 1);
      await seed(id, inbox, 'Inbox second', { position: 1 });
      await seed(id, inbox, 'Inbox first', { position: 0 });
      await seed(id, work, 'Work first', { position: 0 });

      const { tasks } = await repo.readAll(id);
      const byList = new Map<string, string[]>();
      for (const t of tasks) {
        byList.set(t.listId, [...(byList.get(t.listId) ?? []), t.title]);
      }

      expect(byList.get(inbox)).toEqual(['Inbox first', 'Inbox second']);
      expect(byList.get(work)).toEqual(['Work first']);
    });
  });

  describe('ownership (AC-5, FR-AUTHZ-002/003)', () => {
    it("AC-5: never returns another account's lists or tasks", async () => {
      const mine = await freshUser();
      const theirs = await freshUser();
      await addList(theirs.id, 'Their secret list', 1);
      await seed(theirs.id, theirs.inbox, 'Their secret task');
      await seed(mine.id, mine.inbox, 'My task');

      const { lists, tasks } = await repo.readAll(mine.id);

      expect(lists.map((l) => l.name)).toEqual(['Inbox']);
      expect(lists.map((l) => l.id)).not.toContain(theirs.inbox);
      expect(tasks.map((t) => t.title)).toEqual(['My task']);
    });
  });

  describe('snapshot consistency (AC-9, D8)', () => {
    it('AC-9: a write landing mid-export is not half-seen — one snapshot, not three', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'Present at snapshot time');

      // Commits from a SEPARATE connection while the export transaction is
      // open, after its snapshot has been fixed by the first read. Under
      // READ COMMITTED the later statements would see these; under
      // REPEATABLE READ they must not.
      const { lists, tasks } = await repo.readAll(id, async () => {
        const late = await db.query<{ id: string }>(
          `INSERT INTO lists (owner_id, name, position) VALUES ($1, 'Late list', 9)
           RETURNING id`,
          [id],
        );
        await db.query(
          `INSERT INTO tasks (owner_id, list_id, title, position)
           VALUES ($1, $2, 'Late task', 0)`,
          [id, late.rows[0].id],
        );
      });

      expect(lists.map((l) => l.name)).toEqual(['Inbox']);
      expect(tasks.map((t) => t.title)).toEqual(['Present at snapshot time']);

      // And the writes really did commit — otherwise this test would pass for
      // the wrong reason, which is the failure mode an isolation test is most
      // prone to.
      const after = await repo.readAll(id);
      expect(after.lists.map((l) => l.name)).toEqual(['Inbox', 'Late list']);
      // Sorted, not sequential: `ORDER BY list_id` groups rows by list, and
      // `list_id` is a random UUID — the order BETWEEN lists is arbitrary and
      // the service re-groups into the order `lists` returns. Asserting a
      // cross-list sequence here would be asserting a promise the SQL does not
      // make.
      expect(after.tasks.map((t) => t.title).sort()).toEqual([
        'Late task',
        'Present at snapshot time',
      ]);
    });
  });
});
