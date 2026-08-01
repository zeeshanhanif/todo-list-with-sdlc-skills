import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ACCOUNT_DELETE_PATH,
  ACCOUNT_EXPORT_PATH,
  AUTH_ERROR_CODES,
  PROFILE_PATH,
  type ApiError,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';
import { APP_CONFIG, type AppConfig } from '../../infra/config';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive POST /account/delete over HTTP. Needs local Postgres.
// FEAT-018 T5 — AC-1 (200 + cleared cookie), AC-3 (a second device's session
// dies), AC-4 (the email registers again), AC-5 (wrong password → 400, account
// intact), AC-6 (missing/false confirm, missing password → 400), AC-7 (401 on
// missing/expired/revoked cookies), AC-13 (429 past the window).
const VALID_PW = '9x!vQ2mLp0zR';

describe('account delete endpoint (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  let config: AppConfig;
  const emails: string[] = [];
  let ipCounter = 0;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A disjoint /24 from the other suites' ranges — DEF-001's isolation rule.
  const nextIp = (): string => `198.18.25.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `deletec-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  const register = async (email: string): Promise<void> => {
    const reg = await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(reg.status).toBe(201); // fixture must be real before anything else
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
  };

  const signIn = async (email: string): Promise<string> => {
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    return setCookie[0].split(';')[0];
  };

  /** Register + verify + sign in; returns the session cookie, id and Inbox id. */
  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    email: string;
    inbox: string;
  }> => {
    const email = freshEmail();
    await register(email);
    const cookie = await signIn(email);
    const row = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    const id = row.rows[0].id;
    const inbox = await db.query<{ id: string }>(
      'SELECT id FROM lists WHERE owner_id = $1 AND is_default = true',
      [id],
    );
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title) VALUES ($1, $2, 'Buy milk')`,
      [id, inbox.rows[0].id],
    );
    return { cookie, id, email, inbox: inbox.rows[0].id };
  };

  const deleteFor = (cookie: string) =>
    request(server()).post(ACCOUNT_DELETE_PATH).set('Cookie', cookie);

  const rowCounts = async (userId: string): Promise<Record<string, number>> => {
    const one = async (sql: string): Promise<number> =>
      Number((await db.query<{ n: string }>(sql, [userId])).rows[0].n);
    return {
      users: await one('SELECT count(*) AS n FROM users WHERE id = $1'),
      lists: await one('SELECT count(*) AS n FROM lists WHERE owner_id = $1'),
      tasks: await one('SELECT count(*) AS n FROM tasks WHERE owner_id = $1'),
      sessions: await one(
        'SELECT count(*) AS n FROM sessions WHERE user_id = $1',
      ),
    };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DbService);
    config = app.get(APP_CONFIG);
  });

  afterEach(async () => {
    for (const email of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [email]);
    }
    emails.length = 0;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the success response (AC-1, FR-DATA-003/005)', () => {
    it('AC-1: 200 { status: "account_deleted" } and a Set-Cookie that clears the session', async () => {
      const user = await signedInUser();

      const res = await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'account_deleted' });
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      const cleared = setCookie.find((c) => c.startsWith('sid='));
      expect(cleared).toBeDefined();
      // Express clears by setting an empty value with an expiry in the past.
      expect(cleared).toMatch(/^sid=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('AC-2 (contract level): the account and all of its rows are gone', async () => {
      const user = await signedInUser();
      expect(await rowCounts(user.id)).toEqual({
        users: 1,
        lists: 1,
        tasks: 1,
        sessions: 1,
      });

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true })
        .expect(200);

      expect(await rowCounts(user.id)).toEqual({
        users: 0,
        lists: 0,
        tasks: 0,
        sessions: 0,
      });
    });

    it('AC-3: a session on another device answers 401 on its next request', async () => {
      const user = await signedInUser();
      const secondDevice = await signIn(user.email);
      // The second device is genuinely live before the deletion.
      await request(server())
        .get(PROFILE_PATH)
        .set('Cookie', secondDevice)
        .expect(200);

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true })
        .expect(200);

      const after = await request(server())
        .get(PROFILE_PATH)
        .set('Cookie', secondDevice);
      expect(after.status).toBe(401);
      expect((after.body as ApiError).code).toBe(
        AUTH_ERROR_CODES.unauthenticated,
      );
    });

    it('AC-4: the email address registers again afterwards, sharing no rows with the old account', async () => {
      const user = await signedInUser();

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true })
        .expect(200);

      const again = await request(server())
        .post('/auth/register')
        .set('X-Forwarded-For', nextIp())
        .send({ email: user.email, password: VALID_PW });

      expect(again.status).toBe(201);
      const row = await db.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [user.email],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].id).not.toBe(user.id);
      // A fresh Inbox, not the old one.
      const lists = await db.query<{ id: string }>(
        'SELECT id FROM lists WHERE owner_id = $1',
        [row.rows[0].id],
      );
      expect(lists.rows).toHaveLength(1);
      expect(lists.rows[0].id).not.toBe(user.inbox);
    });

    it('AC-11: the account_deleted row SURVIVES the deletion, with user_id null and the id in detail', async () => {
      const user = await signedInUser();

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true })
        .expect(200);

      // The half no unit test can demonstrate: the row is still there after the
      // cascade ran. Queried by detail, precisely because user_id cannot hold
      // the id (the FK would have rejected it) — technical-design D6.
      const rows = await db.query<{ user_id: string | null; detail: unknown }>(
        `SELECT user_id, detail FROM audit_log
          WHERE event = 'account_deleted' AND detail->>'userId' = $1`,
        [user.id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].user_id).toBeNull();
      expect(rows.rows[0].detail).toEqual({ userId: user.id });
      // The address the deletion released must not survive in the log.
      expect(JSON.stringify(rows.rows[0])).not.toContain(user.email);

      // And the user's earlier sign-in rows were anonymized by the cascade
      // rather than removed (migration 005's SET NULL) — the §8 watch item,
      // asserted so a later schema change cannot quietly turn it into a delete.
      const orphaned = await db.query(
        `SELECT 1 FROM audit_log
          WHERE event = 'sign_in_success' AND user_id = $1`,
        [user.id],
      );
      expect(orphaned.rowCount).toBe(0);
    });

    it('a second delete with the dead cookie is 401, not a second success', async () => {
      const user = await signedInUser();
      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true })
        .expect(200);

      const again = await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true });

      expect(again.status).toBe(401);
      expect((again.body as ApiError).code).toBe(
        AUTH_ERROR_CODES.unauthenticated,
      );
    });
  });

  describe('a wrong password (AC-5, FR-DATA-004; UC-016 alt 3a)', () => {
    it('AC-5: 400 current_password_invalid, naming the field — and nothing is deleted', async () => {
      const user = await signedInUser();

      const res = await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: 'not-my-password', confirm: true });

      expect(res.status).toBe(400);
      const body = res.body as ApiError;
      expect(body.code).toBe(AUTH_ERROR_CODES.currentPasswordInvalid);
      expect(body.fields?.[0].field).toBe('currentPassword');

      expect(await rowCounts(user.id)).toEqual({
        users: 1,
        lists: 1,
        tasks: 1,
        sessions: 1,
      });
    });

    it('AC-5: the caller`s own session still authenticates afterwards', async () => {
      const user = await signedInUser();

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: 'not-my-password', confirm: true })
        .expect(400);

      await request(server()).get(PROFILE_PATH).set('Cookie', user.cookie).expect(200);
    });

    it('AC-12: the failed attempt is recorded, carrying the user id and never the password', async () => {
      const user = await signedInUser();

      await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: 'not-my-password', confirm: true })
        .expect(400);

      const rows = await db.query<{ detail: unknown; user_id: string }>(
        `SELECT user_id, detail FROM audit_log
          WHERE event = 'account_delete_failure' AND user_id = $1`,
        [user.id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].detail).toEqual({ reason: 'wrong_password' });
      expect(JSON.stringify(rows.rows[0])).not.toContain('not-my-password');
    });
  });

  describe('the confirmation and the password field (AC-6, FR-DATA-004)', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['confirm omitted', { currentPassword: VALID_PW }, 'confirm'],
      ['confirm false', { currentPassword: VALID_PW, confirm: false }, 'confirm'],
      [
        'confirm the string "true"',
        { currentPassword: VALID_PW, confirm: 'true' },
        'confirm',
      ],
      ['password omitted', { confirm: true }, 'currentPassword'],
      ['password empty', { currentPassword: '', confirm: true }, 'currentPassword'],
    ];

    it.each(cases)(
      'AC-6: %s → 400 validation_failed naming the field, nothing deleted',
      async (_label, body, field) => {
        const user = await signedInUser();

        const res = await deleteFor(user.cookie)
          .set('X-Forwarded-For', nextIp())
          .send(body);

        expect(res.status).toBe(400);
        const err = res.body as ApiError;
        expect(err.code).toBe('validation_failed');
        expect(err.fields?.map((f) => f.field)).toContain(field);

        expect((await rowCounts(user.id)).users).toBe(1);
      },
    );
  });

  describe('authentication (AC-7, FR-AUTHZ-001)', () => {
    it('AC-7: no cookie → 401 unauthenticated', async () => {
      const res = await request(server())
        .post(ACCOUNT_DELETE_PATH)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true });

      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe(AUTH_ERROR_CODES.unauthenticated);
    });

    it('AC-7: a revoked (signed-out) cookie → 401, and the account survives', async () => {
      const user = await signedInUser();
      await request(server())
        .post('/auth/logout')
        .set('Cookie', user.cookie)
        .expect(200);

      const res = await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true });

      expect(res.status).toBe(401);
      expect((await rowCounts(user.id)).users).toBe(1);
    });

    it('AC-7: an expired session cookie → 401, and the account survives', async () => {
      const user = await signedInUser();
      await db.query(
        `UPDATE sessions SET expires_at = now() - interval '1 minute'
          WHERE user_id = $1`,
        [user.id],
      );

      const res = await deleteFor(user.cookie)
        .set('X-Forwarded-For', nextIp())
        .send({ currentPassword: VALID_PW, confirm: true });

      expect(res.status).toBe(401);
      expect((await rowCounts(user.id)).users).toBe(1);
    });
  });

  describe('rate limiting (AC-13, NFR-SEC-006; D9)', () => {
    it('AC-13: past the per-IP window maximum → 429 rate_limited with retryAfterSeconds', async () => {
      const user = await signedInUser();
      const ip = nextIp();
      const max = config.authRateLimitMax;

      // Wrong password each time: the account must survive to be rate-limited.
      let last = await deleteFor(user.cookie)
        .set('X-Forwarded-For', ip)
        .send({ currentPassword: 'wrong', confirm: true });
      for (let i = 0; i < max; i++) {
        last = await deleteFor(user.cookie)
          .set('X-Forwarded-For', ip)
          .send({ currentPassword: 'wrong', confirm: true });
      }

      expect(last.status).toBe(429);
      const body = last.body as ApiError & { retryAfterSeconds?: number };
      expect(body.code).toBe(AUTH_ERROR_CODES.rateLimited);
      expect(typeof body.retryAfterSeconds).toBe('number');
      expect((await rowCounts(user.id)).users).toBe(1);
    });

    it('the export endpoint stays unthrottled — D9 is a difference, not an oversight', async () => {
      const user = await signedInUser();
      const ip = nextIp();

      let last = await request(server())
        .post(ACCOUNT_EXPORT_PATH)
        .set('Cookie', user.cookie)
        .set('X-Forwarded-For', ip);
      for (let i = 0; i < config.authRateLimitMax + 1; i++) {
        last = await request(server())
          .post(ACCOUNT_EXPORT_PATH)
          .set('Cookie', user.cookie)
          .set('X-Forwarded-For', ip);
      }

      expect(last.status).toBe(200);
    });
  });
});
