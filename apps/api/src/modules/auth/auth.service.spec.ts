import { createHash, randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { DbService } from '../../infra/db.service';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import { EmailTakenError } from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// Cover AC-1, AC-2, AC-6, AC-7, AC-8, AC-9. Each test uses a unique email and
// cleans up its own rows so parallel test files don't collide.
const providers = [
  AuthService,
  PasswordPolicyService,
  PasswordHasher,
  VerificationTokenService,
  UsersRepository,
  ListsRepository,
  EmailOutboxRepository,
  DbService,
];
const VALID_PW = '9x!vQ2mLp0zR';

describe('AuthService.register (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  const emails: string[] = [];
  const freshEmail = (): string => {
    const e = `reg-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    auth = mod.get(AuthService);
  });

  afterEach(async () => {
    for (const e of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [e]); // cascades lists
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-1: creates an unverified user for valid input', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    const res = await db.query<{ verified_at: Date | null }>(
      'SELECT verified_at FROM users WHERE email = $1',
      [email],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].verified_at).toBeNull();
  });

  it('AC-1: normalizes email (trim + lowercase) before storing', async () => {
    const email = freshEmail(); // already lowercase
    await auth.register({
      email: `  ${email.toUpperCase()}  `,
      password: VALID_PW,
    });
    const res = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(res.rowCount).toBe(1);
  });

  it('AC-6: provisions exactly one default Inbox list owned by the user', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    const res = await db.query<{ name: string; is_default: boolean }>(
      `SELECT l.name, l.is_default FROM lists l
       JOIN users u ON u.id = l.owner_id WHERE u.email = $1`,
      [email],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].name).toBe('Inbox');
    expect(res.rows[0].is_default).toBe(true);
  });

  it('AC-7 + AC-9: enqueues one pending verification email whose token matches the stored hash', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });

    const ob = await db.query<{
      type: string;
      status: string;
      payload: { token: string; userId: string };
    }>('SELECT type, status, payload FROM email_outbox WHERE recipient = $1', [
      email,
    ]);
    expect(ob.rowCount).toBe(1);
    expect(ob.rows[0].type).toBe('verification');
    expect(ob.rows[0].status).toBe('pending'); // AC-9: not delivered in the request path

    const rawToken = ob.rows[0].payload.token;
    const usr = await db.query<{
      verification_token_hash: string;
      verification_token_expires_at: Date;
    }>(
      'SELECT verification_token_hash, verification_token_expires_at FROM users WHERE email = $1',
      [email],
    );
    expect(usr.rows[0].verification_token_hash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    const ttlMs =
      new Date(usr.rows[0].verification_token_expires_at).getTime() -
      Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('AC-2: rejects a duplicate email (case-insensitive) and creates no second row', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    await expect(
      auth.register({ email: email.toUpperCase(), password: VALID_PW }),
    ).rejects.toBeInstanceOf(EmailTakenError);
    const res = await db.query<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM users WHERE email = $1',
      [email],
    );
    expect(res.rows[0].c).toBe(1);
  });

  it('AC-8: rolls back entirely if a mid-transaction write fails (no orphan user)', async () => {
    const email = freshEmail();
    const mod = await Test.createTestingModule({ providers })
      .overrideProvider(ListsRepository)
      .useValue({
        createDefaultInbox: jest
          .fn()
          .mockRejectedValue(new Error('inbox boom')),
      })
      .compile();
    const authBroken = mod.get(AuthService);
    const brokenDb = mod.get(DbService);

    await expect(
      authBroken.register({ email, password: VALID_PW }),
    ).rejects.toThrow('inbox boom');

    const res = await db.query<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM users WHERE email = $1',
      [email],
    );
    expect(res.rows[0].c).toBe(0); // fully rolled back
    await brokenDb.onModuleDestroy();
  });
});
