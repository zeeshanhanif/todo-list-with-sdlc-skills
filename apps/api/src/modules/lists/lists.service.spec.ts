import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { LIST_NAME_MAX_LENGTH } from '@todo/shared';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { ListsService } from './lists.service';
import { ListsRepository } from './lists.repository';
import {
  ListNameInvalidError,
  ListNotDeletableError,
  ListNotFoundError,
  ListOrderInvalidError,
} from './lists.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-009 T3 — ListsService: AC-1 (counts + order), AC-2 (create appends,
// owner from the session), AC-3 (FR-LIST-002 validation, duplicates legal),
// AC-4 (rename incl. the default list), AC-5 (delete cascades to every task),
// AC-6 (default list is not deletable), AC-7 (reorder persists / is idempotent /
// rejects a bad set), AC-8 (another owner's id is ListNotFoundError, identical
// to an unknown uuid), AC-10 (the FR-LIST-009 constraints).
const providers = [
  ListsService,
  ListsRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('ListsService (integration)', () => {
  let db: DbService;
  let lists: ListsService;
  const userIds: string[] = [];

  /** A user row with its bootstrap Inbox, as registration would leave it. */
  const freshUser = async (): Promise<string> => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`lists-${randomUUID()}@example.com`],
    );
    const id = res.rows[0].id;
    userIds.push(id);
    await db.query(
      `INSERT INTO lists (owner_id, name, is_default, position)
       VALUES ($1, 'Inbox', true, 0)`,
      [id],
    );
    return id;
  };

  const inboxOf = async (ownerId: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM lists WHERE owner_id = $1 AND is_default = true`,
      [ownerId],
    );
    return r.rows[0].id;
  };

  const addTask = async (
    ownerId: string,
    listId: string,
    state: 'active' | 'completed' | 'soft-deleted',
  ): Promise<string> => {
    const completed = state === 'completed' ? 'now()' : 'NULL';
    const deleted = state === 'soft-deleted' ? 'now()' : 'NULL';
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at, deleted_at)
       VALUES ($1, $2, 'a task', ${completed}, ${deleted}) RETURNING id`,
      [ownerId, listId],
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    lists = mod.get(ListsService);
  });

  afterEach(async () => {
    for (const id of userIds) {
      // cascades lists, and lists cascade tasks
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it("AC-1: returns the owner's lists in position order with active + total counts", async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    const work = await lists.create(owner, 'Work');

    // 3 active + 2 completed + 1 soft-deleted → activeTaskCount 3, taskCount 6
    await addTask(owner, inbox, 'active');
    await addTask(owner, inbox, 'active');
    await addTask(owner, inbox, 'active');
    await addTask(owner, inbox, 'completed');
    await addTask(owner, inbox, 'completed');
    await addTask(owner, inbox, 'soft-deleted');

    const all = await lists.listAll(owner);

    expect(all.map((l) => l.name)).toEqual(['Inbox', 'Work']);
    expect(all[0]).toMatchObject({
      id: inbox,
      isDefault: true,
      position: 0,
      activeTaskCount: 3,
      taskCount: 6,
    });
    expect(all[1]).toMatchObject({
      id: work.id,
      isDefault: false,
      position: 1,
      activeTaskCount: 0,
      taskCount: 0,
    });
  });

  it("AC-1: counts only the owner's own tasks and lists", async () => {
    const a = await freshUser();
    const b = await freshUser();
    await addTask(b, await inboxOf(b), 'active');

    const forA = await lists.listAll(a);
    expect(forA).toHaveLength(1);
    expect(forA[0].activeTaskCount).toBe(0);
  });

  it('AC-2: create trims the name, appends last, and owns it to the caller', async () => {
    const owner = await freshUser();

    const created = await lists.create(owner, '  Groceries  ');

    expect(created).toMatchObject({
      name: 'Groceries',
      isDefault: false,
      position: 1, // Inbox holds 0
      activeTaskCount: 0,
      taskCount: 0,
    });
    const second = await lists.create(owner, 'Errands');
    expect(second.position).toBe(2);
    expect((await lists.listAll(owner)).map((l) => l.name)).toEqual([
      'Inbox',
      'Groceries',
      'Errands',
    ]);

    const row = await db.query<{ owner_id: string }>(
      'SELECT owner_id FROM lists WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0].owner_id).toBe(owner);
  });

  it('AC-3: rejects empty, whitespace-only and over-length names; accepts the maximum and duplicates', async () => {
    const owner = await freshUser();

    await expect(lists.create(owner, '')).rejects.toBeInstanceOf(
      ListNameInvalidError,
    );
    await expect(lists.create(owner, '   ')).rejects.toBeInstanceOf(
      ListNameInvalidError,
    );
    await expect(
      lists.create(owner, 'x'.repeat(LIST_NAME_MAX_LENGTH + 1)),
    ).rejects.toBeInstanceOf(ListNameInvalidError);
    // nothing was created by any of the three
    expect(await lists.listAll(owner)).toHaveLength(1);

    const max = await lists.create(owner, 'x'.repeat(LIST_NAME_MAX_LENGTH));
    expect(max.name).toHaveLength(LIST_NAME_MAX_LENGTH);

    // FR-LIST-002: duplicate names are permitted
    const first = await lists.create(owner, 'Shopping');
    const dup = await lists.create(owner, 'Shopping');
    expect(dup.id).not.toBe(first.id);
    expect(dup.name).toBe('Shopping');
  });

  it('AC-4: renames a list, including the default one, preserving isDefault and counts', async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    await addTask(owner, inbox, 'active');
    const work = await lists.create(owner, 'Work');

    const renamedWork = await lists.rename(owner, work.id, '  Job  ');
    expect(renamedWork).toMatchObject({ name: 'Job', position: 1 });

    // FR-LIST-004 permits renaming the default list
    const renamedInbox = await lists.rename(owner, inbox, 'Personal');
    expect(renamedInbox).toMatchObject({
      name: 'Personal',
      isDefault: true,
      position: 0,
      activeTaskCount: 1,
      taskCount: 1,
    });

    expect((await lists.listAll(owner)).map((l) => l.name)).toEqual([
      'Personal',
      'Job',
    ]);
  });

  it('AC-4: a rejected rename changes nothing', async () => {
    const owner = await freshUser();
    const work = await lists.create(owner, 'Work');

    await expect(lists.rename(owner, work.id, '  ')).rejects.toBeInstanceOf(
      ListNameInvalidError,
    );

    const after = await lists.listAll(owner);
    expect(after.find((l) => l.id === work.id)?.name).toBe('Work');
  });

  it('AC-5: deleting a list permanently deletes every task it held, and nothing else', async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    const work = await lists.create(owner, 'Work');

    const active = await addTask(owner, work.id, 'active');
    const completed = await addTask(owner, work.id, 'completed');
    const softDeleted = await addTask(owner, work.id, 'soft-deleted');
    const keeper = await addTask(owner, inbox, 'active');

    const other = await freshUser();
    const otherTask = await addTask(other, await inboxOf(other), 'active');

    const deletedTaskCount = await lists.delete(owner, work.id);

    expect(deletedTaskCount).toBe(3); // active + completed + soft-deleted alike
    const gone = await db.query('SELECT id FROM tasks WHERE id = ANY($1)', [
      [active, completed, softDeleted],
    ]);
    expect(gone.rowCount).toBe(0);
    const survived = await db.query('SELECT id FROM tasks WHERE id = ANY($1)', [
      [keeper, otherTask],
    ]);
    expect(survived.rowCount).toBe(2);
    expect((await lists.listAll(owner)).map((l) => l.id)).toEqual([inbox]);
  });

  it('AC-6: the default list cannot be deleted, and nothing is removed', async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    const task = await addTask(owner, inbox, 'active');

    await expect(lists.delete(owner, inbox)).rejects.toBeInstanceOf(
      ListNotDeletableError,
    );

    expect((await lists.listAll(owner)).map((l) => l.id)).toEqual([inbox]);
    const stillThere = await db.query('SELECT id FROM tasks WHERE id = $1', [
      task,
    ]);
    expect(stillThere.rowCount).toBe(1);
  });

  it('AC-7: reorder persists a dense order and is idempotent', async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    const a = await lists.create(owner, 'A');
    const b = await lists.create(owner, 'B');

    const reordered = await lists.reorder(owner, [b.id, inbox, a.id]);

    expect(reordered.map((l) => l.id)).toEqual([b.id, inbox, a.id]);
    expect(reordered.map((l) => l.position)).toEqual([0, 1, 2]);
    // persisted — a fresh read sees the same order (FR-LIST-008 across devices)
    expect((await lists.listAll(owner)).map((l) => l.id)).toEqual([
      b.id,
      inbox,
      a.id,
    ]);

    const again = await lists.reorder(owner, [b.id, inbox, a.id]);
    expect(again.map((l) => l.id)).toEqual([b.id, inbox, a.id]);
    expect(again.map((l) => l.position)).toEqual([0, 1, 2]);
  });

  it('AC-7: rejects a missing, duplicated or foreign id and leaves the order untouched', async () => {
    const owner = await freshUser();
    const inbox = await inboxOf(owner);
    const a = await lists.create(owner, 'A');
    const other = await freshUser();
    const foreign = await inboxOf(other);

    const orderBefore = (await lists.listAll(owner)).map((l) => l.id);

    await expect(lists.reorder(owner, [a.id])).rejects.toBeInstanceOf(
      ListOrderInvalidError,
    ); // missing inbox
    await expect(
      lists.reorder(owner, [a.id, a.id, inbox]),
    ).rejects.toBeInstanceOf(ListOrderInvalidError); // duplicate
    await expect(
      lists.reorder(owner, [a.id, inbox, foreign]),
    ).rejects.toBeInstanceOf(ListOrderInvalidError); // foreign id
    await expect(
      lists.reorder(owner, [a.id, inbox, randomUUID()]),
    ).rejects.toBeInstanceOf(ListOrderInvalidError); // unknown id

    expect((await lists.listAll(owner)).map((l) => l.id)).toEqual(orderBefore);
    // the foreign owner's list is untouched
    expect((await lists.listAll(other)).map((l) => l.id)).toEqual([foreign]);
  });

  it("AC-8: another owner's list id is indistinguishable from an unknown one, and is never mutated", async () => {
    const a = await freshUser();
    const b = await freshUser();
    const bsList = await lists.create(b, 'B private');
    const unknown = randomUUID();

    // rename: same error type and message for foreign vs unknown
    const foreignRename = await lists
      .rename(a, bsList.id, 'hijacked')
      .catch((e: unknown) => e);
    const unknownRename = await lists
      .rename(a, unknown, 'hijacked')
      .catch((e: unknown) => e);
    expect(foreignRename).toBeInstanceOf(ListNotFoundError);
    expect(unknownRename).toBeInstanceOf(ListNotFoundError);
    expect((foreignRename as Error).message).toBe(
      (unknownRename as Error).message,
    );

    // delete: likewise — and notably NOT ListNotDeletableError for a foreign default
    const foreignDelete = await lists
      .delete(a, await inboxOf(b))
      .catch((e: unknown) => e);
    expect(foreignDelete).toBeInstanceOf(ListNotFoundError);
    const unknownDelete = await lists
      .delete(a, unknown)
      .catch((e: unknown) => e);
    expect(unknownDelete).toBeInstanceOf(ListNotFoundError);

    // B's data is exactly as it was
    const bLists = await lists.listAll(b);
    expect(bLists.map((l) => l.name)).toEqual(['Inbox', 'B private']);
    // ...and A never sees it
    expect((await lists.listAll(a)).map((l) => l.name)).toEqual(['Inbox']);
  });

  it('AC-10: a task cannot exist without a real list (FR-LIST-009)', async () => {
    const owner = await freshUser();

    await expect(
      db.query(
        `INSERT INTO tasks (owner_id, list_id, title) VALUES ($1, NULL, 't')`,
        [owner],
      ),
    ).rejects.toThrow(/null value in column "list_id"|not-null constraint/i);

    await expect(
      db.query(
        `INSERT INTO tasks (owner_id, list_id, title) VALUES ($1, $2, 't')`,
        [owner, randomUUID()],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
  });
});
