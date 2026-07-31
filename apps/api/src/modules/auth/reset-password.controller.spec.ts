import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  type ApiError,
  type ForgotPasswordResponse,
  type ResetPasswordResponse,
} from '@todo/shared';
import { APP_CONFIG, readConfig, type AppConfig } from '../../infra/config';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app and drive POST /auth/forgot + /auth/reset.
// Covers AC-1 (neutral 200), AC-3 (200 password_reset), AC-4 (prior session
// cookie → 401 after reset), AC-5 (400 token_expired/token_invalid), AC-6 (400
// validation_failed password), AC-7 (429 on both), AC-8 (400 validation).
const OLD_PW = '9x!vQ2mLp0zR';
const NEW_PW = 'N3w!pw-Str0ngZ';
// DEF-001: this spec owns this synthetic-IP range exclusively — specs run in
// parallel workers against one database and clean their own auth_rate_buckets
// rows by prefix, so a shared range lets one suite reset another's counter
// mid-test. Enforced by common/rate-limit/rate-limit-isolation.spec.ts.
const IP_PREFIX = '198.18.11.';

describe('POST /auth/forgot + /auth/reset (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  // Thresholds come from injected config (DEF-008): this spec owns the object
  // the app is built with and turns limits up or down on it, instead of mutating
  // process.env and hoping the guard re-reads it.
  const config: AppConfig = {
    ...readConfig(),
    authRateLimitMax: 1000, // effectively off except where a case lowers it
  };
  let ipCounter = 0;
  const nextIp = (): string => `${IP_PREFIX}${(ipCounter++ % 250) + 1}`;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const freshEmail = (): string => {
    const e = `rpc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register + verify + request reset; return { email, cookie?, rawToken }.
  const registeredWithResetToken = async (
    withSession = false,
  ): Promise<{ email: string; rawToken: string; cookie?: string }> => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: OLD_PW });
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    let cookie: string | undefined;
    if (withSession) {
      const login = await request(server())
        .post('/auth/login')
        .set('X-Forwarded-For', nextIp())
        .send({ email, password: OLD_PW });
      cookie = (login.headers['set-cookie'] as unknown as string[])[0];
    }
    await request(server())
      .post('/auth/forgot')
      .set('X-Forwarded-For', nextIp())
      .send({ email });
    const ob = await db.query<{ payload: { token: string } }>(
      "SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'password_reset'",
      [email],
    );
    return { email, rawToken: ob.rows[0].payload.token, cookie };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
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
    await app.close();
  });

  it('AC-1: forgot is a neutral 200 for both a registered and an unknown email', async () => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: OLD_PW });

    const known = await request(server())
      .post('/auth/forgot')
      .set('X-Forwarded-For', nextIp())
      .send({ email });
    const unknown = await request(server())
      .post('/auth/forgot')
      .set('X-Forwarded-For', nextIp())
      .send({ email: freshEmail() });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect((known.body as ForgotPasswordResponse).status).toBe(
      'reset_requested',
    );
    expect(known.body).toEqual(unknown.body); // identical neutral body
  });

  it('AC-3/AC-4: reset with a valid token → 200 password_reset; a prior session cookie no longer authenticates', async () => {
    const { rawToken, cookie } = await registeredWithResetToken(true);

    const res = await request(server())
      .post('/auth/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token: rawToken, password: NEW_PW });
    expect(res.status).toBe(200);
    expect((res.body as ResetPasswordResponse).status).toBe('password_reset');

    // AC-4: the session established before the reset is now invalid.
    const after = await request(server())
      .get('/auth/session')
      .set('Cookie', cookie as string);
    expect(after.status).toBe(401);
  });

  it('AC-5: expired → 400 token_expired; unknown/consumed → 400 token_invalid', async () => {
    const { email, rawToken } = await registeredWithResetToken();
    await db.query(
      "UPDATE users SET reset_token_expires_at = now() - interval '1 minute' WHERE email = $1",
      [email],
    );
    const expired = await request(server())
      .post('/auth/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token: rawToken, password: NEW_PW });
    expect(expired.status).toBe(400);
    expect((expired.body as ApiError).code).toBe('token_expired');

    const unknown = await request(server())
      .post('/auth/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token: 'not-a-real-token', password: NEW_PW });
    expect(unknown.status).toBe(400);
    expect((unknown.body as ApiError).code).toBe('token_invalid');
  });

  it('AC-6: weak new password → 400 validation_failed with a password field error', async () => {
    const { rawToken } = await registeredWithResetToken();
    const res = await request(server())
      .post('/auth/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token: rawToken, password: 'short' });
    expect(res.status).toBe(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('validation_failed');
    expect(body.fields?.some((f) => f.field === 'password')).toBe(true);
  });

  it('AC-7: forgot and reset are per-IP rate-limited (429)', async () => {
    config.authRateLimitMax = 2;
    try {
      const forgotIp = nextIp();
      let forgotStatus = 0;
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/forgot')
          .set('X-Forwarded-For', forgotIp)
          .send({ email: 'nobody@example.com' });
        forgotStatus = r.status;
      }
      expect(forgotStatus).toBe(429);

      const resetIp = nextIp();
      let resetStatus = 0;
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/auth/reset')
          .set('X-Forwarded-For', resetIp)
          .send({ token: 'x', password: NEW_PW });
        resetStatus = r.status;
      }
      expect(resetStatus).toBe(429);
    } finally {
      // Back to effectively-off, so later cases in this file are not throttled.
      config.authRateLimitMax = 1000;
    }
  });

  it('AC-8: 400 validation_failed for a malformed email / missing reset fields', async () => {
    const badEmail = await request(server())
      .post('/auth/forgot')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect((badEmail.body as ApiError).code).toBe('validation_failed');

    const missing = await request(server())
      .post('/auth/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token: '' });
    expect(missing.status).toBe(400);
    expect((missing.body as ApiError).code).toBe('validation_failed');
  });
});
