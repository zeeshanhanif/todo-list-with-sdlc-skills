import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  SEARCH_QUERY_MAX_LENGTH,
  type ApiError,
  type SearchResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive GET /search over HTTP. Needs local Postgres.
// FEAT-015 T6 — AC-1/AC-2 (the 200 shape), AC-6 (no matches is a 200 with an
// empty array, not a 404), AC-8 (401; another user's match never appears),
// AC-9 (each 400 names its field), AC-13 (keyset stability under a concurrent
// insert).
const VALID_PW = '9x!vQ2mLp0zR';

describe('search endpoint (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;
  const prevRl = process.env.AUTH_RATELIMIT_MAX;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A disjoint /24 from the other suites' ranges — DEF-001's isolation rule.
  const nextIp = (): string => `198.18.31.${(ipCounter++ % 250) + 1}`;

  const signedInUser = async (): Promise<{ cookie: string; id: string }> => {
    const email = `searchc-${randomUUID()}@example.com`;
    emails.push(email);
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

  const addTask = async (
    ownerId: string,
    listId: string,
    title: string,
    createdAtOffsetMinutes = 0,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, created_at)
       VALUES ($1, $2, $3, now() - ($4 || ' minutes')::interval)`,
      [ownerId, listId, title, String(createdAtOffsetMinutes)],
    );
  };

  const search = (cookie: string, query: string) =>
    request(server()).get(`/search${query}`).set('Cookie', cookie);

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

  it('AC-1/AC-2: returns matching tasks with their list name and status', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    await addTask(id, inbox, 'Quarterly report');
    await addTask(id, inbox, 'Buy milk');

    const res = await search(cookie, '?q=report');

    expect(res.status).toBe(200);
    const body = res.body as SearchResponse;
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      title: 'Quarterly report',
      listName: 'Inbox',
      listId: inbox,
      completedAt: null,
      isOverdue: false,
    });
    expect(body.nextCursor).toBeNull();
  });

  it('AC-6: no matches is a 200 with an empty array, never a 404 (D7)', async () => {
    const { cookie, id } = await signedInUser();
    await addTask(id, await inboxOf(id), 'Buy milk');

    const res = await search(cookie, '?q=nothingmatchesthis');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [], nextCursor: null });
  });

  it("AC-8: another user's matching task never appears", async () => {
    const mine = await signedInUser();
    const theirs = await signedInUser();
    await addTask(theirs.id, await inboxOf(theirs.id), 'their secret report');
    await addTask(mine.id, await inboxOf(mine.id), 'my report');

    const res = await search(mine.cookie, '?q=report');

    expect((res.body as SearchResponse).results.map((r) => r.title)).toEqual([
      'my report',
    ]);
  });

  it('AC-8: 401 without a session, and with a garbage one', async () => {
    for (const headers of [{}, { Cookie: 'sid=not-a-real-session' }]) {
      const res = await request(server()).get('/search?q=report').set(headers);
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    }
  });

  it.each([
    ['an empty q', '?q=', 'q'],
    ['a whitespace q', '?q=%20%20', 'q'],
    ['an over-long q', `?q=${'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1)}`, 'q'],
    ['an unknown status', '?status=archived', 'status'],
    ['an unknown due bucket', '?due=yesterday', 'due'],
    ['a zero limit', '?q=report&limit=0', 'limit'],
    ['an over-max limit', '?q=report&limit=51', 'limit'],
    ['a non-numeric limit', '?q=report&limit=lots', 'limit'],
    ['a garbage cursor', '?q=report&cursor=not-a-cursor', 'cursor'],
  ])('AC-9: %s is a 400 naming its own field', async (_label, query, field) => {
    const { cookie } = await signedInUser();

    const res = await search(cookie, query);

    expect(res.status).toBe(400);
    const err = res.body as ApiError;
    expect(err.code).toBe('validation_failed');
    expect(err.fields?.[0].field).toBe(field);
  });

  it('AC-9: no criteria at all is a 400 on the synthetic field `_` (D6)', async () => {
    const { cookie } = await signedInUser();

    const res = await search(cookie, '');

    expect(res.status).toBe(400);
    expect((res.body as ApiError).fields?.[0].field).toBe('_');
  });

  it('AC-9: a limit alone is still no criteria', async () => {
    const { cookie } = await signedInUser();

    const res = await search(cookie, '?limit=10');

    expect(res.status).toBe(400);
    expect((res.body as ApiError).fields?.[0].field).toBe('_');
  });

  it('AC-7: limit and cursor page the result set over HTTP', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    for (let i = 0; i < 5; i++) await addTask(id, inbox, `report ${i}`, i);

    const first = await search(cookie, '?q=report&limit=2');
    const firstBody = first.body as SearchResponse;
    expect(firstBody.results.map((r) => r.title)).toEqual([
      'report 0',
      'report 1',
    ]);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await search(
      cookie,
      `?q=report&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
    );
    const secondBody = second.body as SearchResponse;
    expect(secondBody.results.map((r) => r.title)).toEqual([
      'report 2',
      'report 3',
    ]);

    const third = await search(
      cookie,
      `?q=report&limit=2&cursor=${encodeURIComponent(secondBody.nextCursor!)}`,
    );
    const thirdBody = third.body as SearchResponse;
    expect(thirdBody.results.map((r) => r.title)).toEqual(['report 4']);
    expect(thirdBody.nextCursor).toBeNull();
  });

  it('AC-13: a task created between two page requests does not shift the pages', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    for (let i = 0; i < 4; i++) await addTask(id, inbox, `report ${i}`, i);

    const first = await search(cookie, '?q=report&limit=2');
    const firstBody = first.body as SearchResponse;

    // The interloper is NEWER than everything, so under OFFSET it would push
    // page 2 down by one: the reader would see 'report 1' twice and never see
    // 'report 3'. The cursor is anchored to a row, not to a count.
    await addTask(id, inbox, 'report brand new');

    const second = await search(
      cookie,
      `?q=report&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
    );
    const secondBody = second.body as SearchResponse;

    expect(firstBody.results.map((r) => r.title)).toEqual([
      'report 0',
      'report 1',
    ]);
    expect(secondBody.results.map((r) => r.title)).toEqual([
      'report 2',
      'report 3',
    ]);
  });

  it('AC-5: filters combine conjunctively over the wire', async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await inboxOf(id);
    await addTask(id, inbox, 'report to finish');
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at)
       VALUES ($1, $2, 'report already done', now())`,
      [id, inbox],
    );

    const active = await search(cookie, '?q=report&status=active');
    const all = await search(cookie, '?q=report');

    expect((active.body as SearchResponse).results.map((r) => r.title)).toEqual(
      ['report to finish'],
    );
    expect((all.body as SearchResponse).results).toHaveLength(2);
  });
});
