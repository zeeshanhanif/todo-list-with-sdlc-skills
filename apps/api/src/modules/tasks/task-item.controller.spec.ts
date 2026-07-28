import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TASK_ERROR_CODES,
  TASK_TITLE_MAX_LENGTH,
  listTasksPath,
  taskPath,
  type ApiError,
  type CreateTaskResponse,
  type TaskDetailResponse,
  type UpdateTaskResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests for the single-task resource (FEAT-011 T5): boot the real app
// (global pipe + filter + cookie-parser) and drive GET/PATCH /tasks/{id} over
// HTTP. Needs local Postgres.
//
// AC-1 (200 { task, list }), AC-2/AC-6 (400 validation_failed naming the field,
// nothing written), AC-4 (dueAt null clears, absent leaves alone), AC-7 (empty
// patch is 400 not 200), AC-8 (404 task_not_found byte-identical across unknown
// / foreign / non-uuid / soft-deleted, on both routes, target unmodified),
// AC-9 (401 on both), AC-12 (two queries per route, inside 300 ms).
const VALID_PW = '9x!vQ2mLp0zR';
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

describe('task item endpoints (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;
  const prevRl = process.env.AUTH_RATELIMIT_MAX;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // Own IP range, disjoint from every other spec's — the invariant DEF-001
  // established and rate-limit-isolation.spec.ts guards.
  const nextIp = (): string => `203.0.114.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `taskitem-${randomUUID()}@example.com`;
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
    // Assert the fixture's preconditions (DEF-002 diagnosis): a failed
    // registration must say so here, not surface as a TypeError on an undefined
    // Set-Cookie three lines down.
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

  /**
   * Create a task and, when the case needs a due date or priority, set them
   * through **PATCH** — the route this spec owns.
   *
   * Deliberately not `POST { title, dueAt, priority }`: creating with those
   * fields is T6's contract, and a T5 fixture that depended on it would make
   * this spec fail for a reason that has nothing to do with what it tests.
   * T6's own spec asserts the create path.
   */
  const addTask = async (
    cookie: string,
    listId: string,
    body: { title: string; dueAt?: string | null; priority?: string },
  ): Promise<CreateTaskResponse['task']> => {
    const res = await request(server())
      .post(listTasksPath(listId))
      .set('Cookie', cookie)
      .send({ title: body.title });
    expect(res.status).toBe(201);
    const task = (res.body as CreateTaskResponse).task;

    const patch: Record<string, unknown> = {};
    if (body.dueAt !== undefined) patch.dueAt = body.dueAt;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (Object.keys(patch).length === 0) return task;

    const set = await request(server())
      .patch(taskPath(task.id))
      .set('Cookie', cookie)
      .send(patch);
    expect(set.status).toBe(200);
    return (set.body as UpdateTaskResponse).task;
  };

  const storedRow = async (id: string) => {
    const r = await db.query<{
      title: string;
      due_at: Date | null;
      priority: string;
      updated_at: Date;
    }>('SELECT title, due_at, priority, updated_at FROM tasks WHERE id = $1', [
      id,
    ]);
    return r.rows[0];
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
        await db.query('DELETE FROM users WHERE id = $1', [id.rows[0].id]);
      }
    }
    emails.length = 0;
  });

  afterAll(async () => {
    if (prevRl === undefined) {
      delete process.env.AUTH_RATELIMIT_MAX;
    } else {
      process.env.AUTH_RATELIMIT_MAX = prevRl;
    }
    await app.close();
  });

  it('AC-1: GET returns 200 { task, list } with the five FR-TASK-004 details', async () => {
    const { cookie, inbox } = await signedInUser();
    const created = await addTask(cookie, inbox, {
      title: 'Renew passport',
      dueAt: FUTURE,
      priority: 'high',
    });

    const res = await request(server())
      .get(taskPath(created.id))
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as TaskDetailResponse;
    expect(body.task).toMatchObject({
      id: created.id,
      title: 'Renew passport',
      dueAt: FUTURE,
      priority: 'high',
      completedAt: null,
      isOverdue: false,
    });
    expect(body.list).toMatchObject({
      id: body.task.listId,
      name: 'Inbox',
      isDefault: true,
    });
  });

  it('AC-4/AC-7: a PATCH naming one field leaves the others alone over the wire', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, {
      title: 'Original',
      dueAt: FUTURE,
      priority: 'medium',
    });

    // THE critical assertion of this feature (D4). Over HTTP, JSON cannot carry
    // `undefined`, so if class-transformer materialized the DTO's declared-but-
    // absent properties, the service's `'dueAt' in patch` check would fire and
    // this title-only PATCH would silently clear the due date. It must not.
    const res = await request(server())
      .patch(taskPath(task.id))
      .set('Cookie', cookie)
      .send({ title: 'Renamed' });

    expect(res.status).toBe(200);
    expect((res.body as UpdateTaskResponse).task).toMatchObject({
      title: 'Renamed',
      dueAt: FUTURE,
      priority: 'medium',
    });
    const stored = await storedRow(task.id);
    expect(stored.due_at?.toISOString()).toBe(FUTURE);
    expect(stored.priority).toBe('medium');
  });

  it('AC-4: dueAt null clears the due date and the overdue indication', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, { title: 'Late', dueAt: PAST });
    expect(task.isOverdue).toBe(true);

    const res = await request(server())
      .patch(taskPath(task.id))
      .set('Cookie', cookie)
      .send({ dueAt: null });

    expect(res.status).toBe(200);
    expect((res.body as UpdateTaskResponse).task).toMatchObject({
      dueAt: null,
      isOverdue: false,
    });
    expect((await storedRow(task.id)).due_at).toBeNull();
  });

  it('AC-7: an empty patch — and a patch of only unknown keys — is 400, never a silent 200', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, { title: 'Untouched' });
    const before = await storedRow(task.id);

    for (const body of [{}, { dueDate: FUTURE }, { titel: 'typo' }]) {
      const res = await request(server())
        .patch(taskPath(task.id))
        .set('Cookie', cookie)
        .send(body);

      // whitelist:true STRIPS unknown properties, so { dueDate } arrives as {}.
      // A 200 here would tell the client an edit landed that never happened.
      expect(res.status).toBe(400);
      expect((res.body as ApiError).code).toBe('validation_failed');
    }

    const after = await storedRow(task.id);
    expect(after.title).toBe('Untouched');
    expect(after.updated_at.toISOString()).toBe(
      before.updated_at.toISOString(),
    );
  });

  it('AC-2/AC-6: invalid title, dueAt and priority each return 400 naming their field', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, {
      title: 'Good',
      dueAt: FUTURE,
      priority: 'low',
    });

    const cases: Array<[Record<string, unknown>, string]> = [
      [{ title: '' }, 'title'],
      [{ title: '   ' }, 'title'],
      [{ title: 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1) }, 'title'],
      [{ title: 42 }, 'title'],
      [{ dueAt: 'not-a-date' }, 'dueAt'],
      [{ dueAt: 1234567890 }, 'dueAt'],
      [{ priority: 'urgent' }, 'priority'],
      [{ priority: 'HIGH' }, 'priority'],
      [{ priority: null }, 'priority'],
    ];

    for (const [body, field] of cases) {
      const res = await request(server())
        .patch(taskPath(task.id))
        .set('Cookie', cookie)
        .send(body);

      expect(res.status).toBe(400);
      const err = res.body as ApiError;
      expect(err.code).toBe('validation_failed');
      expect(err.fields?.[0]?.field).toBe(field);
    }

    // Nothing above was written.
    const stored = await storedRow(task.id);
    expect(stored.title).toBe('Good');
    expect(stored.due_at?.toISOString()).toBe(FUTURE);
    expect(stored.priority).toBe('low');
  });

  it('AC-2: the 500-character boundary is accepted on update', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, { title: 'short' });
    const max = 'y'.repeat(TASK_TITLE_MAX_LENGTH);

    const res = await request(server())
      .patch(taskPath(task.id))
      .set('Cookie', cookie)
      .send({ title: max });

    expect(res.status).toBe(200);
    expect((res.body as UpdateTaskResponse).task.title).toBe(max);
  });

  it('AC-8: unknown, foreign, non-uuid and soft-deleted ids give BYTE-IDENTICAL 404s on both routes', async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    const task = await addTask(a.cookie, a.inbox, { title: "A's task" });
    const deleted = await addTask(a.cookie, a.inbox, { title: 'Gone' });
    await db.query('UPDATE tasks SET deleted_at = now() WHERE id = $1', [
      deleted.id,
    ]);

    const ids = [randomUUID(), task.id, 'not-a-uuid', deleted.id];
    const cookies = [b.cookie, b.cookie, b.cookie, a.cookie];

    const gets = [];
    const patches = [];
    for (let i = 0; i < ids.length; i++) {
      gets.push(
        await request(server()).get(taskPath(ids[i])).set('Cookie', cookies[i]),
      );
      patches.push(
        await request(server())
          .patch(taskPath(ids[i]))
          .set('Cookie', cookies[i])
          .send({ title: 'hijacked' }),
      );
    }

    for (const res of [...gets, ...patches]) {
      expect(res.status).toBe(404);
      expect(res.body as ApiError).toMatchObject({
        statusCode: 404,
        code: TASK_ERROR_CODES.taskNotFound,
      });
    }
    // Byte-identical, not merely same-shaped: an attacker must not be able to
    // distinguish "exists but not yours" from "does not exist" by any means.
    const bodies = [...gets, ...patches].map((r) => JSON.stringify(r.body));
    expect(new Set(bodies).size).toBe(1);

    // A's task survived every attempt untouched.
    expect((await storedRow(task.id)).title).toBe("A's task");
  });

  it('AC-9: no session, and a revoked session, are 401 on both routes and write nothing', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, { title: 'Protected' });

    await request(server()).post('/auth/logout').set('Cookie', cookie);

    for (const c of [undefined, cookie]) {
      const get = c
        ? await request(server()).get(taskPath(task.id)).set('Cookie', c)
        : await request(server()).get(taskPath(task.id));
      const patch = c
        ? await request(server())
            .patch(taskPath(task.id))
            .set('Cookie', c)
            .send({ title: 'changed' })
        : await request(server())
            .patch(taskPath(task.id))
            .send({ title: 'changed' });

      expect(get.status).toBe(401);
      expect(patch.status).toBe(401);
      expect((patch.body as ApiError).code).toBe('unauthenticated');
    }

    expect((await storedRow(task.id)).title).toBe('Protected');
  });

  it('AC-12: GET and PATCH each resolve in two queries, well inside 300 ms', async () => {
    const { cookie, inbox } = await signedInUser();
    const task = await addTask(cookie, inbox, { title: 'Measured' });

    const spy = jest.spyOn(db, 'query');

    // The session guard costs two statements of its own on EVERY authenticated
    // route (resolve the session, then touch last_used_at). Those are
    // cross-cutting, not this endpoint's, so they are filtered out by table —
    // the accounting FEAT-010's AC-8 test established.
    const ownQueries = () =>
      spy.mock.calls.filter(([sql]) =>
        /FROM tasks|UPDATE tasks|FROM lists l/.test(sql),
      );

    spy.mockClear();
    const t0 = Date.now();
    const get = await request(server())
      .get(taskPath(task.id))
      .set('Cookie', cookie);
    const getMs = Date.now() - t0;
    const getQueries = ownQueries().length;

    spy.mockClear();
    const t1 = Date.now();
    const patch = await request(server())
      .patch(taskPath(task.id))
      .set('Cookie', cookie)
      .send({ priority: 'high' });
    const patchMs = Date.now() - t1;
    const patchQueries = ownQueries().length;

    spy.mockRestore();

    expect(get.status).toBe(200);
    expect(patch.status).toBe(200);
    // GET = the task, then its list (design D5). PATCH = a single
    // ownership-bearing UPDATE ... RETURNING; its response carries no list, so
    // there is nothing to fetch one for. No N+1, and no read-modify-write round
    // trip per field.
    expect(getQueries).toBe(2);
    expect(patchQueries).toBe(1);
    expect(getMs).toBeLessThan(300);
    expect(patchMs).toBeLessThan(300);
  });
});
