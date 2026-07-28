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
