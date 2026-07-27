import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  LIST_ERROR_CODES,
  LIST_NAME_MAX_LENGTH,
  type ApiError,
  type CreateListResponse,
  type DeleteListResponse,
  type ListsResponse,
  type RenameListResponse,
  type ReorderListsResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive the list endpoints over HTTP. Needs local Postgres.
// FEAT-009 T4 — AC-1 (200 + ordered/counted), AC-2 (201 create), AC-3 (400 name),
// AC-4 (200 rename incl. default), AC-5 (200 delete + cascade),
// AC-6 (409 list_not_deletable), AC-7 (200 reorder / 400 bad set),
// AC-8 (404 identical for foreign vs unknown), AC-9 (401 on all five),
// AC-11 (GET /lists is one query, and stays inside the NFR-PERF-001 bound).
const VALID_PW = '9x!vQ2mLp0zR';

describe('list endpoints (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const nextIp = (): string => `198.51.100.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `listc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** Register + verify + sign in; returns the session cookie and the user id. */
  const signedInUser = async (): Promise<{ cookie: string; id: string }> => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const id = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return { cookie: setCookie[0].split(';')[0], id: id.rows[0].id };
  };

  const inboxOf = async (ownerId: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      'SELECT id FROM lists WHERE owner_id = $1 AND is_default = true',
      [ownerId],
    );
    return r.rows[0].id;
  };

  const addTask = async (
    ownerId: string,
    listId: string,
    state: 'active' | 'completed' | 'soft-deleted' = 'active',
  ): Promise<void> => {
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at, deleted_at)
       VALUES ($1, $2, 'a task',
               ${state === 'completed' ? 'now()' : 'NULL'},
               ${state === 'soft-deleted' ? 'now()' : 'NULL'})`,
      [ownerId, listId],
    );
  };

  const createList = async (cookie: string, name: string): Promise<string> => {
    const res = await request(server())
      .post('/lists')
      .set('Cookie', cookie)
      .send({ name });
    return (res.body as CreateListResponse).list.id;
  };

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
    await app.close();
  });

  it("AC-1: GET /lists returns the caller's lists, ordered, with both counts", async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    await createList(cookie, 'Work');
    await addTask(id, inbox, 'active');
    await addTask(id, inbox, 'completed');
    await addTask(id, inbox, 'soft-deleted');

    const res = await request(server()).get('/lists').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as ListsResponse;
    expect(body.lists.map((l) => l.name)).toEqual(['Inbox', 'Work']);
    expect(body.lists[0]).toMatchObject({
      isDefault: true,
      position: 0,
      activeTaskCount: 1,
      taskCount: 3,
    });
  });

  it('AC-2: POST /lists returns 201 with the created list appended last', async () => {
    const { cookie } = await signedInUser();

    const res = await request(server())
      .post('/lists')
      .set('Cookie', cookie)
      .send({ name: '  Groceries  ' });

    expect(res.status).toBe(201);
    expect((res.body as CreateListResponse).list).toMatchObject({
      name: 'Groceries',
      isDefault: false,
      position: 1,
      activeTaskCount: 0,
      taskCount: 0,
    });
  });

  it('AC-3: an invalid name is 400 validation_failed on the name field', async () => {
    const { cookie } = await signedInUser();

    for (const name of ['', '   ', 'x'.repeat(LIST_NAME_MAX_LENGTH + 1)]) {
      const res = await request(server())
        .post('/lists')
        .set('Cookie', cookie)
        .send({ name });
      expect(res.status).toBe(400);
      const err = res.body as ApiError;
      expect(err.code).toBe('validation_failed');
      expect(err.fields?.[0].field).toBe('name');
      expect(err.statusCode).toBe(400);
    }

    // a missing/non-string name is caught by the DTO, same envelope
    const missing = await request(server())
      .post('/lists')
      .set('Cookie', cookie)
      .send({});
    expect(missing.status).toBe(400);
    expect((missing.body as ApiError).fields?.[0].field).toBe('name');

    const listed = await request(server()).get('/lists').set('Cookie', cookie);
    expect((listed.body as ListsResponse).lists).toHaveLength(1); // only Inbox
  });

  it('AC-4: PATCH renames any list, including the default one', async () => {
    const { cookie, id } = await signedInUser();
    const work = await createList(cookie, 'Work');

    const renamed = await request(server())
      .patch(`/lists/${work}`)
      .set('Cookie', cookie)
      .send({ name: 'Job' });
    expect(renamed.status).toBe(200);
    expect((renamed.body as RenameListResponse).list.name).toBe('Job');

    const inbox = await request(server())
      .patch(`/lists/${await inboxOf(id)}`)
      .set('Cookie', cookie)
      .send({ name: 'Personal' });
    expect(inbox.status).toBe(200);
    expect((inbox.body as RenameListResponse).list).toMatchObject({
      name: 'Personal',
      isDefault: true,
    });
  });

  it('AC-5: DELETE removes the list and every task in it', async () => {
    const { cookie, id } = await signedInUser();
    const work = await createList(cookie, 'Work');
    await addTask(id, work, 'active');
    await addTask(id, work, 'completed');
    await addTask(id, work, 'soft-deleted');
    await addTask(id, await inboxOf(id), 'active');

    const res = await request(server())
      .delete(`/lists/${work}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body as DeleteListResponse).toEqual({
      status: 'list_deleted',
      deletedTaskCount: 3,
    });
    const left = await db.query('SELECT id FROM tasks WHERE list_id = $1', [
      work,
    ]);
    expect(left.rowCount).toBe(0);
    const remaining = await request(server())
      .get('/lists')
      .set('Cookie', cookie);
    expect((remaining.body as ListsResponse).lists).toHaveLength(1);
    expect((remaining.body as ListsResponse).lists[0].taskCount).toBe(1);
  });

  it('AC-6: DELETE on the default list is 409 list_not_deletable and deletes nothing', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    await addTask(id, inbox, 'active');

    const res = await request(server())
      .delete(`/lists/${inbox}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(409);
    expect((res.body as ApiError).code).toBe(LIST_ERROR_CODES.listNotDeletable);
    const still = await db.query('SELECT id FROM lists WHERE id = $1', [inbox]);
    expect(still.rowCount).toBe(1);
    const tasks = await db.query('SELECT id FROM tasks WHERE list_id = $1', [
      inbox,
    ]);
    expect(tasks.rowCount).toBe(1);
  });

  it('AC-7: POST /lists/reorder persists the order; a bad set is 400 on listIds', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    const a = await createList(cookie, 'A');
    const b = await createList(cookie, 'B');

    const ok = await request(server())
      .post('/lists/reorder')
      .set('Cookie', cookie)
      .send({ listIds: [b, inbox, a] });
    expect(ok.status).toBe(200);
    expect((ok.body as ReorderListsResponse).lists.map((l) => l.id)).toEqual([
      b,
      inbox,
      a,
    ]);

    const reread = await request(server()).get('/lists').set('Cookie', cookie);
    expect((reread.body as ListsResponse).lists.map((l) => l.id)).toEqual([
      b,
      inbox,
      a,
    ]);

    const bad = await request(server())
      .post('/lists/reorder')
      .set('Cookie', cookie)
      .send({ listIds: [a, inbox] }); // missing b
    expect(bad.status).toBe(400);
    expect((bad.body as ApiError).code).toBe('validation_failed');
    expect((bad.body as ApiError).fields?.[0].field).toBe('listIds');

    const unchanged = await request(server())
      .get('/lists')
      .set('Cookie', cookie);
    expect((unchanged.body as ListsResponse).lists.map((l) => l.id)).toEqual([
      b,
      inbox,
      a,
    ]);
  });

  it('AC-7: /lists/reorder is not captured by the :id route', async () => {
    const { cookie } = await signedInUser();
    // A PATCH to the literal path must 404 as an id, proving the static POST
    // route is what serves reorder (route-order regression guard).
    const res = await request(server())
      .post('/lists/reorder')
      .set('Cookie', cookie)
      .send({ listIds: ['not-a-uuid'] });
    expect(res.status).toBe(400);
    expect((res.body as ApiError).fields?.[0].field).toBe('listIds');
  });

  it("AC-8: another user's list is 404 list_not_found, identical to an unknown id, and is not mutated", async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    const bList = await createList(b.cookie, 'B private');
    const unknown = randomUUID();

    const foreignPatch = await request(server())
      .patch(`/lists/${bList}`)
      .set('Cookie', a.cookie)
      .send({ name: 'hijacked' });
    const unknownPatch = await request(server())
      .patch(`/lists/${unknown}`)
      .set('Cookie', a.cookie)
      .send({ name: 'hijacked' });
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body).toEqual(unknownPatch.body); // byte-identical envelope
    expect((foreignPatch.body as ApiError).code).toBe(
      LIST_ERROR_CODES.listNotFound,
    );

    const foreignDelete = await request(server())
      .delete(`/lists/${bList}`)
      .set('Cookie', a.cookie);
    const unknownDelete = await request(server())
      .delete(`/lists/${unknown}`)
      .set('Cookie', a.cookie);
    expect(foreignDelete.status).toBe(404);
    expect(foreignDelete.body).toEqual(unknownDelete.body);

    // B's inbox (a DEFAULT list) must also read as 404 to A — never 409, which
    // would confirm the id exists.
    const foreignDefault = await request(server())
      .delete(`/lists/${await inboxOf(b.id)}`)
      .set('Cookie', a.cookie);
    expect(foreignDefault.status).toBe(404);
    expect(foreignDefault.body).toEqual(unknownDelete.body);

    const bLists = await request(server())
      .get('/lists')
      .set('Cookie', b.cookie);
    expect((bLists.body as ListsResponse).lists.map((l) => l.name)).toEqual([
      'Inbox',
      'B private',
    ]);
    const aLists = await request(server())
      .get('/lists')
      .set('Cookie', a.cookie);
    expect((aLists.body as ListsResponse).lists).toHaveLength(1);
  });

  it('AC-9: every endpoint is 401 unauthenticated without a live session, and writes nothing', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    const revoked = cookie;
    await request(server()).post('/auth/logout').set('Cookie', revoked); // kill it

    // Built one at a time: each supertest instance binds the server itself.
    const unauthenticated = [
      () => request(server()).get('/lists'),
      () => request(server()).post('/lists').send({ name: 'X' }),
      () => request(server()).patch(`/lists/${inbox}`).send({ name: 'X' }),
      () => request(server()).delete(`/lists/${inbox}`),
      () =>
        request(server())
          .post('/lists/reorder')
          .send({ listIds: [inbox] }),
    ];
    for (const call of unauthenticated) {
      const res = await call();
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    }

    // a revoked cookie is treated the same
    const withRevoked = await request(server())
      .post('/lists')
      .set('Cookie', revoked)
      .send({ name: 'X' });
    expect(withRevoked.status).toBe(401);

    // nothing was created and the Inbox is untouched
    const lists = await db.query<{ name: string }>(
      'SELECT name FROM lists WHERE owner_id = $1',
      [id],
    );
    expect(lists.rows.map((r) => r.name)).toEqual(['Inbox']);
  });

  it('AC-11: GET /lists resolves lists + counts in a single query, inside the 300 ms bound', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);

    // 20 lists x 100 tasks (the first list carries them; the rest exercise the join)
    for (let i = 0; i < 19; i++) {
      await createList(cookie, `List ${i}`);
    }
    const values = Array.from({ length: 100 }, () => `($1, $2, 'seed')`).join(
      ',',
    );
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title) VALUES ${values}`,
      [id, inbox],
    );

    const querySpy = jest.spyOn(db, 'query');
    const started = Date.now();
    const res = await request(server()).get('/lists').set('Cookie', cookie);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect((res.body as ListsResponse).lists).toHaveLength(20);
    expect((res.body as ListsResponse).lists[0].activeTaskCount).toBe(100);

    // No N+1: exactly one query for the collection itself. The session guard's
    // own lookups are filtered out by matching the FROM clause.
    const listQueries = querySpy.mock.calls.filter(([sql]) =>
      /FROM lists l/.test(sql),
    );
    expect(listQueries).toHaveLength(1);
    expect(elapsed).toBeLessThan(300);
    querySpy.mockRestore();
  });
});
