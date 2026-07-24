import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { DbService } from '../../infra/db.service';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import {
  AccountLockedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-003 T7 — AuthService.signIn: AC-1 success + session + counter reset,
// AC-2 generic failure (no enumeration), AC-3 unverified gate, AC-5 lockout,
// AC-8 audit rows. LOGIN_MAX_FAILED_ATTEMPTS lowered to 3 for a fast lockout.
const providers = [
  AuthService,
  PasswordPolicyService,
  PasswordHasher,
  VerificationTokenService,
  UsersRepository,
  ListsRepository,
  EmailOutboxRepository,
  SessionService,
  SessionsRepository,
  AuditService,
  AuditRepository,
  DbService,
];
const VALID_PW = '9x!vQ2mLp0zR';
const WRONG_PW = 'wrong-password-xyz';

describe('AuthService.signIn (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  const emails: string[] = [];
  const prevMax = process.env.LOGIN_MAX_FAILED_ATTEMPTS;

  const freshEmail = (): string => {
    const e = `signin-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register (unverified) and, when verified=true, flip verified_at.
  const makeUser = async (verified: boolean): Promise<string> => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    if (verified) {
      await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
        email,
      ]);
    }
    return email;
  };

  const userIdOf = async (email: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    process.env.LOGIN_MAX_FAILED_ATTEMPTS = '3';
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    auth = mod.get(AuthService);
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
      await db.query('DELETE FROM users WHERE email = $1', [e]); // cascades sessions/lists
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    if (prevMax === undefined) delete process.env.LOGIN_MAX_FAILED_ATTEMPTS;
    else process.env.LOGIN_MAX_FAILED_ATTEMPTS = prevMax;
    await db.onModuleDestroy();
  });

  it('AC-1: valid credentials for a verified user issue a session and reset the counter', async () => {
    const email = await makeUser(true);
    const id = await userIdOf(email);

    const res = await auth.signIn({
      email,
      password: VALID_PW,
      ip: '203.0.113.1',
    });
    expect(res.user).toEqual({ id, email });
    expect(res.session.rawToken).toEqual(expect.any(String));

    const sessions = await db.query(
      'SELECT id FROM sessions WHERE user_id = $1',
      [id],
    );
    expect(sessions.rows).toHaveLength(1);
    const counter = await db.query<{ failed_login_count: number }>(
      'SELECT failed_login_count FROM users WHERE id = $1',
      [id],
    );
    expect(counter.rows[0].failed_login_count).toBe(0);
  });

  it('AC-2: unknown email and wrong password both raise InvalidCredentials; no session', async () => {
    // Unknown email
    await expect(
      auth.signIn({ email: freshEmail(), password: VALID_PW }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    // Wrong password for an existing verified user
    const email = await makeUser(true);
    await expect(
      auth.signIn({ email, password: WRONG_PW }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const id = await userIdOf(email);
    const sessions = await db.query(
      'SELECT id FROM sessions WHERE user_id = $1',
      [id],
    );
    expect(sessions.rows).toHaveLength(0);
  });

  it('AC-3: unverified + correct pw → EmailNotVerified; unverified + wrong pw → InvalidCredentials', async () => {
    const email = await makeUser(false);
    await expect(
      auth.signIn({ email, password: VALID_PW }),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);
    await expect(
      auth.signIn({ email, password: WRONG_PW }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const id = await userIdOf(email);
    const sessions = await db.query(
      'SELECT id FROM sessions WHERE user_id = $1',
      [id],
    );
    expect(sessions.rows).toHaveLength(0);
  });

  it('AC-5: N consecutive failures lock; correct pw is then rejected; expiry + success resets', async () => {
    const email = await makeUser(true);
    const id = await userIdOf(email);

    // 3 wrong attempts (max=3) — each InvalidCredentials, the last also locks.
    for (let i = 0; i < 3; i++) {
      await expect(
        auth.signIn({ email, password: WRONG_PW }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    const locked = await db.query<{ locked_until: Date | null }>(
      'SELECT locked_until FROM users WHERE id = $1',
      [id],
    );
    expect(locked.rows[0].locked_until).not.toBeNull();

    // Correct password while locked → AccountLocked (AC-5 core).
    await expect(
      auth.signIn({ email, password: VALID_PW }),
    ).rejects.toBeInstanceOf(AccountLockedError);

    // Force the lock to expire; correct password now succeeds and resets.
    await db.query(
      "UPDATE users SET locked_until = now() - interval '1 minute' WHERE id = $1",
      [id],
    );
    const ok = await auth.signIn({ email, password: VALID_PW });
    expect(ok.user.id).toBe(id);
    const counter = await db.query<{ failed_login_count: number }>(
      'SELECT failed_login_count FROM users WHERE id = $1',
      [id],
    );
    expect(counter.rows[0].failed_login_count).toBe(0);
  });

  it('AC-8: success and failure write audit rows; no row leaks the password', async () => {
    const email = await makeUser(true);
    const id = await userIdOf(email);

    await expect(
      auth.signIn({ email, password: WRONG_PW, ip: '203.0.113.9' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await auth.signIn({ email, password: VALID_PW, ip: '203.0.113.9' });

    const rows = await db.query<{ event: string; detail: unknown }>(
      'SELECT event, detail FROM audit_log WHERE user_id = $1 ORDER BY created_at',
      [id],
    );
    const events = rows.rows.map((r) => r.event);
    expect(events).toContain('sign_in_failure');
    expect(events).toContain('sign_in_success');
    // No serialized detail contains the password.
    const dump = JSON.stringify(rows.rows);
    expect(dump).not.toContain(VALID_PW);
    expect(dump).not.toContain(WRONG_PW);
  });
});
