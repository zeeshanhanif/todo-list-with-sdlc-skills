import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  LIST_ERROR_CODES,
  TASK_TITLE_MAX_LENGTH,
  listTasksPath,
  type ApiError,
  type CreateTaskResponse,
  type ListTasksResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive the task endpoints over HTTP. Needs local Postgres.
// FEAT-010 T4 — AC-1 (201 create), AC-2 (400 title, nothing created),
// AC-3 (200 { list, active, completed }), AC-4 (orders, new task last),
// AC-5 (404 identical for foreign vs unknown, on both endpoints, nothing
// written), AC-6 (401 on both), AC-8 (two queries for the view, inside 300 ms).
const VALID_PW = '9x!vQ2mLp0zR';

describe('task endpoints (contract)', () => {
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
  const nextIp = (): string => `203.0.113.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `taskc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    inbox: string;
  }> => {
    const email = freshEmail();
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
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie[0].split(';')[0];
    const row = await db.query<{ id: string; list_id: string }>(
      `SELECT u.id, l.id AS list_id
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default
        WHERE u.email = $1`,
      [email],
    );
    return { cookie, id: row.rows[0].id, inbox: row.rows[0].list_id };
  };

  const addTask = async (
    cookie: string,
    listId: string,
    title: string,
  ): Promise<string> => {
    const res = await request(server())
      .post(listTasksPath(listId))
      .set('Cookie', cookie)
      .send({ title });
    return (res.body as CreateTaskResponse).task.id;
  };

  const countTasks = async (ownerId: string): Promise<number> => {
    const r = await db.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM tasks WHERE owner_id = $1',
      [ownerId],
    );
    return Number(r.rows[0].count);
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
    if (prevRl === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevRl;
    await app.close();
  });

  it('AC-1: POST returns 201 with the task, created active in the path list', async () => {
    const { cookie, inbox } = await signedInUser();

    const res = await request(server())
      .post(listTasksPath(inbox))
      .set('Cookie', cookie)
      .send({ title: '  Buy milk  ' });

    expect(res.status).toBe(201);
    expect((res.body as CreateTaskResponse).task).toMatchObject({
      listId: inbox,
      title: 'Buy milk',
      completedAt: null,
    });
  });

  it('AC-2: an invalid title is 400 validation_failed on the title field, creating nothing', async () => {
    const { cookie, id, inbox } = await signedInUser();

    for (const title of ['', '   ', 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1)]) {
      const res = await request(server())
        .post(listTasksPath(inbox))
        .set('Cookie', cookie)
        .send({ title });
      expect(res.status).toBe(400);
      const err = res.body as ApiError;
      expect(err.code).toBe('validation_failed');
      expect(err.fields?.[0].field).toBe('title');
    }

    // a missing/non-string title is caught by the DTO, same envelope
    const missing = await request(server())
      .post(listTasksPath(inbox))
      .set('Cookie', cookie)
      .send({});
    expect(missing.status).toBe(400);
    expect((missing.body as ApiError).fields?.[0].field).toBe('title');

    expect(await countTasks(id)).toBe(0);
  });

  it('AC-3: GET returns the list with its active and completed sections', async () => {
    const { cookie, id, inbox } = await signedInUser();
    await addTask(cookie, inbox, 'a1');
    await addTask(cookie, inbox, 'a2');
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at)
       VALUES ($1, $2, 'done1', now()), ($1, $2, 'done2', now())`,
      [id, inbox],
    );
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, deleted_at)
       VALUES ($1, $2, 'gone', now())`,
      [id, inbox],
    );

    const res = await request(server())
      .get(listTasksPath(inbox))
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as ListTasksResponse;
    expect(body.list).toMatchObject({
      id: inbox,
      name: 'Inbox',
      isDefault: true,
      activeTaskCount: 2, // incomplete and not soft-deleted
      // taskCount is EVERY row in the list, soft-deleted included — FEAT-009
      // defines it that way so the delete warning quantifies what really goes
      // (FR-LIST-007 deletes them all). The view's sections still exclude them.
      taskCount: 5,
    });
    expect(body.active.map((t) => t.title)).toEqual(['a1', 'a2']);
    expect(body.completed).toHaveLength(2);
    expect(
      [...body.active, ...body.completed].map((t) => t.title),
    ).not.toContain('gone');
  });

  it('AC-4: a newly created task is last in the active section', async () => {
    const { cookie, inbox } = await signedInUser();
    await addTask(cookie, inbox, 'first');
    await addTask(cookie, inbox, 'second');
    const third = await addTask(cookie, inbox, 'third');

    const res = await request(server())
      .get(listTasksPath(inbox))
      .set('Cookie', cookie);

    const body = res.body as ListTasksResponse;
    expect(body.active.map((t) => t.title)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(body.active[body.active.length - 1].id).toBe(third);
  });

  it("AC-5: another user's list is 404 list_not_found, identical to an unknown id, on both endpoints", async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    await addTask(b.cookie, b.inbox, "b's task");
    const unknown = randomUUID();

    const foreignGet = await request(server())
      .get(listTasksPath(b.inbox))
      .set('Cookie', a.cookie);
    const unknownGet = await request(server())
      .get(listTasksPath(unknown))
      .set('Cookie', a.cookie);
    expect(foreignGet.status).toBe(404);
    expect(foreignGet.body).toEqual(unknownGet.body); // byte-identical
    expect((foreignGet.body as ApiError).code).toBe(
      LIST_ERROR_CODES.listNotFound,
    );

    const foreignPost = await request(server())
      .post(listTasksPath(b.inbox))
      .set('Cookie', a.cookie)
      .send({ title: 'hijacked' });
    const unknownPost = await request(server())
      .post(listTasksPath(unknown))
      .set('Cookie', a.cookie)
      .send({ title: 'hijacked' });
    expect(foreignPost.status).toBe(404);
    expect(foreignPost.body).toEqual(unknownPost.body);

    // nothing was written for either user, and B's own task is untouched
    expect(await countTasks(a.id)).toBe(0);
    expect(await countTasks(b.id)).toBe(1);
  });

  it('AC-6: both endpoints are 401 unauthenticated without a live session, and write nothing', async () => {
    const { cookie, id, inbox } = await signedInUser();
    const revoked = cookie;
    await request(server()).post('/auth/logout').set('Cookie', revoked);

    const calls = [
      () => request(server()).get(listTasksPath(inbox)),
      () => request(server()).post(listTasksPath(inbox)).send({ title: 'x' }),
      () =>
        request(server())
          .post(listTasksPath(inbox))
          .set('Cookie', revoked)
          .send({ title: 'x' }),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    }

    expect(await countTasks(id)).toBe(0);
  });

  it('AC-8: the list view is two queries, inside the 300 ms bound', async () => {
    const { cookie, id, inbox } = await signedInUser();
    const values = Array.from(
      { length: 500 },
      (_, i) => `($1, $2, 'seed ${i}')`,
    ).join(',');
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title) VALUES ${values}`,
      [id, inbox],
    );

    const querySpy = jest.spyOn(db, 'query');
    const started = Date.now();
    const res = await request(server())
      .get(listTasksPath(inbox))
      .set('Cookie', cookie);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect((res.body as ListTasksResponse).active).toHaveLength(500);

    // No N+1: one statement for the list (with its counts), one for the rows.
    // The session guard's own lookups are filtered out by matching the tables.
    const viewQueries = querySpy.mock.calls.filter(([sql]) =>
      /FROM lists l|FROM tasks/.test(sql),
    );
    expect(viewQueries).toHaveLength(2);
    expect(elapsed).toBeLessThan(300);
    querySpy.mockRestore();
  });
});
