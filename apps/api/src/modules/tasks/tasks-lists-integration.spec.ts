import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  listTasksPath,
  type CreateListResponse,
  type DeleteListResponse,
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
});
