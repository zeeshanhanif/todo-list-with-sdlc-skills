import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
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
import { TokenExpiredError, TokenInvalidError } from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// Cover the verify flow: AC-1 (success + columns cleared), AC-2 (single-use
// replay → invalid), AC-3 (expired), AC-4 (no match). Each test uses a unique
// email and cleans up its own rows.
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
];
const VALID_PW = '9x!vQ2mLp0zR';

describe('AuthService.verifyEmail (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  const emails: string[] = [];
  const freshEmail = (): string => {
    const e = `vrf-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  // Register an unverified user and return its email + the raw token that was
  // enqueued for it (mirrors how the email link carries the raw token).
  const registerAndGetToken = async (): Promise<{
    email: string;
    token: string;
  }> => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    const ob = await db.query<{ payload: { token: string } }>(
      "SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'verification'",
      [email],
    );
    return { email, token: ob.rows[0].payload.token };
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

  it('AC-1: verifies a live token — sets verified_at and clears the token columns', async () => {
    const { email, token } = await registerAndGetToken();

    await auth.verifyEmail(token);

    const res = await db.query<{
      verified_at: Date | null;
      verification_token_hash: string | null;
      verification_token_expires_at: Date | null;
    }>(
      `SELECT verified_at, verification_token_hash, verification_token_expires_at
         FROM users WHERE email = $1`,
      [email],
    );
    expect(res.rows[0].verified_at).not.toBeNull();
    expect(res.rows[0].verification_token_hash).toBeNull();
    expect(res.rows[0].verification_token_expires_at).toBeNull();
  });

  it('AC-2: a consumed token cannot be reused (single-use → token_invalid)', async () => {
    const { token } = await registerAndGetToken();
    await auth.verifyEmail(token);

    await expect(auth.verifyEmail(token)).rejects.toBeInstanceOf(
      TokenInvalidError,
    );
  });

  it('AC-3: an expired token is rejected and the account stays unverified', async () => {
    const { email, token } = await registerAndGetToken();
    // Force expiry into the past.
    await db.query(
      "UPDATE users SET verification_token_expires_at = now() - interval '1 minute' WHERE email = $1",
      [email],
    );

    await expect(auth.verifyEmail(token)).rejects.toBeInstanceOf(
      TokenExpiredError,
    );
    const res = await db.query<{ verified_at: Date | null }>(
      'SELECT verified_at FROM users WHERE email = $1',
      [email],
    );
    expect(res.rows[0].verified_at).toBeNull();
  });

  it('AC-4: a token matching no user is rejected (token_invalid)', async () => {
    await expect(
      auth.verifyEmail('not-a-real-token-value'),
    ).rejects.toBeInstanceOf(TokenInvalidError);
  });
});
