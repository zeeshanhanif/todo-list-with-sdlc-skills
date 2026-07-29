import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  completeTaskPath,
  listTasksPath,
  reopenTaskPath,
  restoreTaskPath,
  taskPath,
  type CreateListResponse,
  type CreateTaskResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';
import { RealtimePublisher } from './realtime.publisher';

// FEAT-019 T4 / AC-3, AC-4, AC-12 — the interceptor over the real app, driven
// route by route. The point of this spec is coverage of the *set*: a write route
// that forgets to signal is exactly the bug D8's interceptor exists to prevent,
// and only an enumeration catches it. Needs local Postgres.
const VALID_PW = '9x!vQ2mLp0zR';
const IP_PREFIX = '203.0.115.';

/** Records what was published, and can be made slow or broken (AC-4). */
class FakePublisher extends RealtimePublisher {
  readonly published: string[] = [];
  behaviour: 'ok' | 'reject' | 'slow' = 'ok';

  async publishChanged(userId: string): Promise<void> {
    this.published.push(userId);
    if (this.behaviour === 'reject') throw new Error('realtime is down');
    if (this.behaviour === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

describe('change-signal interceptor (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const publisher = new FakePublisher();
  const emails: string[] = [];
  let ipCounter = 0;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // Own IP range, disjoint from every other spec's (DEF-001).
  const nextIp = (): string => `${IP_PREFIX}${(ipCounter++ % 250) + 1}`;

  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    inbox: string;
  }> => {
    const email = `signal-${randomUUID()}@example.com`;
    emails.push(email);
    const registered = await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
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
    const row = await db.query<{ id: string; list_id: string }>(
      `SELECT u.id, l.id AS list_id FROM users u
         JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [email],
    );
    return { cookie, id: row.rows[0].id, inbox: row.rows[0].list_id };
  };

  const newTask = async (user: { cookie: string; inbox: string }) => {
    const res = await request(server())
      .post(listTasksPath(user.inbox))
      .set('Cookie', user.cookie)
      .send({ title: `t-${randomUUID()}` });
    expect(res.status).toBe(201);
    return (res.body as CreateTaskResponse).task.id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RealtimePublisher)
      .useValue(publisher)
      .compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DbService);
  });

  afterEach(() => {
    publisher.published.length = 0;
    publisher.behaviour = 'ok';
  });

  afterAll(async () => {
    for (const email of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [email]);
    }
    await db.query('DELETE FROM auth_rate_buckets WHERE ip LIKE $1', [
      `${IP_PREFIX}%`,
    ]);
    await app.close();
  });

  it('signals once for every one of the ten mutating routes (AC-3)', async () => {
    const user = await signedInUser();
    const c = user.cookie;
    publisher.published.length = 0;

    // Each entry: run the write, then assert exactly one signal for THIS user.
    const listRes = await request(server())
      .post('/lists')
      .set('Cookie', c)
      .send({ name: `L-${randomUUID().slice(0, 8)}` });
    expect(listRes.status).toBe(201);
    const listId = (listRes.body as CreateListResponse).list.id;
    expect(publisher.published).toEqual([user.id]); // 1: POST /lists

    const checks: { name: string; run: () => Promise<request.Response> }[] = [
      {
        name: 'PATCH /lists/:id',
        run: () =>
          request(server())
            .patch(`/lists/${listId}`)
            .set('Cookie', c)
            .send({ name: `R-${randomUUID().slice(0, 8)}` }),
      },
      {
        name: 'POST /lists/reorder',
        run: () =>
          request(server())
            .post('/lists/reorder')
            .set('Cookie', c)
            .send({ listIds: [listId, user.inbox] }),
      },
      {
        name: 'POST /lists/:id/tasks',
        run: () =>
          request(server())
            .post(listTasksPath(user.inbox))
            .set('Cookie', c)
            .send({ title: 'signal me' }),
      },
      {
        name: 'DELETE /lists/:id',
        run: () =>
          request(server()).delete(`/lists/${listId}`).set('Cookie', c),
      },
    ];

    for (const check of checks) {
      publisher.published.length = 0;
      const res = await check.run();
      expect([200, 201]).toContain(res.status);
      expect({ [check.name]: publisher.published }).toEqual({
        [check.name]: [user.id],
      });
    }

    // The five task-item routes, in an order that keeps each one legal.
    const taskId = await newTask(user);
    const itemChecks: {
      name: string;
      run: () => Promise<request.Response>;
    }[] = [
      {
        name: 'PATCH /tasks/:id',
        run: () =>
          request(server())
            .patch(taskPath(taskId))
            .set('Cookie', c)
            .send({ title: 'renamed' }),
      },
      {
        name: 'POST /tasks/:id/complete',
        run: () =>
          request(server()).post(completeTaskPath(taskId)).set('Cookie', c),
      },
      {
        name: 'POST /tasks/:id/reopen',
        run: () =>
          request(server()).post(reopenTaskPath(taskId)).set('Cookie', c),
      },
      {
        name: 'DELETE /tasks/:id',
        run: () => request(server()).delete(taskPath(taskId)).set('Cookie', c),
      },
      {
        name: 'POST /tasks/:id/restore',
        run: () =>
          request(server()).post(restoreTaskPath(taskId)).set('Cookie', c),
      },
    ];

    for (const check of itemChecks) {
      publisher.published.length = 0;
      const res = await check.run();
      expect([200, 201]).toContain(res.status);
      expect({ [check.name]: publisher.published }).toEqual({
        [check.name]: [user.id],
      });
    }
  });

  it('signals nothing when a write is rejected (AC-3)', async () => {
    const user = await signedInUser();
    const c = user.cookie;
    const unknownId = randomUUID();

    const rejected: { name: string; res: request.Response }[] = [
      {
        name: '400 validation_failed',
        res: await request(server())
          .post(listTasksPath(user.inbox))
          .set('Cookie', c)
          .send({ title: '   ' }),
      },
      {
        name: '404 unknown task',
        res: await request(server())
          .delete(taskPath(unknownId))
          .set('Cookie', c),
      },
      {
        name: '404 unknown list',
        res: await request(server())
          .patch(`/lists/${unknownId}`)
          .set('Cookie', c)
          .send({ name: 'nope' }),
      },
      {
        name: '401 no cookie',
        res: await request(server())
          .post(listTasksPath(user.inbox))
          .send({ title: 'nope' }),
      },
    ];

    for (const { name, res } of rejected) {
      expect({ [name]: res.status >= 400 }).toEqual({ [name]: true });
    }
    expect(publisher.published).toEqual([]);
  });

  it('signals nothing on reads (AC-3)', async () => {
    const user = await signedInUser();
    publisher.published.length = 0;

    const taskId = await newTask(user);
    publisher.published.length = 0;

    await request(server())
      .get('/lists')
      .set('Cookie', user.cookie)
      .expect(200);
    await request(server())
      .get(listTasksPath(user.inbox))
      .set('Cookie', user.cookie)
      .expect(200);
    await request(server())
      .get(taskPath(taskId))
      .set('Cookie', user.cookie)
      .expect(200);

    expect(publisher.published).toEqual([]);
  });

  it('signals the session user, never a target owner (AC-3, FR-AUTHZ-002)', async () => {
    const owner = await signedInUser();
    const stranger = await signedInUser();
    const taskId = await newTask(owner);
    publisher.published.length = 0;

    // B deletes A's task: a uniform 404, and no signal at all — neither to A
    // (nothing changed) nor about A (B must not learn A exists).
    await request(server())
      .delete(taskPath(taskId))
      .set('Cookie', stranger.cookie)
      .expect(404);
    expect(publisher.published).toEqual([]);
  });

  it('a failing publisher leaves the write untouched (AC-4)', async () => {
    const user = await signedInUser();
    publisher.behaviour = 'reject';

    const res = await request(server())
      .post(listTasksPath(user.inbox))
      .set('Cookie', user.cookie)
      .send({ title: 'still created' });

    // The write is committed and its response is normal — sync failure must
    // never surface as a failed user action.
    expect(res.status).toBe(201);
    expect((res.body as CreateTaskResponse).task.title).toBe('still created');
    const stored = await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tasks WHERE title = $1',
      ['still created'],
    );
    expect(stored.rows[0].count).toBe('1');
  });

  it('a slow publisher delays but does not break the write (AC-4)', async () => {
    const user = await signedInUser();
    publisher.behaviour = 'slow';

    const started = Date.now();
    const res = await request(server())
      .post(listTasksPath(user.inbox))
      .set('Cookie', user.cookie)
      .send({ title: 'slow signal' });

    expect(res.status).toBe(201);
    // Awaited before the response is released (D3) — the 50 ms is visible.
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });
});
