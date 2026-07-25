import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  type ApiError,
  type SignInResponse,
  type SessionResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';
import { sessionCookieOptions } from '../../common/authz/session.constants';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive POST /auth/login + GET /auth/session over HTTP. Needs local Postgres.
// Covers AC-1 (200 + Set-Cookie), AC-2 (identical 401), AC-3 (403/401),
// AC-4 (Secure gated on), AC-5 (423), AC-6 (429 on login + retrofit),
// AC-7 (session 401/200), AC-9 (400 validation).
const VALID_PW = '9x!vQ2mLp0zR';
const WRONG_PW = 'nope-not-it-000';
const IP_PREFIX = `192.0.2.`; // TEST-NET; unique last octet per test isolates buckets

describe('POST /auth/login + GET /auth/session (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  const prevMax = process.env.LOGIN_MAX_FAILED_ATTEMPTS;
  const prevRl = process.env.AUTH_RATELIMIT_MAX;
  let ipCounter = 0;
  const nextIp = (): string => `${IP_PREFIX}${(ipCounter++ % 250) + 1}`;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const freshEmail = (): string => {
    const e = `sic-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register via the endpoint, then optionally flip verified_at.
  const makeUser = async (verified: boolean): Promise<string> => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    if (verified) {
      await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
        email,
      ]);
    }
    return email;
  };

  beforeAll(async () => {
    process.env.LOGIN_MAX_FAILED_ATTEMPTS = '3';
    process.env.AUTH_RATELIMIT_MAX = '1000'; // effectively off except where set low
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
    await db.query('DELETE FROM auth_rate_buckets WHERE ip LIKE $1', [
      `${IP_PREFIX}%`,
    ]);
  });

  afterAll(async () => {
    if (prevMax === undefined) delete process.env.LOGIN_MAX_FAILED_ATTEMPTS;
    else process.env.LOGIN_MAX_FAILED_ATTEMPTS = prevMax;
    if (prevRl === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevRl;
    await app.close();
  });

  it('AC-1/AC-4: 200 signed_in + Set-Cookie (HttpOnly, SameSite) for valid credentials', async () => {
    const email = await makeUser(true);
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });

    expect(res.status).toBe(200);
    const body = res.body as SignInResponse;
    expect(body.status).toBe('signed_in');
    expect(body.user.email).toBe(email);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const sid = setCookie.find((c) => c.startsWith('sid='));
    expect(sid).toBeDefined();
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);
    // AC-4: the Secure attribute is emitted when cookieSecure is on (production).
    expect(sessionCookieOptions(true, 1000).secure).toBe(true);
  });

  it('AC-2: unknown email and wrong password return an identical 401 invalid_credentials', async () => {
    const unknownRes = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: freshEmail(), password: VALID_PW });

    const email = await makeUser(true);
    const wrongRes = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: WRONG_PW });

    expect(unknownRes.status).toBe(401);
    expect(wrongRes.status).toBe(401);
    expect((unknownRes.body as ApiError).code).toBe('invalid_credentials');
    // Byte-identical envelopes (no enumeration).
    expect(wrongRes.body).toEqual(unknownRes.body);
    expect(wrongRes.headers['set-cookie']).toBeUndefined();
  });

  it('AC-3: unverified account → 403 email_not_verified (correct pw) / 401 (wrong pw)', async () => {
    const email = await makeUser(false);
    const okPw = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    const badPw = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: WRONG_PW });

    expect(okPw.status).toBe(403);
    expect((okPw.body as ApiError).code).toBe('email_not_verified');
    expect(badPw.status).toBe(401);
    expect((badPw.body as ApiError).code).toBe('invalid_credentials');
  });

  it('AC-5: lockout → 423 account_locked with retryAfterSeconds', async () => {
    const email = await makeUser(true);
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      await request(server())
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password: WRONG_PW });
    }
    const locked = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: VALID_PW });

    expect(locked.status).toBe(423);
    const body = locked.body as ApiError & { retryAfterSeconds: number };
    expect(body.code).toBe('account_locked');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('AC-6: 429 rate_limited on /auth/login and on the retrofitted /auth/verify/resend', async () => {
    process.env.AUTH_RATELIMIT_MAX = '2';
    try {
      const loginIp = nextIp();
      const email = await makeUser(true);
      let loginStatus = 0;
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/login')
          .set('X-Forwarded-For', loginIp)
          .send({ email, password: WRONG_PW });
        loginStatus = r.status;
      }
      expect(loginStatus).toBe(429);

      const resendIp = nextIp();
      let resendStatus = 0;
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/verify/resend')
          .set('X-Forwarded-For', resendIp)
          .send({ email: 'someone@example.com' });
        resendStatus = r.status;
      }
      expect(resendStatus).toBe(429);
    } finally {
      process.env.AUTH_RATELIMIT_MAX = '1000';
    }
  });

  it('AC-7: GET /auth/session is 401 without a cookie and 200 with one', async () => {
    const noCookie = await request(server()).get('/auth/session');
    expect(noCookie.status).toBe(401);
    expect((noCookie.body as ApiError).code).toBe('unauthenticated');

    const email = await makeUser(true);
    const login = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];

    const withCookie = await request(server())
      .get('/auth/session')
      .set('Cookie', cookie);
    expect(withCookie.status).toBe(200);
    expect((withCookie.body as SessionResponse).user.email).toBe(email);
  });

  it('AC-9: 400 validation_failed with fields[] for a malformed email / missing password', async () => {
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('validation_failed');
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields?.length).toBeGreaterThan(0);
  });
});
