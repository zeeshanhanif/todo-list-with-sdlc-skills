import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  completeTaskPath,
  listTasksPath,
  reorderTasksPath,
  SEARCH_PATH,
  smartViewPath,
  reopenTaskPath,
  restoreTaskPath,
  taskPath,
  TASK_ERROR_CODES,
  type ApiError,
  type CreateListResponse,
  type CreateTaskResponse,
  type DeleteListResponse,
  type ListTasksResponse,
  type ListsResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// FEAT-010 T6 — the cross-feature check. FEAT-009's list-deletion cascade and
// its activeTaskCount were verified against SEEDED task rows, because no
// endpoint could create one. Now that tasks arrive through a real contract,
// both are re-exercised end to end (design §6 AC-7, AC-12; FEAT-009 AC-5/AC-13
// re-exercised, not rewritten).
const VALID_PW = '9x!vQ2mLp0zR';

describe('tasks × lists (cross-feature)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;
  // Jest reuses a worker process across suites, so an unrestored env var
  // leaks into whatever runs next — which is how FEAT-005's rate-limit test
  // started flaking. Saved here, restored in afterAll (the convention every
  // auth spec already follows).
  const prevRl = process.env.AUTH_RATELIMIT_MAX;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A reserved range no other spec uses. The auth specs share 192.0.2.x and the
  // rate-limit buckets are keyed (ip, route, window) in the SHARED database, so
  // suites running in parallel workers must not overlap IP spaces.
  const nextIp = (): string => `198.18.0.${(ipCounter++ % 250) + 1}`;

  const signedInUser = async (): Promise<{ cookie: string; inbox: string }> => {
    const email = `xfeat-${randomUUID()}@example.com`;
    emails.push(email);
    const registered = await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    // Assert the fixture's preconditions: without this a failed registration
    // surfaces as a TypeError on an undefined Set-Cookie further down, which
    // hides what actually went wrong (DEF-002 diagnosis).
    expect(registered.status).toBe(201);
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
    const row = await db.query<{ id: string }>(
      `SELECT l.id FROM lists l JOIN users u ON u.id = l.owner_id
        WHERE u.email = $1 AND l.is_default`,
      [email],
    );
    return { cookie, inbox: row.rows[0].id };
  };

  const getLists = async (cookie: string): Promise<ListsResponse> => {
    const res = await request(server()).get('/lists').set('Cookie', cookie);
    return res.body as ListsResponse;
  };

  // --- FEAT-012 helpers ---

  const addTask = async (
    cookie: string,
    listId: string,
    title: string,
  ): Promise<CreateTaskResponse['task']> => {
    const res = await request(server())
      .post(listTasksPath(listId))
      .set('Cookie', cookie)
      .send({ title });
    expect(res.status).toBe(201); // fixture precondition, asserted
    return (res.body as CreateTaskResponse).task;
  };

  const getView = async (
    cookie: string,
    listId: string,
  ): Promise<ListTasksResponse> => {
    const res = await request(server())
      .get(listTasksPath(listId))
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as ListTasksResponse;
  };

  // --- FEAT-013 helpers ---

  const remove = async (cookie: string, id: string): Promise<void> => {
    const res = await request(server())
      .delete(taskPath(id))
      .set('Cookie', cookie);
    expect(res.status).toBe(200); // fixture precondition, asserted
  };

  const restore = async (cookie: string, id: string): Promise<void> => {
    const res = await request(server())
      .post(restoreTaskPath(id))
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  };

  const complete = async (cookie: string, id: string): Promise<void> => {
    const res = await request(server())
      .post(completeTaskPath(id))
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  };

  // --- FEAT-014 helpers ---

  const reopen = async (cookie: string, id: string): Promise<void> => {
    const res = await request(server())
      .post(reopenTaskPath(id))
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  };

  const reorder = async (
    cookie: string,
    listId: string,
    taskIds: string[],
  ): Promise<ListTasksResponse> => {
    const res = await request(server())
      .post(reorderTasksPath(listId))
      .set('Cookie', cookie)
      .send({ taskIds });
    expect(res.status).toBe(200);
    return res.body as ListTasksResponse;
  };

  const activeTitles = (view: ListTasksResponse): string[] =>
    view.active.map((t) => t.title);

  beforeAll(async () => {
    process.env.AUTH_RATELIMIT_MAX = '1000';
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = mod.get(DbService);
  });

  afterEach(async () => {
    for (const e of emails) {
      const id = await db.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [e],
      );
      if (id.rows[0]) {
        await db.query('DELETE FROM audit_log WHERE user_id = $1', [
          id.rows[0].id,
        ]);
      }
      await db.query('DELETE FROM users WHERE email = $1', [e]);
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    if (prevRl === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevRl;
    await app.close();
  });

  it('AC-7: deleting a list removes the tasks created in it through the contract', async () => {
    const { cookie } = await signedInUser();
    const created = await request(server())
      .post('/lists')
      .set('Cookie', cookie)
      .send({ name: 'Work' });
    const work = (created.body as CreateListResponse).list.id;

    for (const title of ['w1', 'w2', 'w3']) {
      const res = await request(server())
        .post(listTasksPath(work))
        .set('Cookie', cookie)
        .send({ title });
      expect(res.status).toBe(201);
    }
    // ...and one in the Inbox, which must survive
    const { inbox } = { inbox: (await getLists(cookie)).lists[0].id };
    await request(server())
      .post(listTasksPath(inbox))
      .set('Cookie', cookie)
      .send({ title: 'keeper' });

    const deleted = await request(server())
      .delete(`/lists/${work}`)
      .set('Cookie', cookie);

    expect(deleted.status).toBe(200);
    expect((deleted.body as DeleteListResponse).deletedTaskCount).toBe(3);
    const left = await db.query('SELECT id FROM tasks WHERE list_id = $1', [
      work,
    ]);
    expect(left.rowCount).toBe(0);
    // the Inbox and its task are untouched
    const after = await getLists(cookie);
    expect(after.lists).toHaveLength(1);
    expect(after.lists[0].activeTaskCount).toBe(1);
  });

  it('AC-12: the sidebar count reflects tasks created through the contract', async () => {
    const { cookie, inbox } = await signedInUser();

    expect((await getLists(cookie)).lists[0].activeTaskCount).toBe(0);

    await request(server())
      .post(listTasksPath(inbox))
      .set('Cookie', cookie)
      .send({ title: 'one' });
    await request(server())
      .post(listTasksPath(inbox))
      .set('Cookie', cookie)
      .send({ title: 'two' });

    const lists = (await getLists(cookie)).lists;
    expect(lists[0]).toMatchObject({ activeTaskCount: 2, taskCount: 2 });
  });

  // --- FEAT-012 T5 — what a completion transition does to everything else ---

  it('FEAT-012 AC-3: completing moves a task between the server-split sections, and reopening reverses it', async () => {
    const { cookie, inbox } = await signedInUser();
    const first = await addTask(cookie, inbox, 'First');
    const second = await addTask(cookie, inbox, 'Second');
    const third = await addTask(cookie, inbox, 'Third');

    const view0 = await getView(cookie, inbox);
    expect(view0.active.map((t) => t.title)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(view0.completed).toEqual([]);

    // Complete two, in a known order, with a gap so `completed_at DESC` has
    // something real to sort by.
    await complete(cookie, first.id);
    await new Promise((r) => setTimeout(r, 25));
    await complete(cookie, third.id);

    const view1 = await getView(cookie, inbox);
    expect(view1.active.map((t) => t.title)).toEqual(['Second']);
    // Most recently completed first — the order findByList has always
    // specified and nothing could previously exercise.
    expect(view1.completed.map((t) => t.title)).toEqual(['Third', 'First']);
    expect(view1.completed.every((t) => t.completedAt !== null)).toBe(true);

    await request(server())
      .post(reopenTaskPath(first.id))
      .set('Cookie', cookie)
      .expect(200);

    const view2 = await getView(cookie, inbox);
    // Back among the active, in the oldest-first append order it never left.
    expect(view2.active.map((t) => t.title)).toEqual(['First', 'Second']);
    expect(view2.completed.map((t) => t.title)).toEqual(['Third']);
    expect(second.id).toBeDefined(); // 'Second' was never touched by any of it
  });

  it("FEAT-012 AC-6: a transition moves the list's activeTaskCount and leaves taskCount alone", async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'a');
    await addTask(cookie, inbox, 'b');

    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 2,
      taskCount: 2,
    });

    await complete(cookie, a.id);

    // Both surfaces that report counts must agree — the sidebar's GET /lists
    // and the list view's own `list` payload. This is the first feature that
    // can move a row across the aggregate's predicate, so it is asserted.
    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2, // completed is not deleted
    });
    expect((await getView(cookie, inbox)).list).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2,
    });

    await request(server())
      .post(reopenTaskPath(a.id))
      .set('Cookie', cookie)
      .expect(200);

    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 2,
      taskCount: 2,
    });
    expect((await getView(cookie, inbox)).list).toMatchObject({
      activeTaskCount: 2,
      taskCount: 2,
    });
  });
  // --- FEAT-013 T5 — what a deletion does to the list view and the counts ---

  it('FEAT-013 AC-2/AC-3: a deleted task leaves BOTH sections and comes back to the one it left', async () => {
    const { cookie, inbox } = await signedInUser();
    await addTask(cookie, inbox, 'first'); // stays put — the control row
    const second = await addTask(cookie, inbox, 'second');
    const third = await addTask(cookie, inbox, 'third');
    await complete(cookie, third.id);

    const before = await getView(cookie, inbox);
    expect(before.active.map((t) => t.title)).toEqual(['first', 'second']);
    expect(before.completed.map((t) => t.title)).toEqual(['third']);

    await remove(cookie, second.id);
    await remove(cookie, third.id);

    const during = await getView(cookie, inbox);
    expect(during.active.map((t) => t.title)).toEqual(['first']);
    expect(during.completed).toHaveLength(0);

    // The rows are still there — soft, not destroyed (FR-TASK-013 vs -015).
    const rows = await db.query<{ id: string }>(
      'SELECT id FROM tasks WHERE id = ANY($1) AND deleted_at IS NOT NULL',
      [[second.id, third.id]],
    );
    expect(rows.rows).toHaveLength(2);

    await restore(cookie, second.id);
    await restore(cookie, third.id);

    const after = await getView(cookie, inbox);
    // Original SECTION and original ORDER: the active one returns to its
    // created_at position rather than to the end (FR-TASK-014).
    expect(after.active.map((t) => t.title)).toEqual(['first', 'second']);
    expect(after.completed.map((t) => t.title)).toEqual(['third']);
  });

  it('FEAT-013 AC-5: deleting an active task moves activeTaskCount and leaves taskCount alone', async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'a');
    const b = await addTask(cookie, inbox, 'b');
    await complete(cookie, b.id);

    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2,
    });

    await remove(cookie, a.id);

    // Both surfaces that report counts must agree — the sidebar's GET /lists
    // and the list view's own `list` payload. taskCount holds at 2 because it
    // counts soft-deleted rows too: FEAT-009's deliberate contract, since all
    // of them go when the list does (FR-LIST-007). Pinned, not assumed.
    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 0,
      taskCount: 2,
    });
    expect((await getView(cookie, inbox)).list).toMatchObject({
      activeTaskCount: 0,
      taskCount: 2,
    });

    await restore(cookie, a.id);
    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2,
    });

    // Deleting a COMPLETED task moves neither count — it was already outside
    // the active predicate, and taskCount never excluded it.
    await remove(cookie, b.id);
    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2,
    });
    expect((await getView(cookie, inbox)).list).toMatchObject({
      activeTaskCount: 1,
      taskCount: 2,
    });
  });

  // --- FEAT-014 (T6) — the manual order against the rest of the task loop ---
  //
  // AC-3 (a task created after a reorder lands last), AC-8 (completing leaves
  // the survivors' relative order, the completed section and the counts alone),
  // AC-9 (a reopened task lands deterministically), AC-10 (so does a restored
  // one, and a task created while it was deleted does not take its number).
  // Every assertion goes through the REAL contracts, not the repository.

  it('AC-3/AC-8: reorder holds across creation, completion and the counts', async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'a');
    const b = await addTask(cookie, inbox, 'b');
    const c = await addTask(cookie, inbox, 'c');

    await reorder(cookie, inbox, [c.id, a.id, b.id]);

    // AC-3 — a task created afterwards appends, and moves nothing.
    const d = await addTask(cookie, inbox, 'd');
    expect(activeTitles(await getView(cookie, inbox))).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);

    // AC-8 — completing `a` removes it from the active order; c, b, d keep
    // their RELATIVE order, and the counts move exactly as FEAT-009/012 say.
    await complete(cookie, a.id);
    const afterComplete = await getView(cookie, inbox);
    expect(activeTitles(afterComplete)).toEqual(['c', 'b', 'd']);
    expect(afterComplete.completed.map((t) => t.title)).toEqual(['a']);
    expect(afterComplete.list).toMatchObject({
      activeTaskCount: 3,
      taskCount: 4,
    });

    // AC-8 — a reorder of the survivors leaves the completed section and the
    // counts untouched.
    const reordered = await reorder(cookie, inbox, [d.id, c.id, b.id]);
    expect(activeTitles(reordered)).toEqual(['d', 'c', 'b']);
    expect(reordered.completed.map((t) => t.title)).toEqual(['a']);
    expect(reordered.list).toMatchObject({ activeTaskCount: 3, taskCount: 4 });
    expect((await getLists(cookie)).lists[0]).toMatchObject({
      activeTaskCount: 3,
      taskCount: 4,
    });
  });

  it('AC-9: a reopened task comes back at its stored position, and reads the same twice', async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'a');
    const b = await addTask(cookie, inbox, 'b');
    const c = await addTask(cookie, inbox, 'c');

    // `a` is completed while it sits at position 0, then the survivors are
    // reordered — which renumbers only the ACTIVE set (D3), so `a`'s stored 0
    // is now also held by `c`.
    await complete(cookie, a.id);
    await reorder(cookie, inbox, [c.id, b.id]); // c:0, b:1
    await reopen(cookie, a.id);

    const once = activeTitles(await getView(cookie, inbox));
    const twice = activeTitles(await getView(cookie, inbox));
    // `a` ties with `c` at position 0 and was created FIRST, so it sorts ahead
    // of it (D4). Note what this shape rules out: a reopened task landing LAST
    // would be indistinguishable from an append, so the tie is deliberately set
    // up to put it FIRST — a result no append rule could produce.
    expect(once).toEqual(['a', 'c', 'b']);
    expect(twice).toEqual(once);
  });

  it('AC-10: a restored task returns to its position, and a task created meanwhile did not take its number', async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'a');
    const b = await addTask(cookie, inbox, 'b');

    await remove(cookie, b.id); // b holds position 1 while soft-deleted
    const c = await addTask(cookie, inbox, 'c'); // must NOT be given 1 (D5)
    expect(c.position).toBe(2);
    expect(activeTitles(await getView(cookie, inbox))).toEqual(['a', 'c']);

    await restore(cookie, b.id);
    const view = await getView(cookie, inbox);
    expect(activeTitles(view)).toEqual(['a', 'b', 'c']);
    expect(view.active.map((t) => t.position)).toEqual([0, 1, 2]);

    // And the restored task participates in the next reorder like any other.
    expect(
      activeTitles(await reorder(cookie, inbox, [b.id, c.id, a.id])),
    ).toEqual(['b', 'c', 'a']);
  });

  // --- Acceptance (FEAT-014 verification) — AC-14, which had no test ---
  //
  // The criterion is a NO-REGRESSION claim about two other features, and
  // "their suites are still green" does not test it: those suites never
  // reorder anything. This one does, and then reads both surfaces.

  it('AC-14: reordering a list leaves search results and the smart views untouched', async () => {
    const { cookie, inbox } = await signedInUser();
    const a = await addTask(cookie, inbox, 'zebra alpha');
    const b = await addTask(cookie, inbox, 'zebra beta');
    const c = await addTask(cookie, inbox, 'zebra gamma');

    const search = async (): Promise<string[]> => {
      const res = await request(server())
        .get(`${SEARCH_PATH}?q=zebra`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      return (res.body as { results: { title: string }[] }).results.map(
        (r) => r.title,
      );
    };
    const allView = async (): Promise<string[]> => {
      const res = await request(server())
        .get(smartViewPath('all'))
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      return (res.body as { results: { title: string }[] }).results.map(
        (r) => r.title,
      );
    };

    const searchBefore = await search();
    const viewBefore = await allView();
    expect(searchBefore).toHaveLength(3); // the fixture actually matched

    // Reverse the list's manual order — the most disruptive permutation there is.
    expect(
      (await reorder(cookie, inbox, [c.id, b.id, a.id])).active.map(
        (t) => t.title,
      ),
    ).toEqual(['zebra gamma', 'zebra beta', 'zebra alpha']);

    // Both surfaces sort by their OWN keys (created_at / due_at), which this
    // feature does not touch, so neither moves.
    expect(await search()).toEqual(searchBefore);
    expect(await allView()).toEqual(viewBefore);
  });

  // --- FEAT-020: the retention boundary ---
  //
  // FR-TASK-015's clause "after which they cannot be restored" is API-observable,
  // but the API suite cannot run the worker. The purge's ONLY effect is the row's
  // disappearance (FEAT-020 design §5), so this reproduces exactly that and then
  // exercises the real restore contract. That the effect is the right one — that
  // the purge deletes the expired rows and nothing else — is proven independently
  // by apps/worker/src/purge/*.spec.ts. Recorded in FEAT-020 design §8 as designed
  // composition, not a substituted assertion.
  it('FEAT-020 AC-4: once purged, restore is 404 task_not_found — the window has closed', async () => {
    const { cookie, inbox } = await signedInUser();

    // Control: while the row is merely soft-deleted, restore SUCCEEDS. Without
    // this the assertion below could pass for a reason unrelated to the purge
    // (a broken restore route would satisfy it just as well).
    const restorable = await addTask(cookie, inbox, 'Still in the window');
    await remove(cookie, restorable.id);
    await restore(cookie, restorable.id); // asserts 200 internally

    const purged = await addTask(cookie, inbox, 'Past the window');
    await remove(cookie, purged.id);
    // The purge's only effect, reproduced.
    await db.query('DELETE FROM tasks WHERE id = $1', [purged.id]);

    const res = await request(server())
      .post(restoreTaskPath(purged.id))
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect((res.body as ApiError).code).toBe(TASK_ERROR_CODES.taskNotFound);

    // Byte-identical to an id that never existed: purge leaves no trace the
    // response could disclose (FEAT-013 §3's uniform not-found).
    const unknown = await request(server())
      .post(restoreTaskPath(randomUUID()))
      .set('Cookie', cookie);
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(unknown.body));

    // Irreversible: a second attempt does not resurrect it either.
    const again = await request(server())
      .post(restoreTaskPath(purged.id))
      .set('Cookie', cookie);
    expect(again.status).toBe(404);

    // And the row really is gone, not merely hidden.
    const row = await db.query('SELECT 1 FROM tasks WHERE id = $1', [
      purged.id,
    ]);
    expect(row.rowCount).toBe(0);
  });
});
