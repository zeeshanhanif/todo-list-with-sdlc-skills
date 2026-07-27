import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AUTH_ERROR_CODES,
  PASSWORD_MIN_LENGTH,
  SESSION_COOKIE,
  type ApiError,
  type ChangePasswordResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app and drive POST /auth/change-password.
// Covers AC-1 (200 password_changed + new password signs in), AC-2 (a second
// device's cookie dies), AC-3 (the caller's cookie is rotated, not killed),
// AC-4 (400 current_password_invalid, caller still authenticated), AC-5 (400
// validation_failed on newPassword), AC-6 (401 unauthenticated, nothing
// changed), AC-7 (400 validation_failed + fields[]), AC-8 (429 in its own
// per-IP bucket).
const OLD_PW = '9x!vQ2mLp0zR';
const NEW_PW = 'N3w!pw-Str0ngZ';
// DEF-001: this spec owns this synthetic-IP range exclusively — specs run in
// parallel workers against one database and clean their own auth_rate_buckets
// rows by prefix, so a shared range lets one suite reset another's counter
// mid-test. Enforced by common/rate-limit/rate-limit-isolation.spec.ts.
const IP_PREFIX = '198.51.100.';

describe('POST /auth/change-password (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  const prevRl = process.env.AUTH_RATELIMIT_MAX;
  let ipCounter = 0;
  const nextIp = (): string => `${IP_PREFIX}${(ipCounter++ % 250) + 1}`;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const freshEmail = (): string => {
    const e = `chpwc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** The `sid=<value>` pair from a Set-Cookie header list. */
  const sidOf = (setCookie: string[] | undefined): string => {
    const raw = (setCookie ?? []).find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`),
    );
    return (raw ?? '').split(';')[0];
  };

  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });
    expect(res.status).toBe(200);
    return sidOf(res.headers['set-cookie'] as unknown as string[]);
  };

  /** A verified, registered user with `devices` independent session cookies. */
  const signedIn = async (
    devices = 1,
  ): Promise<{ email: string; cookies: string[] }> => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: OLD_PW });
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const cookies: string[] = [];
    for (let i = 0; i < devices; i++) {
      cookies.push(await login(email, OLD_PW));
    }
    return { email, cookies };
  };

  const change = (cookie: string, body: unknown) =>
    request(server())
      .post('/auth/change-password')
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', cookie)
      .send(body);

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
      await db.query('DELETE FROM users WHERE email = $1', [e]);
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
    await db.query('DELETE FROM auth_rate_buckets WHERE ip LIKE $1', [
      `${IP_PREFIX}%`,
    ]);
  });

  afterAll(async () => {
    if (prevRl === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevRl;
    await app.close();
  });

  it('AC-1: 200 password_changed — the new password signs in, the old one does not', async () => {
    const { email, cookies } = await signedIn();

    const res = await change(cookies[0], {
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });
    expect(res.status).toBe(200);
    expect((res.body as ChangePasswordResponse).status).toBe(
      'password_changed',
    );

    const withNew = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: NEW_PW });
    expect(withNew.status).toBe(200);

    const withOld = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: OLD_PW });
    expect(withOld.status).toBe(401);
    expect((withOld.body as ApiError).code).toBe('invalid_credentials');
  });

  it("AC-2: a second device's cookie no longer authenticates after the change", async () => {
    const { cookies } = await signedIn(2);
    const [caller, other] = cookies;

    const before = await request(server())
      .get('/auth/session')
      .set('Cookie', other);
    expect(before.status).toBe(200);

    await change(caller, {
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    }).expect(200);

    const after = await request(server())
      .get('/auth/session')
      .set('Cookie', other);
    expect(after.status).toBe(401);
    expect((after.body as ApiError).code).toBe('unauthenticated');
  });

  it("AC-3: the caller's session is rotated — the new cookie authenticates, the presented one does not", async () => {
    const { cookies } = await signedIn();
    const presented = cookies[0];

    const res = await change(presented, {
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });
    expect(res.status).toBe(200);

    const rotated = sidOf(res.headers['set-cookie'] as unknown as string[]);
    expect(rotated).not.toBe('');
    expect(rotated).not.toBe(presented);

    const withRotated = await request(server())
      .get('/auth/session')
      .set('Cookie', rotated);
    expect(withRotated.status).toBe(200);

    const withPresented = await request(server())
      .get('/auth/session')
      .set('Cookie', presented);
    expect(withPresented.status).toBe(401);

    // NFR-SEC-007: the rotated cookie keeps the HttpOnly + SameSite attributes.
    const rawSetCookie = (
      res.headers['set-cookie'] as unknown as string[]
    ).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) as string;
    expect(rawSetCookie).toMatch(/HttpOnly/i);
    expect(rawSetCookie).toMatch(/SameSite=Lax/i);
  });

  it('AC-4: a wrong current password → 400 current_password_invalid; the caller stays authenticated', async () => {
    const { email, cookies } = await signedIn();

    const res = await change(cookies[0], {
      currentPassword: 'definitely-not-it',
      newPassword: NEW_PW,
    });
    expect(res.status).toBe(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('current_password_invalid');
    expect(body.fields?.some((f) => f.field === 'currentPassword')).toBe(true);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Nothing changed: the session still resolves and the old password still works.
    const session = await request(server())
      .get('/auth/session')
      .set('Cookie', cookies[0]);
    expect(session.status).toBe(200);
    const stillOld = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: OLD_PW });
    expect(stillOld.status).toBe(200);
  });

  it('AC-5: a weak new password → 400 validation_failed with a newPassword field error', async () => {
    const { cookies } = await signedIn();

    const res = await change(cookies[0], {
      currentPassword: OLD_PW,
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('validation_failed');
    // AC-5 requires the *specific requirement* (NFR-SEC-003's bound), not merely
    // a non-empty string: assert the message states the policy that was missed.
    const newPwField = body.fields?.find((f) => f.field === 'newPassword');
    expect(newPwField).toBeDefined();
    expect(newPwField?.message).toMatch(
      new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`, 'i'),
    );

    // Unchanged: the session survives and the current password still authenticates.
    const session = await request(server())
      .get('/auth/session')
      .set('Cookie', cookies[0]);
    expect(session.status).toBe(200);
  });

  it('AC-6: no cookie, a bogus cookie, and a revoked cookie all → 401 unauthenticated with no change', async () => {
    const { email, cookies } = await signedIn();

    const noCookie = await request(server())
      .post('/auth/change-password')
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(noCookie.status).toBe(401);
    expect((noCookie.body as ApiError).code).toBe('unauthenticated');

    const bogus = await change(`${SESSION_COOKIE}=not-a-real-token`, {
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });
    expect(bogus.status).toBe(401);

    // The password was not changed by either attempt.
    expect(
      (
        await request(server())
          .post('/auth/login')
          .set('X-Forwarded-For', nextIp())
          .send({ email, password: OLD_PW })
      ).status,
    ).toBe(200);

    // A cookie revoked by a real change is equally rejected.
    await change(cookies[0], {
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    }).expect(200);
    const revoked = await change(cookies[0], {
      currentPassword: NEW_PW,
      newPassword: OLD_PW,
    });
    expect(revoked.status).toBe(401);
  });

  it('AC-7: missing currentPassword / newPassword → 400 validation_failed with fields[]', async () => {
    const { cookies } = await signedIn();

    const missingBoth = await change(cookies[0], {});
    expect(missingBoth.status).toBe(400);
    const body = missingBoth.body as ApiError;
    expect(body.code).toBe('validation_failed');
    // AC-7 requires fields[] to NAME the offending field — a non-empty array is
    // not the criterion.
    const named = body.fields?.map((f) => f.field) ?? [];
    expect(named).toContain('currentPassword');
    expect(named).toContain('newPassword');

    const blankCurrent = await change(cookies[0], {
      currentPassword: '',
      newPassword: NEW_PW,
    });
    expect(blankCurrent.status).toBe(400);
    const blankBody = blankCurrent.body as ApiError;
    expect(blankBody.code).toBe('validation_failed');
    expect(blankBody.fields?.map((f) => f.field)).toContain('currentPassword');
  });

  it("AC-8: per-IP rate-limited (429) in its own bucket — login's allowance is unaffected", async () => {
    const { email, cookies } = await signedIn();
    process.env.AUTH_RATELIMIT_MAX = '2';
    try {
      const ip = `${IP_PREFIX}251`;
      let last: { status: number; body: unknown } = { status: 0, body: null };
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/change-password')
          .set('X-Forwarded-For', ip)
          .set('Cookie', cookies[0])
          .send({ currentPassword: 'wrong', newPassword: NEW_PW });
        last = { status: r.status, body: r.body };
      }
      expect(last.status).toBe(429);
      // AC-8 names the code and the retry hint, not just the status.
      const limited = last.body as ApiError & { retryAfterSeconds?: number };
      expect(limited.code).toBe(AUTH_ERROR_CODES.rateLimited);
      expect(limited.retryAfterSeconds).toBeGreaterThan(0);

      // Same IP, different route: the login bucket is untouched.
      const loginRes = await request(server())
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password: OLD_PW });
      expect(loginRes.status).toBe(200);

      // …and the reverse direction ("and vice versa"): exhausting login's bucket
      // on a fresh IP must not rate-limit change-password from that same IP.
      const ip2 = `${IP_PREFIX}252`;
      let loginStatus = 0;
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/login')
          .set('X-Forwarded-For', ip2)
          .send({ email: 'nobody@example.com', password: OLD_PW });
        loginStatus = r.status;
      }
      expect(loginStatus).toBe(429);
      const changeAfter = await request(server())
        .post('/auth/change-password')
        .set('X-Forwarded-For', ip2)
        .set('Cookie', cookies[0])
        .send({ currentPassword: 'wrong', newPassword: NEW_PW });
      expect(changeAfter.status).toBe(400); // reached the handler, not throttled
    } finally {
      process.env.AUTH_RATELIMIT_MAX = '1000';
      await db.query('DELETE FROM auth_rate_buckets WHERE ip LIKE $1', [
        `${IP_PREFIX}25%`,
      ]);
    }
  });
});
