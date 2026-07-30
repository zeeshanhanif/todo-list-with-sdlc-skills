import { createHash, randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { ResetTokenService } from './reset-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-005 T3 — AuthService.requestPasswordReset: AC-1 (registered → token
// stored + one password_reset outbox row; unknown → nothing; neutral either
// way) and AC-2 (only the SHA-256 hash stored; raw only in the outbox payload;
// expiry ≈ now + TTL).
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

describe('AuthService.requestPasswordReset (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  const emails: string[] = [];

  const freshEmail = (): string => {
    const e = `forgot-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  const makeUser = async (): Promise<string> => {
    const email = freshEmail();
    await auth.register({ email, password: VALID_PW });
    return email;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    auth = mod.get(AuthService);
  });

  afterEach(async () => {
    for (const e of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [e]);
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [e]);
    }
    emails.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-1/AC-2: registered email → reset token stored + one password_reset row; hash-at-rest', async () => {
    const email = await makeUser();

    await auth.requestPasswordReset(email);

    // Exactly one password_reset outbox row, carrying the raw token.
    const outbox = await db.query<{ payload: { token: string } }>(
      "SELECT payload FROM email_outbox WHERE recipient = $1 AND type = 'password_reset'",
      [email],
    );
    expect(outbox.rows).toHaveLength(1);
    const rawToken = outbox.rows[0].payload.token;
    expect(typeof rawToken).toBe('string');

    // The DB stores only the SHA-256 hash (never the raw token); expiry in the future.
    const row = await db.query<{
      reset_token_hash: string | null;
      reset_token_expires_at: Date | null;
    }>(
      'SELECT reset_token_hash, reset_token_expires_at FROM users WHERE email = $1',
      [email],
    );
    expect(row.rows[0].reset_token_hash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(row.rows[0].reset_token_hash).not.toBe(rawToken);
    const expiresAt = row.rows[0].reset_token_expires_at as Date;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    // TTL default 1h → within ~2h ceiling.
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + 2 * 60 * 60 * 1000);
  });

  it('AC-1: unknown email → nothing stored/enqueued (neutral no-op)', async () => {
    const unknown = freshEmail(); // registered nowhere
    await expect(auth.requestPasswordReset(unknown)).resolves.toBeUndefined();

    const outbox = await db.query(
      "SELECT id FROM email_outbox WHERE recipient = $1 AND type = 'password_reset'",
      [unknown],
    );
    expect(outbox.rows).toHaveLength(0);
  });
});
