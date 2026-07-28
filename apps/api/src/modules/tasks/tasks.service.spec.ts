import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { TASK_TITLE_MAX_LENGTH } from '@todo/shared';
import { DbService } from '../../infra/db.service';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { ListNotFoundError, TaskTitleInvalidError } from './tasks.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-010 T3 — TasksService, the same AC set as T2 asserted through the wire
// shapes: AC-1 (created active in the path list), AC-2 (FR-TASK-002 validation
// — the half the repository can't do), AC-3 (server-side split), AC-4 (orders),
// AC-5 (foreign/unknown list is one uniform ListNotFoundError, nothing created),
// AC-9 (ISO-8601 UTC strings, completedAt null for an active task).
const providers = [TasksService, TasksRepository, DbService];

describe('TasksService (integration)', () => {
  let db: DbService;
  let tasks: TasksService;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`tasksvc-${randomUUID()}@example.com`],
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

  const countTasks = async (ownerId: string): Promise<number> => {
    const r = await db.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM tasks WHERE owner_id = $1',
      [ownerId],
    );
    return Number(r.rows[0].count);
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    tasks = mod.get(TasksService);
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

  it('AC-1/AC-9: creates an active task and returns it as ISO-8601 UTC', async () => {
    const { id: owner, inbox } = await freshUser();

    const task = await tasks.create(owner, inbox, '  Buy milk  ');

    expect(task).toMatchObject({
      listId: inbox,
      title: 'Buy milk', // trimmed
      completedAt: null, // active — FR-TASK-001
    });
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    const view = await tasks.listView(owner, inbox);
    expect(view.active.map((t) => t.id)).toEqual([task.id]);
    expect(view.completed).toEqual([]);
  });

  it('AC-2: rejects empty, whitespace-only and over-long titles; accepts the maximum', async () => {
    const { id: owner, inbox } = await freshUser();

    for (const bad of ['', '   ', 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1)]) {
      await expect(tasks.create(owner, inbox, bad)).rejects.toBeInstanceOf(
        TaskTitleInvalidError,
      );
    }
    expect(await countTasks(owner)).toBe(0); // nothing created by any of them

    const max = await tasks.create(
      owner,
      inbox,
      'x'.repeat(TASK_TITLE_MAX_LENGTH),
    );
    expect(max.title).toHaveLength(TASK_TITLE_MAX_LENGTH);
  });

  it('AC-2: the rejection message names the requirement', async () => {
    const { id: owner, inbox } = await freshUser();

    const err = (await tasks
      .create(owner, inbox, ' ')
      .catch((e: unknown) => e)) as TaskTitleInvalidError;
    expect(err.requirement).toBe('Enter a title for this task.');

    const long = (await tasks
      .create(owner, inbox, 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1))
      .catch((e: unknown) => e)) as TaskTitleInvalidError;
    expect(long.requirement).toContain(String(TASK_TITLE_MAX_LENGTH));
  });

  it('AC-3/AC-4: the view splits active from completed, each in its own order', async () => {
    const { id: owner, inbox } = await freshUser();
    const first = await tasks.create(owner, inbox, 'first');
    const second = await tasks.create(owner, inbox, 'second');
    // Completion is FEAT-012's endpoint; set the column directly to exercise the split.
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at)
       VALUES ($1, $2, 'older done', '2026-07-01T10:00:00Z'),
              ($1, $2, 'newer done', '2026-07-20T10:00:00Z')`,
      [owner, inbox],
    );
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       VALUES ($1, $2, 'gone', now())`,
      [owner, inbox],
    );

    const view = await tasks.listView(owner, inbox);

    expect(view.active.map((t) => t.title)).toEqual(['first', 'second']);
    expect(view.completed.map((t) => t.title)).toEqual([
      'newer done',
      'older done',
    ]);
    // soft-deleted appears in neither section (FR-TASK-013)
    expect(
      [...view.active, ...view.completed].map((t) => t.title),
    ).not.toContain('gone');
    // a newly created task is LAST in active (technical-design D4)
    const third = await tasks.create(owner, inbox, 'third');
    const after = await tasks.listView(owner, inbox);
    expect(after.active.map((t) => t.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    // completed carry an ISO-8601 completedAt (AC-9)
    expect(view.completed[0].completedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
    );
  });

  it('AC-3: the view carries the list itself, with its counts', async () => {
    const { id: owner, inbox } = await freshUser();
    await tasks.create(owner, inbox, 'one');

    const view = await tasks.listView(owner, inbox);

    expect(view.list).toMatchObject({
      id: inbox,
      name: 'Inbox',
      isDefault: true,
      position: 0,
      activeTaskCount: 1,
      taskCount: 1,
    });
  });

  it("AC-5: another owner's list and an unknown id are the same error, and create nothing", async () => {
    const a = await freshUser();
    const b = await freshUser();
    const unknown = randomUUID();

    const foreignView = await tasks
      .listView(a.id, b.inbox)
      .catch((e: unknown) => e);
    const unknownView = await tasks
      .listView(a.id, unknown)
      .catch((e: unknown) => e);
    expect(foreignView).toBeInstanceOf(ListNotFoundError);
    expect(unknownView).toBeInstanceOf(ListNotFoundError);
    expect((foreignView as Error).message).toBe((unknownView as Error).message);

    await expect(
      tasks.create(a.id, b.inbox, 'hijacked'),
    ).rejects.toBeInstanceOf(ListNotFoundError);
    await expect(
      tasks.create(a.id, unknown, 'hijacked'),
    ).rejects.toBeInstanceOf(ListNotFoundError);

    // nothing was written for either user
    expect(await countTasks(a.id)).toBe(0);
    expect(await countTasks(b.id)).toBe(0);
  });

  it('AC-5: a malformed list id is the same not-found, not a database error', async () => {
    const { id: owner } = await freshUser();

    await expect(tasks.listView(owner, 'not-a-uuid')).rejects.toBeInstanceOf(
      ListNotFoundError,
    );
    await expect(tasks.create(owner, 'not-a-uuid', 'x')).rejects.toBeInstanceOf(
      ListNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// FEAT-011 T4 — detail, partial update, and the isOverdue derivation.
// ---------------------------------------------------------------------------

describe('TasksService — task detail (FEAT-011)', () => {
  let db: DbService;
  let tasks: TasksService;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`taskdetail-${randomUUID()}@example.com`],
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

  const storedTitle = async (id: string): Promise<string> => {
    const r = await db.query<{ title: string }>(
      'SELECT title FROM tasks WHERE id = $1',
      [id],
    );
    return r.rows[0].title;
  };

  const PAST = '2020-01-01T00:00:00.000Z';
  const FUTURE = '2099-01-01T00:00:00.000Z';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    tasks = mod.get(TasksService);
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

  it('AC-1: detail returns the five FR-TASK-004 details plus the owning list', async () => {
    const { id: owner, inbox } = await freshUser();
    const created = await tasks.create(owner, inbox, 'Renew passport', {
      dueAt: FUTURE,
      priority: 'high',
    });

    const { task, list } = await tasks.detail(owner, created.id);

    expect(task).toMatchObject({
      id: created.id,
      title: 'Renew passport', // title
      dueAt: FUTURE, //            due date/time
      priority: 'high', //         priority
      completedAt: null, //        status
      isOverdue: false,
    });
    expect(list.id).toBe(task.listId); // list — the fifth detail
    expect(list).toMatchObject({ name: 'Inbox', isDefault: true });
  });

  it('AC-2: update applies FR-TASK-002 title rules and leaves the stored title on rejection', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Original');

    expect((await tasks.update(owner, task.id, { title: '  Trimmed  ' })).title)
      .toBe('Trimmed');

    for (const bad of ['', '   ', 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1)]) {
      await expect(
        tasks.update(owner, task.id, { title: bad }),
      ).rejects.toBeInstanceOf(TaskTitleInvalidError);
    }
    expect(await storedTitle(task.id)).toBe('Trimmed');

    // The boundary itself is accepted.
    const max = 'y'.repeat(TASK_TITLE_MAX_LENGTH);
    expect((await tasks.update(owner, task.id, { title: max })).title).toBe(max);
  });

  it('AC-5: overdue is true only for an ACTIVE task whose due instant has passed', async () => {
    const { id: owner, inbox } = await freshUser();

    const past = await tasks.create(owner, inbox, 'Overdue', { dueAt: PAST });
    const future = await tasks.create(owner, inbox, 'Later', { dueAt: FUTURE });
    const undated = await tasks.create(owner, inbox, 'Someday');

    expect(past.isOverdue).toBe(true);
    expect(future.isOverdue).toBe(false);
    expect(undated.isOverdue).toBe(false);

    // FR-TASK-007's own note: only active tasks can be overdue. Completing the
    // past-due task must clear the indication even though the date still passed.
    await db.query('UPDATE tasks SET completed_at = now() WHERE id = $1', [
      past.id,
    ]);
    expect((await tasks.detail(owner, past.id)).task).toMatchObject({
      isOverdue: false,
      dueAt: PAST, // the due date is still there; only the indication is off
    });
  });

  it('AC-5: setting a past due date flips isOverdue in the same response that stores it', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Was undated');
    expect(task.isOverdue).toBe(false);

    const updated = await tasks.update(owner, task.id, { dueAt: PAST });

    expect(updated).toMatchObject({ dueAt: PAST, isOverdue: true });
  });

  it('AC-4: clearing the due date also clears the overdue indication', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Overdue', { dueAt: PAST });
    expect(task.isOverdue).toBe(true);

    const cleared = await tasks.update(owner, task.id, { dueAt: null });

    expect(cleared).toMatchObject({ dueAt: null, isOverdue: false });
  });

  it('AC-7: absent fields are untouched; an empty patch is refused', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Original', {
      dueAt: FUTURE,
      priority: 'medium',
    });

    const renamed = await tasks.update(owner, task.id, { title: 'Renamed' });
    expect(renamed).toMatchObject({
      title: 'Renamed',
      dueAt: FUTURE,
      priority: 'medium',
    });

    await expect(tasks.update(owner, task.id, {})).rejects.toMatchObject({
      name: 'TaskFieldInvalidError',
    });
  });

  it('AC-6: priority accepts the four values and rejects anything else', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Prioritized');
    expect(task.priority).toBe('none');

    for (const p of ['low', 'medium', 'high', 'none'] as const) {
      expect((await tasks.update(owner, task.id, { priority: p })).priority)
        .toBe(p);
    }

    for (const bad of ['urgent', 'HIGH', '', 1, null]) {
      await expect(
        tasks.update(owner, task.id, {
          priority: bad as never,
        }),
      ).rejects.toMatchObject({ name: 'TaskFieldInvalidError', field: 'priority' });
    }
    expect((await tasks.detail(owner, task.id)).task.priority).toBe('none');
  });

  it('AC-6/AC-3: an invalid dueAt is a field error, and never reaches the column', async () => {
    const { id: owner, inbox } = await freshUser();
    const task = await tasks.create(owner, inbox, 'Dated', { dueAt: FUTURE });

    for (const bad of ['not-a-date', '2026-13-45', 42]) {
      await expect(
        tasks.update(owner, task.id, { dueAt: bad as never }),
      ).rejects.toMatchObject({ name: 'TaskFieldInvalidError', field: 'dueAt' });
    }
    expect((await tasks.detail(owner, task.id)).task.dueAt).toBe(FUTURE);
  });

  it('AC-8: unknown, foreign, malformed and soft-deleted ids are one uniform not-found', async () => {
    const { id: ownerA, inbox } = await freshUser();
    const { id: ownerB } = await freshUser();
    const task = await tasks.create(ownerA, inbox, "A's task");

    const notFound = { name: 'TaskNotFoundError' };
    // Unknown id, another owner's id, and a non-uuid all raise the same error —
    // and the messages match, which is what makes the HTTP responses identical.
    await expect(tasks.detail(ownerA, randomUUID())).rejects.toMatchObject(notFound);
    await expect(tasks.detail(ownerB, task.id)).rejects.toMatchObject(notFound);
    await expect(tasks.detail(ownerA, 'not-a-uuid')).rejects.toMatchObject(notFound);
    await expect(
      tasks.update(ownerB, task.id, { title: 'hijacked' }),
    ).rejects.toMatchObject(notFound);
    await expect(
      tasks.update(ownerA, 'not-a-uuid', { title: 'x' }),
    ).rejects.toMatchObject(notFound);
    expect(await storedTitle(task.id)).toBe("A's task");

    await db.query('UPDATE tasks SET deleted_at = now() WHERE id = $1', [task.id]);
    await expect(tasks.detail(ownerA, task.id)).rejects.toMatchObject(notFound);
    await expect(
      tasks.update(ownerA, task.id, { title: 'x' }),
    ).rejects.toMatchObject(notFound);
  });

  it('AC-11: dueAt crosses the contract as an ISO-8601 UTC string, whatever offset arrived', async () => {
    const { id: owner, inbox } = await freshUser();

    const task = await tasks.create(owner, inbox, 'Offset', {
      dueAt: '2026-08-01T09:00:00.000+05:00',
    });

    expect(task.dueAt).toBe('2026-08-01T04:00:00.000Z');
    expect(task.dueAt).toMatch(/Z$/);
    expect((await tasks.detail(owner, task.id)).task.dueAt).toBe(
      '2026-08-01T04:00:00.000Z',
    );
  });
});
