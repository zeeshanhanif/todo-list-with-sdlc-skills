import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from '../../common/crypto/password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { ResetTokenService } from './reset-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import {
  PasswordPolicyError,
  TokenExpiredError,
  TokenInvalidError,
} from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-005 T4 — AuthService.resetPassword: AC-3 (valid → password changed +
// token consumed + single-use), AC-4 (all sessions invalidated), AC-5 (expired
// → token_expired, unknown/consumed → token_invalid, password unchanged),
// AC-6 (policy fail → PasswordPolicyError, password + token untouched).
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
const OLD_PW = '9x!vQ2mLp0zR';
const NEW_PW = 'N3w!pw-Str0ngZ';
const WEAK_PW = 'short';

describe('AuthService.resetPassword (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  let hasher: PasswordHasher;
  let sessions: SessionService;
  const emails: string[] = [];

  const freshEmail = (): string => {
    const e = `reset-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register a user and request a reset; return { email, id, rawToken }.
  const userWithResetToken = async (): Promise<{
    email: string;
    id: string;
    rawToken: string;
  }> => {
    const email = freshEmail();
    await auth.register({ email, password: OLD_PW });
    await auth.requestPasswordReset(email);
    const ob = await db.query<{ payload: { token: string } }>(
      "SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'password_reset'",
      [email],
    );
    const id = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return { email, id: id.rows[0].id, rawToken: ob.rows[0].payload.token };
  };

  const passwordHashOf = async (email: string): Promise<string> => {
    const r = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [email],
    );
    return r.rows[0].password_hash;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    auth = mod.get(AuthService);
    hasher = mod.get(PasswordHasher);
    sessions = mod.get(SessionService);
  });

  afterEach(async () => {
    for (const e of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [e]); // cascades sessions
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-3: valid token + password → password changed, token consumed, single-use', async () => {
    const { email, rawToken } = await userWithResetToken();

    await auth.resetPassword(rawToken, NEW_PW);

    const hash = await passwordHashOf(email);
    expect(await hasher.verify(hash, NEW_PW)).toBe(true);
    expect(await hasher.verify(hash, OLD_PW)).toBe(false);
    // Token cleared → replay is invalid (single-use).
    const cleared = await db.query<{ reset_token_hash: string | null }>(
      'SELECT reset_token_hash FROM users WHERE email = $1',
      [email],
    );
    expect(cleared.rows[0].reset_token_hash).toBeNull();
    await expect(auth.resetPassword(rawToken, NEW_PW)).rejects.toBeInstanceOf(
      TokenInvalidError,
    );
  });

  it("AC-4: a successful reset invalidates all of the user's sessions", async () => {
    const { id, rawToken } = await userWithResetToken();
    // Two active sessions before the reset.
    await sessions.issue(id);
    await sessions.issue(id);
    const before = await db.query(
      'SELECT id FROM sessions WHERE user_id = $1',
      [id],
    );
    expect(before.rows.length).toBeGreaterThanOrEqual(2);

    await auth.resetPassword(rawToken, NEW_PW);

    const after = await db.query('SELECT id FROM sessions WHERE user_id = $1', [
      id,
    ]);
    expect(after.rows).toHaveLength(0);
  });

  it('AC-5: expired token → token_expired; unknown token → token_invalid; password unchanged', async () => {
    const { email, id, rawToken } = await userWithResetToken();
    const originalHash = await passwordHashOf(email);

    // Expire it.
    await db.query(
      "UPDATE users SET reset_token_expires_at = now() - interval '1 minute' WHERE id = $1",
      [id],
    );
    await expect(auth.resetPassword(rawToken, NEW_PW)).rejects.toBeInstanceOf(
      TokenExpiredError,
    );
    // Unknown token.
    await expect(
      auth.resetPassword('not-a-real-token', NEW_PW),
    ).rejects.toBeInstanceOf(TokenInvalidError);

    expect(await passwordHashOf(email)).toBe(originalHash); // unchanged
  });

  it('AC-6: weak new password → PasswordPolicyError; password + token untouched (retry-friendly)', async () => {
    const { email, rawToken } = await userWithResetToken();
    const originalHash = await passwordHashOf(email);

    await expect(auth.resetPassword(rawToken, WEAK_PW)).rejects.toBeInstanceOf(
      PasswordPolicyError,
    );

    expect(await passwordHashOf(email)).toBe(originalHash); // unchanged
    // Token still present → the same link works on retry with a strong password.
    const stillThere = await db.query<{ reset_token_hash: string | null }>(
      'SELECT reset_token_hash FROM users WHERE email = $1',
      [email],
    );
    expect(stillThere.rows[0].reset_token_hash).not.toBeNull();
    await expect(auth.resetPassword(rawToken, NEW_PW)).resolves.toBeUndefined();
  });
});
