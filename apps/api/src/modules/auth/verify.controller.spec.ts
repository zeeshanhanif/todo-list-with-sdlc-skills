import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  type ApiError,
  type ResendVerificationResponse,
  type VerifyResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + error-envelope filter) and
// drive POST /auth/verify and POST /auth/verify/resend over HTTP. Needs local
// Postgres (schema via jest globalSetup). Covers verify 200 / token_expired /
// token_invalid, neutral resend 200, and 400 validation_failed (AC-9).
const VALID_PW = '9x!vQ2mLp0zR';

describe('POST /auth/verify + /auth/verify/resend (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  const freshEmail = (): string => {
    const e = `vrfc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  // Register over HTTP and return the raw verification token enqueued for it.
  const registerAndGetToken = async (): Promise<{
    email: string;
    token: string;
  }> => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .send({ email, password: VALID_PW })
      .expect(201);
    const ob = await db.query<{ payload: { token: string } }>(
      "SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'verification'",
      [email],
    );
    return { email, token: ob.rows[0].payload.token };
  };

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('verify: 200 { status: verified } for a live token', async () => {
    const { token } = await registerAndGetToken();
    const res = await request(server()).post('/auth/verify').send({ token });
    expect(res.status).toBe(200);
    expect(res.body as VerifyResponse).toEqual({ status: 'verified' });
  });

  it('verify: 400 token_expired for a past-expiry token', async () => {
    const { email, token } = await registerAndGetToken();
    await db.query(
      "UPDATE users SET verification_token_expires_at = now() - interval '1 minute' WHERE email = $1",
      [email],
    );
    const res = await request(server()).post('/auth/verify').send({ token });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('token_expired');
  });

  it('verify: 400 token_invalid for a token matching no user', async () => {
    const res = await request(server())
      .post('/auth/verify')
      .send({ token: 'no-such-token' });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('token_invalid');
  });

  it('verify: 400 validation_failed with a token field error when token is missing', async () => {
    const res = await request(server()).post('/auth/verify').send({});
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('validation_failed');
    expect(body.fields?.map((f) => f.field)).toContain('token');
  });

  it('resend: neutral 200 for an unknown (but well-formed) email', async () => {
    const email = freshEmail(); // never registered
    const res = await request(server())
      .post('/auth/verify/resend')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body as ResendVerificationResponse).toEqual({
      status: 'verification_sent',
    });
  });

  it('resend: neutral 200 for an existing unverified email', async () => {
    const { email } = await registerAndGetToken();
    const res = await request(server())
      .post('/auth/verify/resend')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body as ResendVerificationResponse).toEqual({
      status: 'verification_sent',
    });
  });

  it('resend: 400 validation_failed with an email field error for a malformed email', async () => {
    const res = await request(server())
      .post('/auth/verify/resend')
      .send({ email: 'not-an-email' });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('validation_failed');
    expect(body.fields?.map((f) => f.field)).toContain('email');
  });
});
