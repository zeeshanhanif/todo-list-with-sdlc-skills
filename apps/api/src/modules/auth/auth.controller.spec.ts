import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type ApiError, type RegisterResponse } from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (with the global pipe + error-envelope filter)
// and drive POST /auth/register over HTTP. Needs local Postgres (schema via jest
// globalSetup). Covers AC-1 (201), AC-2 (409), AC-3/AC-4 (400 envelope + fields).
const VALID_PW = '9x!vQ2mLp0zR';

describe('POST /auth/register (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  const freshEmail = (): string => {
    const e = `reg-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

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

  it('AC-1: 201 { status: verification_sent } for valid input', async () => {
    const email = freshEmail();
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: VALID_PW });
    expect(res.status).toBe(201);
    expect(res.body as RegisterResponse).toEqual({
      status: 'verification_sent',
    });
  });

  it('AC-3: 400 validation_failed with an email field error for a malformed email', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: VALID_PW });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('validation_failed');
    expect(body.fields?.map((f) => f.field)).toContain('email');
  });

  it('AC-4: 400 with the specific password requirement for a too-short password', async () => {
    const email = freshEmail();
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: 'short' });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    expect(body.code).toBe('validation_failed');
    const pw = body.fields?.find((f) => f.field === 'password');
    expect(pw).toBeDefined();
    expect(pw?.message).toContain('10');
  });

  it('AC-4: 400 for a common/breached password', async () => {
    const email = freshEmail();
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: 'password123' });
    const body = res.body as ApiError;
    expect(res.status).toBe(400);
    const pw = body.fields?.find((f) => f.field === 'password');
    expect(pw?.message).toMatch(/too common/i);
  });

  it('AC-2: 409 email_taken on a duplicate email (case-insensitive)', async () => {
    const email = freshEmail();
    await request(server())
      .post('/auth/register')
      .send({ email, password: VALID_PW })
      .expect(201);
    const res = await request(server())
      .post('/auth/register')
      .send({ email: email.toUpperCase(), password: VALID_PW });
    const body = res.body as ApiError;
    expect(res.status).toBe(409);
    expect(body.code).toBe('email_taken');
  });
});
