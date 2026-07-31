import { createHash, randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { ResetTokenService } from './reset-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { TokenInvalidError } from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// Cover the resend flow: AC-6 (rotate + new outbox row + old token now invalid),
// AC-7 (neutral no-op for unknown / already-verified), AC-8 (cooldown suppresses
// a second send). Each test uses a unique email and cleans up its own rows.
const providers = [
  AuthService,
  PasswordPolicyService,
  PasswordHasher,
  VerificationTokenService,
  ResetTokenService,
  UsersRepository,
  ListsRepository,
  EmailOutboxRepository,
  SessionService,
  SessionsRepository,
  AuditService,
  AuditRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];
const VALID_PW = '9x!vQ2mLp0zR';

describe('AuthService.resendVerification (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  const emails: string[] = [];
  const freshEmail = (): string => {
    const e = `rsd-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  const outboxCount = async (email: string): Promise<number> => {
    const res = await db.query<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM email_outbox WHERE recipient = $1 AND type = 'verification'",
      [email],
    );
    return res.rows[0].c;
  };
  const latestToken = async (email: string): Promise<string> => {
    const res = await db.query<{ payload: { token: string } }>(
      `SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'verification'
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    return res.rows[0].payload.token;
  };
  const storedTokenHash = async (email: string): Promise<string | null> => {
    const res = await db.query<{ verification_token_hash: string | null }>(
      'SELECT verification_token_hash FROM users WHERE email = $1',
      [email],
    );
    return res.rows[0].verification_token_hash;
  };
  // Push the recipient's verification outbox rows past the cooldown window.
  const ageOutbox = async (email: string): Promise<void> => {
    await db.query(
      "UPDATE email_outbox SET created_at = now() - interval '2 minutes' WHERE recipient = $1",
      [email],
    );
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

  it('AC-6: resend (past cooldown) enqueues a fresh email, rotates the token, and invalidates the old link', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    const oldToken = await latestToken(email);
    await ageOutbox(email); // move the register row past the cooldown

    await auth.resendVerification(email);

    // A new verification row exists (2 total) carrying a fresh token.
    expect(await outboxCount(email)).toBe(2);
    const newToken = await latestToken(email);
    expect(newToken).not.toBe(oldToken);
    // The stored hash now matches the new token (rotation).
    expect(await storedTokenHash(email)).toBe(
      createHash('sha256').update(newToken).digest('hex'),
    );
    // The old link no longer verifies (rotated away → token_invalid, AC-4).
    await expect(auth.verifyEmail(oldToken)).rejects.toBeInstanceOf(
      TokenInvalidError,
    );
  });

  it('AC-7: unknown email is a neutral no-op — no row created, no throw', async () => {
    const email = freshEmail(); // never registered
    await expect(auth.resendVerification(email)).resolves.toBeUndefined();
    expect(await outboxCount(email)).toBe(0);
  });

  it('AC-7: already-verified email is a neutral no-op — no new row, token untouched', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    await ageOutbox(email); // ensure cooldown would not be the reason for the no-op
    await db.query(
      `UPDATE users SET verified_at = now(),
         verification_token_hash = NULL, verification_token_expires_at = NULL
       WHERE email = $1`,
      [email],
    );

    await expect(auth.resendVerification(email)).resolves.toBeUndefined();
    expect(await outboxCount(email)).toBe(1); // only the original register row
    expect(await storedTokenHash(email)).toBeNull(); // not rotated
  });

  it('AC-8: a resend within the cooldown window sends nothing more and does not rotate', async () => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    const hashBefore = await storedTokenHash(email);
    // No ageOutbox: the register row is ~now, well inside the 60s cooldown.

    await auth.resendVerification(email);

    expect(await outboxCount(email)).toBe(1); // no additional send
    expect(await storedTokenHash(email)).toBe(hashBefore); // token unchanged
  });
});
