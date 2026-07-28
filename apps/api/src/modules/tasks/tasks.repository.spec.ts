import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { DbService } from '../../infra/db.service';
import { TasksRepository } from './tasks.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-010 T2 — TasksRepository: AC-1 (insert lands active, in the path's list,
// owned by the caller), AC-3 (active/completed/soft-deleted partitioning),
// AC-4 (both orders, newest active last), AC-5 (ownership scoping — a foreign or
// unknown listId resolves to nothing, and nothing is inserted), AC-7 (a task
// belongs to that list only and goes with it), AC-9 (timestamptz round-trip).
// AC-2's title validation lives in TasksService and is asserted in T3, per that
// task's own done-when.
const providers = [TasksRepository, DbService];

describe('TasksRepository (integration)', () => {
  let db: DbService;
  let tasks: TasksRepository;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`taskrepo-${randomUUID()}@example.com`],
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

  const addList = async (ownerId: string, name: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position)+1,0) FROM lists WHERE owner_id = $1))
       RETURNING id`,
      [ownerId, name],
    );
    return r.rows[0].id;
  };

  /** Seed a row directly, with control over the state columns this slice reads. */
  const seed = async (
    ownerId: string,
    listId: string,
    title: string,
    state: 'active' | 'completed' | 'soft-deleted',
    completedAt?: string,
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at, deleted_at)
       VALUES ($1, $2, $3,
               ${state === 'completed' ? `$4::timestamptz` : 'NULL'},
               ${state === 'soft-deleted' ? 'now()' : 'NULL'})
       RETURNING id`,
      state === 'completed'
        ? [ownerId, listId, title, completedAt ?? new Date().toISOString()]
        : [ownerId, listId, title],
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    tasks = mod.get(TasksRepository);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query('DELETE FROM users WHERE id = $1', [id]); // cascades lists → tasks
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-1/AC-9: create inserts an active task owned by the caller, in the path list', async () => {
    const { id: owner, inbox } = await freshUser();

    const created = await tasks.create(owner, inbox, 'Buy milk');

    expect(created).toMatchObject({
      listId: inbox,
      title: 'Buy milk',
      completedAt: null, // created active — FR-TASK-001
    });
    expect(created.createdAt).toBeInstanceOf(Date); // timestamptz round-trip
    const row = await db.query<{ owner_id: string; completed_at: Date | null }>(
      'SELECT owner_id, completed_at FROM tasks WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0].owner_id).toBe(owner);
    expect(row.rows[0].completed_at).toBeNull();
  });

  it('AC-3: returns active and completed rows, and never soft-deleted ones', async () => {
    const { id: owner, inbox } = await freshUser();
    await seed(owner, inbox, 'a1', 'active');
    await seed(owner, inbox, 'a2', 'active');
    await seed(owner, inbox, 'c1', 'completed');
    await seed(owner, inbox, 'c2', 'completed');
    await seed(owner, inbox, 'c3', 'completed');
    await seed(owner, inbox, 'gone', 'soft-deleted');

    const rows = await tasks.findByList(owner, inbox);

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.title)).not.toContain('gone');
    expect(rows.filter((r) => r.completedAt === null)).toHaveLength(2);
    expect(rows.filter((r) => r.completedAt !== null)).toHaveLength(3);
  });

  it('AC-4: active rows come first oldest-first; completed follow most-recent-first', async () => {
    const { id: owner, inbox } = await freshUser();
    // Completed seeded out of order to prove the sort, not the insert order.
    await seed(owner, inbox, 'old-done', 'completed', '2026-07-01T10:00:00Z');
    await seed(owner, inbox, 'new-done', 'completed', '2026-07-20T10:00:00Z');
    await seed(owner, inbox, 'mid-done', 'completed', '2026-07-10T10:00:00Z');
    const first = await tasks.create(owner, inbox, 'first');
    const second = await tasks.create(owner, inbox, 'second');

    const rows = await tasks.findByList(owner, inbox);

    expect(rows.map((r) => r.title)).toEqual([
      'first', // active, oldest first
      'second', // ...so a newly created task is last in the active run
      'new-done', // completed, most recently completed first
      'mid-done',
      'old-done',
    ]);
    expect(rows[0].id).toBe(first.id);
    expect(rows[1].id).toBe(second.id);
  });

  it('AC-4: the order is stable across repeated reads', async () => {
    const { id: owner, inbox } = await freshUser();
    for (const t of ['t1', 't2', 't3', 't4'])
      await tasks.create(owner, inbox, t);

    const a = (await tasks.findByList(owner, inbox)).map((r) => r.id);
    const b = (await tasks.findByList(owner, inbox)).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it("AC-5: another owner's list, and an unknown id, both resolve to null", async () => {
    const a = await freshUser();
    const b = await freshUser();
    await tasks.create(b.id, b.inbox, "b's task");

    expect(await tasks.findOwnedList(a.id, b.inbox)).toBeNull();
    expect(await tasks.findOwnedList(a.id, randomUUID())).toBeNull();
    // ...and A cannot read B's rows even naming the list directly
    expect(await tasks.findByList(a.id, b.inbox)).toEqual([]);
    // B's data is untouched
    expect(await tasks.findByList(b.id, b.inbox)).toHaveLength(1);
  });

  it('AC-5: findOwnedList returns the list with the same counts GET /lists reports', async () => {
    const { id: owner, inbox } = await freshUser();
    await seed(owner, inbox, 'a', 'active');
    await seed(owner, inbox, 'c', 'completed');
    await seed(owner, inbox, 'd', 'soft-deleted');

    const list = await tasks.findOwnedList(owner, inbox);

    expect(list).toMatchObject({
      id: inbox,
      name: 'Inbox',
      isDefault: true,
      position: 0,
      activeTaskCount: 1, // incomplete and not soft-deleted
      taskCount: 3,
    });
  });

  it('AC-7: a task belongs to exactly one list, and goes when that list goes', async () => {
    const { id: owner, inbox } = await freshUser();
    const work = await addList(owner, 'Work');
    const inInbox = await tasks.create(owner, inbox, 'inbox task');
    const inWork = await tasks.create(owner, work, 'work task');

    expect((await tasks.findByList(owner, inbox)).map((r) => r.id)).toEqual([
      inInbox.id,
    ]);
    expect((await tasks.findByList(owner, work)).map((r) => r.id)).toEqual([
      inWork.id,
    ]);

    // FEAT-009's cascade, now exercised against contract-created rows
    await db.query('DELETE FROM lists WHERE id = $1', [work]);
    const survivors = await db.query('SELECT id FROM tasks WHERE id = $1', [
      inWork.id,
    ]);
    expect(survivors.rowCount).toBe(0);
    expect(await tasks.findByList(owner, inbox)).toHaveLength(1);
  });

  it('AC-2 (repository half): duplicate titles are permitted', async () => {
    const { id: owner, inbox } = await freshUser();

    const one = await tasks.create(owner, inbox, 'Same title');
    const two = await tasks.create(owner, inbox, 'Same title');

    expect(two.id).not.toBe(one.id);
    expect(await tasks.findByList(owner, inbox)).toHaveLength(2);
  });
});
