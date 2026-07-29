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

  // ---------------------------------------------------------------------------
  // FEAT-011 T3 — due date, priority, by-id read, partial update.
  // ---------------------------------------------------------------------------

  /** Read the columns straight from the table, so assertions about what was
   * STORED never route through the same mapper they are checking. */
  const storedRow = async (id: string) => {
    const r = await db.query<{
      title: string;
      due_at: Date | null;
      priority: string;
      updated_at: Date;
      completed_at: Date | null;
    }>(
      'SELECT title, due_at, priority, updated_at, completed_at FROM tasks WHERE id = $1',
      [id],
    );
    return r.rows[0];
  };

  it('AC-3: create stores a due date, and update sets then changes it', async () => {
    const { id: owner, inbox } = await freshUser();
    const first = '2026-08-01T09:00:00.000Z';
    const second = '2026-09-15T17:30:00.000Z';

    const created = await tasks.create(owner, inbox, 'Dentist', {
      dueAt: new Date(first),
    });
    expect(created.dueAt?.toISOString()).toBe(first);

    const changed = await tasks.update(owner, created.id, {
      dueAt: new Date(second),
    });
    expect(changed?.dueAt?.toISOString()).toBe(second);
    expect((await storedRow(created.id)).due_at?.toISOString()).toBe(second);
  });

  it('AC-4: dueAt null clears the column; an ABSENT dueAt leaves it alone', async () => {
    const { id: owner, inbox } = await freshUser();
    const due = new Date('2026-08-01T09:00:00.000Z');
    const task = await tasks.create(owner, inbox, 'Dentist', { dueAt: due });

    // A patch that does not mention dueAt must not disturb it — this is the
    // absent-vs-null distinction the whole PATCH contract rests on (D4).
    const afterTitleOnly = await tasks.update(owner, task.id, {
      title: 'Dentist appointment',
    });
    expect(afterTitleOnly?.dueAt?.toISOString()).toBe(due.toISOString());
    expect((await storedRow(task.id)).due_at).not.toBeNull();

    // An explicit null clears it.
    const afterClear = await tasks.update(owner, task.id, { dueAt: null });
    expect(afterClear?.dueAt).toBeNull();
    expect((await storedRow(task.id)).due_at).toBeNull();
  });

  it('AC-6: priority stores each of the four values, and defaults to none from the COLUMN', async () => {
    const { id: owner, inbox } = await freshUser();

    // The default is the column's, not the application's: created without a
    // priority, the stored value is 'none'.
    const plain = await tasks.create(owner, inbox, 'No priority given');
    expect(plain.priority).toBe('none');
    expect((await storedRow(plain.id)).priority).toBe('none');

    for (const p of ['none', 'low', 'medium', 'high'] as const) {
      const t = await tasks.create(owner, inbox, `p-${p}`, { priority: p });
      expect(t.priority).toBe(p);
      expect((await storedRow(t.id)).priority).toBe(p);

      const flipped = await tasks.update(owner, t.id, { priority: 'high' });
      expect(flipped?.priority).toBe('high');
    }
  });

  it('AC-6: the CHECK constraint rejects a priority outside the four values', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Guarded');

    // The service validates first, but the column is the last line of defence —
    // if the constraint ever went missing this test, not a user, finds out.
    await expect(
      db.query('UPDATE tasks SET priority = $2 WHERE id = $1', [
        task.id,
        'urgent',
      ]),
    ).rejects.toThrow(/tasks_priority_check/);
  });

  it('AC-7: a single-field patch leaves the other two byte-identical', async () => {
    const { id: owner, inbox } = await freshUser();
    const due = new Date('2026-08-01T09:00:00.000Z');
    const task = await tasks.create(owner, inbox, 'Original', {
      dueAt: due,
      priority: 'medium',
    });

    const afterTitle = await tasks.update(owner, task.id, { title: 'Renamed' });
    expect(afterTitle).toMatchObject({
      title: 'Renamed',
      priority: 'medium',
    });
    expect(afterTitle?.dueAt?.toISOString()).toBe(due.toISOString());

    const afterPriority = await tasks.update(owner, task.id, {
      priority: 'low',
    });
    expect(afterPriority).toMatchObject({ title: 'Renamed', priority: 'low' });
    expect(afterPriority?.dueAt?.toISOString()).toBe(due.toISOString());

    const afterDue = await tasks.update(owner, task.id, { dueAt: null });
    expect(afterDue).toMatchObject({ title: 'Renamed', priority: 'low' });
    expect(afterDue?.dueAt).toBeNull();
  });

  it('AC-7: an empty patch is refused outright, so nothing — not even updated_at — moves', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Untouched');
    const before = await storedRow(task.id);

    await expect(tasks.update(owner, task.id, {})).rejects.toThrow(
      /empty patch/,
    );

    const after = await storedRow(task.id);
    expect(after.updated_at.toISOString()).toBe(
      before.updated_at.toISOString(),
    );
  });

  it('AC-8: findById and update are owner-scoped, and soft-deleted rows are gone from both', async () => {
    const { id: ownerA, inbox: inboxA } = await freshUser();
    const { id: ownerB } = await freshUser();
    const task = await tasks.create(ownerA, inboxA, "A's task", {
      priority: 'high',
    });

    // Owner A can read it.
    expect(await tasks.findById(ownerA, task.id)).toMatchObject({
      title: "A's task",
    });

    // Owner B gets the same nothing as for an id that does not exist...
    expect(await tasks.findById(ownerB, task.id)).toBeNull();
    expect(await tasks.findById(ownerB, randomUUID())).toBeNull();

    // ...and cannot write it either. The row must be untouched afterwards.
    expect(
      await tasks.update(ownerB, task.id, { title: 'hijacked' }),
    ).toBeNull();
    expect((await storedRow(task.id)).title).toBe("A's task");

    // Soft-deleting it takes it out of both, for its own owner (FEAT-013 owns
    // restore; until then a deleted task is simply not found).
    await db.query('UPDATE tasks SET deleted_at = now() WHERE id = $1', [
      task.id,
    ]);
    expect(await tasks.findById(ownerA, task.id)).toBeNull();
    expect(await tasks.update(ownerA, task.id, { title: 'x' })).toBeNull();
    expect((await storedRow(task.id)).title).toBe("A's task");
  });

  // --- FEAT-012 T2 — setCompletion (FR-TASK-009/010) ---

  it('FEAT-012 AC-1: completing stores a completion instant inside the request window', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Ship it');
    expect(task.completedAt).toBeNull(); // fixture precondition, asserted

    const before = Date.now();
    const done = await tasks.setCompletion(owner, task.id, true);
    const after = Date.now();

    expect(done?.completedAt).toBeInstanceOf(Date);
    const at = done!.completedAt!.getTime();
    // No earlier than the request, no later than the response — the server's
    // clock, never a client's (technical-design §3.1).
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(after + 1000);
    expect((await storedRow(task.id)).completed_at?.toISOString()).toBe(
      done!.completedAt!.toISOString(),
    );
  });

  it('FEAT-012 AC-2: reopening clears it, and neither transition disturbs any other column', async () => {
    const { id: owner, inbox } = await freshUser();
    const due = new Date('2026-09-01T08:30:00.000Z');
    const task = await tasks.create(owner, inbox, 'Round trip', {
      dueAt: due,
      priority: 'high',
    });
    const original = await storedRow(task.id);

    const done = await tasks.setCompletion(owner, task.id, true);
    expect(done?.completedAt).not.toBeNull();

    const reopened = await tasks.setCompletion(owner, task.id, false);
    expect(reopened?.completedAt).toBeNull();
    expect((await storedRow(task.id)).completed_at).toBeNull();

    // Byte-identical everywhere else, across BOTH transitions.
    expect(reopened).toMatchObject({
      id: task.id,
      listId: task.listId,
      title: original.title,
      priority: original.priority,
    });
    expect(reopened?.dueAt?.toISOString()).toBe(due.toISOString());
    expect(reopened?.createdAt.toISOString()).toBe(
      task.createdAt.toISOString(),
    );
  });

  it('FEAT-012 AC-5: a repeat complete keeps the ORIGINAL instant; a repeat reopen is a no-op', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Idempotent');

    const first = await tasks.setCompletion(owner, task.id, true);
    await new Promise((r) => setTimeout(r, 25)); // ensure now() would differ
    const second = await tasks.setCompletion(owner, task.id, true);

    // COALESCE(completed_at, now()) — not a re-stamp. Asserted at the ROW, so
    // this cannot pass on a response the service happened to echo back.
    expect(second?.completedAt?.toISOString()).toBe(
      first!.completedAt!.toISOString(),
    );
    expect((await storedRow(task.id)).completed_at?.toISOString()).toBe(
      first!.completedAt!.toISOString(),
    );

    await tasks.setCompletion(owner, task.id, false);
    const reopenedTwice = await tasks.setCompletion(owner, task.id, false);
    expect(reopenedTwice?.completedAt).toBeNull();
    expect((await storedRow(task.id)).completed_at).toBeNull();
  });

  it("FEAT-012 AC-7: another owner's, an unknown and a soft-deleted id are all null, and write nothing", async () => {
    const { id: ownerA, inbox } = await freshUser();
    const { id: ownerB } = await freshUser();
    const task = await tasks.create(ownerA, inbox, "A's task");
    const untouched = await storedRow(task.id);

    // Not owned, and unknown — the same null, and the row is unmodified.
    expect(await tasks.setCompletion(ownerB, task.id, true)).toBeNull();
    expect(await tasks.setCompletion(ownerA, randomUUID(), true)).toBeNull();
    let now = await storedRow(task.id);
    expect(now.completed_at).toBeNull();
    expect(now.updated_at.toISOString()).toBe(
      untouched.updated_at.toISOString(),
    );

    // Soft-deleted — not found even for its own owner (FEAT-013 owns restore).
    await db.query('UPDATE tasks SET deleted_at = now() WHERE id = $1', [
      task.id,
    ]);
    const beforeDeletedAttempt = await storedRow(task.id);
    expect(await tasks.setCompletion(ownerA, task.id, true)).toBeNull();
    expect(await tasks.setCompletion(ownerA, task.id, false)).toBeNull();
    now = await storedRow(task.id);
    expect(now.completed_at).toBeNull();
    expect(now.updated_at.toISOString()).toBe(
      beforeDeletedAttempt.updated_at.toISOString(),
    );
  });

  it('AC-11: a non-UTC offset is stored as the same instant and read back in UTC', async () => {
    const { id: owner, inbox } = await freshUser();
    // 09:00+05:00 is 04:00Z — the same moment, written a different way.
    const task = await tasks.create(owner, inbox, 'Offset', {
      dueAt: new Date('2026-08-01T09:00:00.000+05:00'),
    });

    expect(task.dueAt).toBeInstanceOf(Date);
    expect(task.dueAt?.toISOString()).toBe('2026-08-01T04:00:00.000Z');
    expect((await storedRow(task.id)).due_at?.toISOString()).toBe(
      '2026-08-01T04:00:00.000Z',
    );
  });
});
