import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  REALTIME_TOKEN_PATH,
  SESSION_COOKIE,
  listTasksPath,
  type ApiError,
  type RealtimeTokenResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';
import { RealtimeTokenService } from './realtime-token.service';

// FEAT-019 T5 / AC-5, AC-6, AC-8 — the token endpoint over the real app.
// Needs local Postgres.
const VALID_PW = '9x!vQ2mLp0zR';
const IP_PREFIX = '203.0.116.';
const SECRET = 'controller-spec-jwt-secret';
const PROJECT_URL = 'https://example-project.supabase.co';
const PUBLISHABLE = 'publishable-anon-key';

describe('GET /realtime/token (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const tokens = new RealtimeTokenService();
  const emails: string[] = [];
  let ipCounter = 0;
  const env = { ...process.env };

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // Own IP range, disjoint from every other spec's (DEF-001).
  const nextIp = (): string => `${IP_PREFIX}${(ipCounter++ % 250) + 1}`;

  const configured = () => {
    process.env.REALTIME_PROVIDER = 'supabase';
    process.env.SUPABASE_URL = PROJECT_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    process.env.SUPABASE_JWT_SECRET = SECRET;
    process.env.REALTIME_TOKEN_TTL_MINUTES = '30';
  };

  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    inbox: string;
  }> => {
    const email = `rt-${randomUUID()}@example.com`;
    emails.push(email);
    const registered = await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
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
    const row = await db.query<{ id: string; list_id: string }>(
      `SELECT u.id, l.id AS list_id FROM users u
         JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [email],
    );
    return { cookie, id: row.rows[0].id, inbox: row.rows[0].list_id };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DbService);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  afterAll(async () => {
    for (const email of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [email]);
    }
    await db.query('DELETE FROM auth_rate_buckets WHERE ip LIKE $1', [
      `${IP_PREFIX}%`,
    ]);
    await app.close();
  });

  it('mints the caller a token for their own channel (AC-5)', async () => {
    const user = await signedInUser();
    configured();

    const res = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(200);

    const body = res.body as RealtimeTokenResponse;
    if (!body.enabled) throw new Error('expected an enabled response');
    expect(body.url).toBe(PROJECT_URL);
    expect(body.publishableKey).toBe(PUBLISHABLE);
    expect(body.channel).toBe(`user:${user.id}`);

    const claims = tokens.verify(body.token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe(user.id);
    expect(claims!.role).toBe('authenticated');
    expect(claims!.exp - claims!.iat).toBe(30 * 60);
    expect(body.expiresAt).toBe(new Date(claims!.exp * 1000).toISOString());
    expect(body.channel).toBe(`user:${claims!.sub}`);
  });

  it('answers { enabled: false } with no token when unconfigured (AC-5)', async () => {
    const user = await signedInUser();
    // A secret IS present in the environment — only the provider switch is off.
    // If the endpoint minted anyway, this is where it would show.
    process.env.SUPABASE_JWT_SECRET = SECRET;
    delete process.env.REALTIME_PROVIDER;

    const res = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(200);

    expect(res.body).toEqual({ enabled: false });
    expect(Object.keys(res.body as object)).toEqual(['enabled']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('requires a session (AC-5, FR-AUTHZ-001)', async () => {
    configured();

    const anonymous = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .expect(401);
    expect((anonymous.body as ApiError).code).toBe('unauthenticated');

    const bogus = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', `${SESSION_COOKIE}=not-a-real-session`)
      .expect(401);
    // Byte-identical to every other guarded route's 401.
    expect(bogus.body).toEqual(anonymous.body);
  });

  it('stops minting when the session is revoked (AC-5)', async () => {
    const user = await signedInUser();
    configured();
    await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(200);

    await request(server())
      .post('/auth/logout')
      .set('Cookie', user.cookie)
      .expect(200);

    await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(401);
  });

  it('cannot be asked for another user’s channel (AC-6)', async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    configured();

    // Every shape a caller could try: query parameters and a header naming A.
    // Built lazily, one live request at a time — supertest binds an ephemeral
    // server per request, so pre-building them races their own teardown.
    const attempts: (() => request.Test)[] = [
      () =>
        request(server())
          .get(`${REALTIME_TOKEN_PATH}?userId=${a.id}`)
          .set('Cookie', b.cookie),
      () =>
        request(server())
          .get(`${REALTIME_TOKEN_PATH}?sub=${a.id}&channel=user:${a.id}`)
          .set('Cookie', b.cookie),
      () =>
        request(server())
          .get(REALTIME_TOKEN_PATH)
          .set('Cookie', b.cookie)
          .set('X-User-Id', a.id),
    ];

    for (const attempt of attempts) {
      const res = await attempt().expect(200);
      const body = res.body as RealtimeTokenResponse;
      if (!body.enabled) throw new Error('expected an enabled response');
      expect(body.channel).toBe(`user:${b.id}`);
      expect(tokens.verify(body.token)!.sub).toBe(b.id);
    }
  });

  it('is not a credential for this API (AC-6)', async () => {
    const user = await signedInUser();
    configured();
    const res = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(200);
    const body = res.body as RealtimeTokenResponse;
    if (!body.enabled) throw new Error('expected an enabled response');

    // As a bearer token: the guard reads cookies only, so this is anonymous.
    await request(server())
      .get(listTasksPath(user.inbox))
      .set('Authorization', `Bearer ${body.token}`)
      .expect(401);

    // As a session cookie: it is not an opaque session id, so it resolves to
    // nothing. A leaked Realtime token grants a socket and nothing else.
    await request(server())
      .get(listTasksPath(user.inbox))
      .set('Cookie', `${SESSION_COOKIE}=${body.token}`)
      .expect(401);
  });

  it('never puts a server-side secret on the wire (AC-8)', async () => {
    const user = await signedInUser();
    configured();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-must-not-leak';

    const res = await request(server())
      .get(REALTIME_TOKEN_PATH)
      .set('Cookie', user.cookie)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('service-role-must-not-leak');
    expect(serialized).not.toContain(SECRET);
    expect(serialized).toContain(PUBLISHABLE);
  });
});
