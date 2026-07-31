import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  SMART_VIEW_ERROR_CODES,
  type ApiError,
  type SmartViewResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive GET /views/{view} over HTTP. Needs local Postgres.
// FEAT-016 T5 — AC-1 (the 200 shape, view echoed, members from two lists),
// AC-8 (an empty view is a 200 with an empty array), AC-9 (paging a 60-member
// view, on BOTH sorts), AC-12 (401; another user's task never appears; an
// unknown view is a 404), AC-13 (each 400 names its field).
const VALID_PW = '9x!vQ2mLp0zR';

describe('smart-view endpoint (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;
  const prevRl = process.env.AUTH_RATELIMIT_MAX;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A disjoint /24 from the other suites' ranges — DEF-001's isolation rule.
  const nextIp = (): string => `198.18.32.${(ipCounter++ % 250) + 1}`;

  const signedInUser = async (): Promise<{ cookie: string; id: string }> => {
    const email = `viewsc-${randomUUID()}@example.com`;
    emails.push(email);
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    await db.query(
      "UPDATE users SET verified_at = now(), timezone = 'UTC' WHERE email = $1",
      [email],
    );
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(res.status).toBe(200); // the fixture must be real before it is used
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

  const addList = async (ownerId: string, name: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position)+1,0) FROM lists WHERE owner_id = $1))
       RETURNING id`,
      [ownerId, name],
    );
    return r.rows[0].id;
  };

  /** Seed a task; `dueInDays` may be fractional and negative (overdue). */
  const addTask = async (
    ownerId: string,
    listId: string,
    title: string,
    dueInDays: number | null = null,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       VALUES ($1, $2, $3,
               CASE WHEN $4::numeric IS NULL THEN NULL
                    ELSE now() + ($4::numeric * interval '1 day') END)`,
      [ownerId, listId, title, dueInDays],
    );
  };

  const view = (cookie: string, path: string) =>
    request(server()).get(`/views/${path}`).set('Cookie', cookie);

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

  it('AC-1: aggregates across every list, echoes the view, and carries list names', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    const work = await addList(id, 'Work');
    await addTask(id, inbox, 'inbox soon', 1);
    await addTask(id, work, 'work later', 2);
    await addTask(id, inbox, 'not upcoming', -1); // overdue, a different view

    const res = await view(cookie, 'upcoming');

    expect(res.status).toBe(200);
    const body = res.body as SmartViewResponse;
    expect(body.view).toBe('upcoming');
    expect(body.nextCursor).toBeNull();
    expect(body.results.map((r) => [r.title, r.listName])).toEqual([
      ['inbox soon', 'Inbox'], // due-ascending (AC-10)
      ['work later', 'Work'],
    ]);
    expect(body.results[0]).toMatchObject({
      listId: inbox,
      completedAt: null,
      isOverdue: false,
    });
  });

  it('AC-8: an empty view is a 200 with an empty array, never a 404', async () => {
    const { cookie, id } = await signedInUser();
    await addTask(id, await inboxOf(id), 'undated task');

    for (const name of ['today', 'upcoming', 'overdue']) {
      const res = await view(cookie, name);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ view: name, results: [], nextCursor: null });
    }
  });

  it.each([
    ['upcoming', 'due'],
    ['all', 'newest'],
  ])(
    'AC-9: %s pages a 60-member view as 25/25/10, distinct and complete (%s sort)',
    async (name) => {
      const { cookie, id } = await signedInUser();
      const inbox = await inboxOf(id);
      const values = Array.from(
        { length: 60 },
        (_, i) =>
          `($1, $2, 'task ${i}', now() + interval '${i + 1} hour' + interval '1 day')`,
      ).join(',');
      await db.query(
        `INSERT INTO tasks (owner_id, list_id, title, due_at) VALUES ${values}`,
        [id, inbox],
      );

      const seen: string[] = [];
      const sizes: number[] = [];
      const cursors: (string | null)[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 3; page++) {
        const q = `${name}?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const res = await view(cookie, q);
        expect(res.status).toBe(200);
        const body = res.body as SmartViewResponse;
        sizes.push(body.results.length);
        cursors.push(body.nextCursor);
        seen.push(...body.results.map((r) => r.id));
        cursor = body.nextCursor ?? undefined;
      }

      expect(sizes).toEqual([25, 25, 10]);
      expect(cursors[0]).not.toBeNull();
      expect(cursors[1]).not.toBeNull();
      expect(cursors[2]).toBeNull();
      expect(new Set(seen).size).toBe(60); // distinct AND complete
    },
  );

  it('AC-9: a limit over the maximum is a 400, not a silently clamped page', async () => {
    const { cookie } = await signedInUser();

    const res = await view(cookie, 'all?limit=51');

    expect(res.status).toBe(400);
    expect((res.body as ApiError).fields?.[0].field).toBe('limit');
  });

  it('AC-12: 401 without a session, and with a garbage one', async () => {
    for (const headers of [{}, { Cookie: 'sid=not-a-real-session' }]) {
      const res = await request(server()).get('/views/today').set(headers);
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    }
  });

  it("AC-12: another user's qualifying task never appears in any view", async () => {
    const mine = await signedInUser();
    const theirs = await signedInUser();
    await addTask(theirs.id, await inboxOf(theirs.id), 'their task', 1);
    await addTask(mine.id, await inboxOf(mine.id), 'my task', 1);

    for (const name of ['upcoming', 'all']) {
      const res = await view(mine.cookie, name);
      expect(
        (res.body as SmartViewResponse).results.map((r) => r.title),
      ).toEqual(['my task']);
    }
  });

  it('AC-12: an unknown view name is a 404 view_not_found (D6)', async () => {
    const { cookie } = await signedInUser();

    const res = await view(cookie, 'yesterday');

    expect(res.status).toBe(404);
    expect((res.body as ApiError).code).toBe(
      SMART_VIEW_ERROR_CODES.viewNotFound,
    );
  });

  it.each([
    ['a zero limit', 'all?limit=0', 'limit'],
    ['a non-numeric limit', 'all?limit=lots', 'limit'],
    ['a fractional limit', 'all?limit=2.5', 'limit'],
    ['a garbage cursor', 'all?cursor=not-a-cursor', 'cursor'],
  ])('AC-13: %s is a 400 naming its own field', async (_label, path, field) => {
    const { cookie } = await signedInUser();

    const res = await view(cookie, path);

    expect(res.status).toBe(400);
    const err = res.body as ApiError;
    expect(err.code).toBe('validation_failed');
    expect(err.fields?.[0].field).toBe(field);
  });

  it('AC-11: a task inserted between pages neither duplicates nor hides a row', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    for (const days of [1, 2, 3, 4]) {
      await addTask(id, inbox, `due in ${days}`, days);
    }

    const first = (await view(cookie, 'upcoming?limit=2'))
      .body as SmartViewResponse;
    expect(first.results.map((r) => r.title)).toEqual(['due in 1', 'due in 2']);

    // Lands INSIDE the range page 1 already returned — the case offset
    // pagination gets wrong by shifting every later page.
    await addTask(id, inbox, 'inserted between', 1.5);

    const second = (
      await view(
        cookie,
        `upcoming?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      )
    ).body as SmartViewResponse;

    expect(second.results.map((r) => r.title)).toEqual([
      'due in 3',
      'due in 4',
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
