import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  type ApiError,
  type ProfileResponse,
  type UpdateProfileResponse,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive the profile endpoints over HTTP. Needs local Postgres.
// FEAT-008 T5 — AC-1 (200 + the four fields), AC-2 (email is not writable),
// AC-4/AC-6/AC-10 (400 validation_failed on the right field, nothing written),
// AC-13 (partial semantics; the empty patch), AC-14 (401 on both routes),
// AC-15 (one query per route, inside the 300 ms bound).
const VALID_PW = '9x!vQ2mLp0zR';

describe('profile endpoints (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  const emails: string[] = [];
  let ipCounter = 0;
  const prevRl = process.env.AUTH_RATELIMIT_MAX;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A disjoint /24 from the other suites' ranges — DEF-001's isolation rule.
  const nextIp = (): string => `198.18.21.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `profilec-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** Register + verify + sign in; returns the session cookie, id and email. */
  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    email: string;
  }> => {
    const email = freshEmail();
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
    expect(res.status).toBe(200); // fixture must be real before anything is read
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const id = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return { cookie: setCookie[0].split(';')[0], id: id.rows[0].id, email };
  };

  const getProfile = async (cookie: string) => {
    const res = await request(server()).get('/profile').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body as ProfileResponse).profile;
  };

  const patch = (cookie: string, body: unknown) =>
    request(server()).patch('/profile').set('Cookie', cookie).send(body);

  const rowOf = async (id: string) =>
    (
      await db.query<{ email: string; updated_at: Date }>(
        'SELECT email, updated_at FROM users WHERE id = $1',
        [id],
      )
    ).rows[0];

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

  it("AC-1: GET /profile returns the session user's four fields", async () => {
    const { cookie, email } = await signedInUser();

    const res = await request(server()).get('/profile').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as ProfileResponse).profile).toEqual({
      email,
      displayName: null,
      timezone: null,
      theme: 'system',
    });
  });

  it('AC-1: two accounts never see each other — the subject is the session', async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    await patch(a.cookie, { displayName: 'Account A' }).expect(200);

    await expect(getProfile(b.cookie)).resolves.toMatchObject({
      email: b.email,
      displayName: null, // A's write is invisible here
    });
  });

  it('AC-2: a body of only `email` cannot change it — it is the empty patch', async () => {
    const { cookie, id, email } = await signedInUser();

    const res = await patch(cookie, { email: 'someone@else.example' });

    expect(res.status).toBe(400);
    expect((res.body as ApiError).fields?.[0].field).toBe('_');
    expect((await rowOf(id)).email).toBe(email);
    await expect(getProfile(cookie)).resolves.toMatchObject({ email });
  });

  it('AC-2: `email` alongside a valid field is stripped; only the field moves', async () => {
    const { cookie, id, email } = await signedInUser();

    const res = await patch(cookie, {
      email: 'someone@else.example',
      displayName: 'Ada',
    });

    expect(res.status).toBe(200);
    expect((res.body as UpdateProfileResponse).profile).toMatchObject({
      email, // unchanged in the response...
      displayName: 'Ada',
    });
    expect((await rowOf(id)).email).toBe(email); // ...and at the row
  });

  it('AC-13: a one-field patch leaves the other two alone', async () => {
    const { cookie } = await signedInUser();
    await patch(cookie, {
      displayName: 'Ada',
      timezone: 'Europe/Paris',
      theme: 'dark',
    }).expect(200);

    await patch(cookie, { theme: 'light' }).expect(200);

    await expect(getProfile(cookie)).resolves.toMatchObject({
      displayName: 'Ada',
      timezone: 'Europe/Paris',
      theme: 'light',
    });
  });

  it.each([
    ['an empty body', {}],
    ['only unknown keys', { nickname: 'Ada' }],
    ['a plausible typo for a real field', { timeZone: 'Europe/Paris' }],
  ])(
    'AC-13: %s is a 400 on field `_`, and writes nothing',
    async (_label, body) => {
      const { cookie, id } = await signedInUser();
      const before = await rowOf(id);

      const res = await patch(cookie, body);

      expect(res.status).toBe(400);
      const err = res.body as ApiError;
      expect(err.code).toBe('validation_failed');
      expect(err.fields?.[0].field).toBe('_');
      // The typo case is the one that matters: `whitelist: true` strips it, so
      // a service that treated {} as a no-op would answer 200 here (D6).
      expect((await rowOf(id)).updated_at.getTime()).toBe(
        before.updated_at.getTime(),
      );
    },
  );

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['over the maximum', 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)],
  ])(
    'AC-4: displayName %s → 400 on `displayName`, nothing written',
    async (_label, value) => {
      const { cookie } = await signedInUser();
      await patch(cookie, { displayName: 'Original' }).expect(200);

      const res = await patch(cookie, { displayName: value });

      expect(res.status).toBe(400);
      expect((res.body as ApiError).fields?.[0].field).toBe('displayName');
      await expect(getProfile(cookie)).resolves.toMatchObject({
        displayName: 'Original',
      });
    },
  );

  it('AC-5: displayName null unsets it (200, not a validation error)', async () => {
    const { cookie } = await signedInUser();
    await patch(cookie, { displayName: 'Ada' }).expect(200);

    const res = await patch(cookie, { displayName: null });

    expect(res.status).toBe(200);
    expect((res.body as UpdateProfileResponse).profile.displayName).toBeNull();
    await expect(getProfile(cookie)).resolves.toMatchObject({
      displayName: null,
    });
  });

  it('AC-6: a valid zone round-trips byte-identical through the contract', async () => {
    const { cookie } = await signedInUser();

    for (const zone of ['Asia/Kolkata', 'Asia/Calcutta', 'UTC']) {
      const res = await patch(cookie, { timezone: zone });
      expect(res.status).toBe(200);
      expect((res.body as UpdateProfileResponse).profile.timezone).toBe(zone);
      await expect(getProfile(cookie)).resolves.toMatchObject({
        timezone: zone,
      });
    }
  });

  it.each([
    ['unknown', 'Mars/Olympus'],
    ['a fixed offset', '+05:30'],
    ['an Etc/GMT zone', 'Etc/GMT+5'],
    ['empty', ''],
    ['null', null],
  ])(
    'AC-6: timezone %s → 400 on `timezone`, nothing written',
    async (_label, zone) => {
      const { cookie } = await signedInUser();
      await patch(cookie, { timezone: 'Europe/Paris' }).expect(200);

      const res = await patch(cookie, { timezone: zone });

      expect(res.status).toBe(400);
      expect((res.body as ApiError).fields?.[0].field).toBe('timezone');
      await expect(getProfile(cookie)).resolves.toMatchObject({
        timezone: 'Europe/Paris',
      });
    },
  );

  it.each(['light', 'dark', 'system'])(
    'AC-10: theme %s is accepted',
    async (theme) => {
      const { cookie } = await signedInUser();

      const res = await patch(cookie, { theme });

      expect(res.status).toBe(200);
      expect((res.body as UpdateProfileResponse).profile.theme).toBe(theme);
    },
  );

  it.each(['neon', 'Dark', ''])(
    'AC-10: theme %p → 400 on `theme`, nothing written',
    async (theme) => {
      const { cookie } = await signedInUser();
      await patch(cookie, { theme: 'dark' }).expect(200);

      const res = await patch(cookie, { theme });

      expect(res.status).toBe(400);
      expect((res.body as ApiError).fields?.[0].field).toBe('theme');
      await expect(getProfile(cookie)).resolves.toMatchObject({
        theme: 'dark',
      });
    },
  );

  it('AC-14: both routes are 401 without a session, and the PATCH writes nothing', async () => {
    const { cookie, id } = await signedInUser();
    const before = await rowOf(id);

    for (const headers of [{}, { Cookie: 'sid=not-a-real-session' }]) {
      const get = await request(server()).get('/profile').set(headers);
      const pat = await request(server())
        .patch('/profile')
        .set(headers)
        .send({ theme: 'dark' });

      for (const res of [get, pat]) {
        expect(res.status).toBe(401);
        expect((res.body as ApiError).code).toBe('unauthenticated');
        expect((res.body as ApiError).statusCode).toBe(401);
      }
    }
    expect((await rowOf(id)).updated_at.getTime()).toBe(
      before.updated_at.getTime(),
    );
    // ...and the real session still works, so the 401s were about the cookie.
    await expect(getProfile(cookie)).resolves.toMatchObject({
      theme: 'system',
    });
  });

  it('AC-14: a revoked session is 401 on both routes', async () => {
    const { cookie, id } = await signedInUser();
    await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);

    await request(server()).get('/profile').set('Cookie', cookie).expect(401);
    await patch(cookie, { theme: 'dark' }).expect(401);
  });

  it("AC-9: changing the timezone changes no task's isOverdue", async () => {
    const { cookie, id } = await signedInUser();
    const inbox = await db.query<{ id: string }>(
      'SELECT id FROM lists WHERE owner_id = $1 AND is_default = true',
      [id],
    );
    const listId = inbox.rows[0].id;
    // One task already late, one due well ahead — the two sides of FR-TASK-007.
    for (const dueAt of [
      '2020-01-01T00:00:00.000Z',
      '2099-01-01T00:00:00.000Z',
    ]) {
      await request(server())
        .post(`/lists/${listId}/tasks`)
        .set('Cookie', cookie)
        .send({ title: `due ${dueAt}`, dueAt })
        .expect(201);
    }
    const read = async () => {
      const res = await request(server())
        .get(`/lists/${listId}/tasks`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      return (
        res.body as { active: { title: string; isOverdue: boolean }[] }
      ).active.map((t) => [t.title, t.isOverdue]);
    };

    const before = await read();
    // Move the account half the planet away, twice.
    await patch(cookie, { timezone: 'Pacific/Kiritimati' }).expect(200); // +14
    const afterEast = await read();
    await patch(cookie, { timezone: 'Pacific/Midway' }).expect(200); // -11
    const afterWest = await read();

    // Overdue is an instant comparison, so its answer is the same in every zone
    // (FEAT-011 D1/D3, technical-design D4). A future feature that made overdue
    // zone-dependent would fail exactly here.
    expect(afterEast).toEqual(before);
    expect(afterWest).toEqual(before);
    expect(before.some(([, overdue]) => overdue === true)).toBe(true);
    expect(before.some(([, overdue]) => overdue === false)).toBe(true);
  });

  it('AC-15: each route issues exactly one profile query, inside 300 ms', async () => {
    const { cookie } = await signedInUser();

    const spy = jest.spyOn(db, 'query');
    const startedGet = Date.now();
    await request(server()).get('/profile').set('Cookie', cookie).expect(200);
    const getElapsed = Date.now() - startedGet;

    // The session guard's own lookups are filtered out by matching the shape of
    // this module's statements against the `users` table.
    const reads = spy.mock.calls.filter(([sql]) =>
      /SELECT email, display_name, timezone, theme FROM users/.test(sql),
    );
    expect(reads).toHaveLength(1);

    spy.mockClear();
    const startedPatch = Date.now();
    await patch(cookie, { theme: 'dark' }).expect(200);
    const patchElapsed = Date.now() - startedPatch;

    const writes = spy.mock.calls.filter(([sql]) => /UPDATE users/.test(sql));
    expect(writes).toHaveLength(1);
    expect(getElapsed).toBeLessThan(300);
    expect(patchElapsed).toBeLessThan(300);
    spy.mockRestore();
  });
});
