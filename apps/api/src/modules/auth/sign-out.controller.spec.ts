import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type ApiError, type SignOutResponse } from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app and drive POST /auth/logout over HTTP.
// Covers AC-1 (200 + clear-cookie + session gone + subsequent 401),
// AC-2 (idempotent: no/invalid cookie → 200), AC-3 (only the current session
// revoked). Needs local Postgres.
const VALID_PW = '9x!vQ2mLp0zR';

describe('POST /auth/logout (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  const prevRl = process.env.AUTH_RATELIMIT_MAX;
  let ipCounter = 0;
  const nextIp = (): string => `192.0.2.${(ipCounter++ % 250) + 1}`;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const freshEmail = (): string => {
    const e = `sout-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register + verify + sign in; return the session cookie string.
  const signedInCookie = async (email: string): Promise<string> => {
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const login = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    return (login.headers['set-cookie'] as unknown as string[])[0];
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
      await db.query('DELETE FROM users WHERE email = $1', [e]); // cascades sessions
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    if (prevRl === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevRl;
    await app.close();
  });

  it('AC-1: signed-in logout → 200, clears the cookie, deletes the session, and the cookie no longer authenticates', async () => {
    const email = freshEmail();
    const cookie = await signedInCookie(email);

    const res = await request(server())
      .post('/auth/logout')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect((res.body as SignOutResponse).status).toBe('signed_out');
    // Clear-cookie: sid emptied with a past expiry.
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(setCookie).toMatch(/^sid=;/);
    expect(setCookie).toMatch(/1970|Max-Age=0/i);

    // Session row gone.
    const id = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    const sessions = await db.query(
      'SELECT id FROM sessions WHERE user_id = $1',
      [id.rows[0].id],
    );
    expect(sessions.rows).toHaveLength(0);

    // Old cookie no longer authenticates.
    const after = await request(server())
      .get('/auth/session')
      .set('Cookie', cookie);
    expect(after.status).toBe(401);
    expect((after.body as ApiError).code).toBe('unauthenticated');
  });

  it('AC-2: logout is idempotent — 200 with no cookie and with an invalid cookie', async () => {
    const noCookie = await request(server()).post('/auth/logout');
    expect(noCookie.status).toBe(200);
    expect((noCookie.body as SignOutResponse).status).toBe('signed_out');

    const badCookie = await request(server())
      .post('/auth/logout')
      .set('Cookie', 'sid=not-a-real-token');
    expect(badCookie.status).toBe(200);
    expect((badCookie.body as SignOutResponse).status).toBe('signed_out');
  });

  it("AC-3: logging out one session leaves the user's other session valid", async () => {
    const email = freshEmail();
    const cookieA = await signedInCookie(email);
    // Second login for the same (now verified) user → second session.
    const loginB = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    const cookieB = (loginB.headers['set-cookie'] as unknown as string[])[0];

    await request(server()).post('/auth/logout').set('Cookie', cookieA);

    // A is revoked, B still authenticates.
    const aAfter = await request(server())
      .get('/auth/session')
      .set('Cookie', cookieA);
    const bAfter = await request(server())
      .get('/auth/session')
      .set('Cookie', cookieB);
    expect(aAfter.status).toBe(401);
    expect(bAfter.status).toBe(200);
  });
});
