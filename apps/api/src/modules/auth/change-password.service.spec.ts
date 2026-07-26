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
import { ResetTokenService } from './reset-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import {
  CurrentPasswordInvalidError,
  PasswordPolicyError,
} from './auth.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-006 T3 — AuthService.changePassword: AC-1 (password replaced, Argon2id,
// old one dead), AC-2 (all pre-change sessions revoked), AC-3 (a replacement
// session is issued for the caller), AC-4 (wrong current password → nothing
// touched, no lockout counters — D4), AC-5 (policy failure → nothing touched),
// AC-9 (audit rows without secrets), D6 (a pending reset token is consumed).
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
const OLD_PW = '9x!vQ2mLp0zR';
const NEW_PW = 'N3w!pw-Str0ngZ';
const WEAK_PW = 'short';

describe('AuthService.changePassword (integration)', () => {
  let db: DbService;
  let auth: AuthService;
  let hasher: PasswordHasher;
  let sessions: SessionService;
  const emails: string[] = [];

  const freshEmail = (): string => {
    const e = `chpw-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** A verified user with `count` live sessions; returns their raw tokens. */
  const signedInUser = async (
    count = 1,
  ): Promise<{ id: string; email: string; tokens: string[] }> => {
    const email = freshEmail();
    await auth.register({ email, password: OLD_PW });
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const res = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    const id = res.rows[0].id;
    const tokens: string[] = [];
    for (let i = 0; i < count; i++) {
      const { session } = await auth.signIn({ email, password: OLD_PW });
      tokens.push(session.rawToken);
    }
    return { id, email, tokens };
  };

  const storedHash = async (id: string): Promise<string> => {
    const res = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [id],
    );
    return res.rows[0].password_hash;
  };

  const auditEvents = async (id: string): Promise<string[]> => {
    const res = await db.query<{ event: string }>(
      'SELECT event FROM audit_log WHERE user_id = $1 ORDER BY created_at',
      [id],
    );
    return res.rows.map((r) => r.event);
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    auth = mod.get(AuthService);
    hasher = mod.get(PasswordHasher);
    sessions = mod.get(SessionService);
  });

  afterEach(async () => {
    for (const email of emails) {
      await db.query('DELETE FROM email_outbox WHERE recipient = $1', [email]);
      await db.query('DELETE FROM users WHERE email = $1', [email]); // cascades
    }
    emails.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-1: replaces the password — the new one verifies, the old one does not', async () => {
    const { id } = await signedInUser();
    const before = await storedHash(id);

    await auth.changePassword({
      userId: id,
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });

    const after = await storedHash(id);
    expect(after).not.toBe(before);
    expect(after.startsWith('$argon2id$')).toBe(true); // NFR-SEC-005
    expect(after).not.toContain(NEW_PW);
    expect(await hasher.verify(after, NEW_PW)).toBe(true);
    expect(await hasher.verify(after, OLD_PW)).toBe(false);
  });

  it('AC-2/AC-3: revokes every pre-change session and issues a replacement for the caller', async () => {
    const { id, email, tokens } = await signedInUser(2);
    expect(await sessions.resolve(tokens[0])).not.toBeNull();
    expect(await sessions.resolve(tokens[1])).not.toBeNull();

    const issued = await auth.changePassword({
      userId: id,
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });

    // FR-AUTH-017: both prior sessions are gone.
    expect(await sessions.resolve(tokens[0])).toBeNull();
    expect(await sessions.resolve(tokens[1])).toBeNull();
    // NFR-SEC-007: the caller continues on a new, different token.
    expect(tokens).not.toContain(issued.rawToken);
    expect(await sessions.resolve(issued.rawToken)).toEqual({ id, email });
    const live = await db.query('SELECT id FROM sessions WHERE user_id = $1', [
      id,
    ]);
    expect(live.rows).toHaveLength(1);
  });

  it('AC-4: a wrong current password changes nothing — password, sessions and lockout counters untouched', async () => {
    const { id, tokens } = await signedInUser();
    const before = await storedHash(id);

    await expect(
      auth.changePassword({
        userId: id,
        currentPassword: 'not-the-current-one',
        newPassword: NEW_PW,
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordInvalidError);

    expect(await storedHash(id)).toBe(before);
    expect(await sessions.resolve(tokens[0])).not.toBeNull();
    const row = await db.query<{
      failed_login_count: number;
      locked_until: Date | null;
    }>('SELECT failed_login_count, locked_until FROM users WHERE id = $1', [
      id,
    ]);
    // D4: change-password failures are not sign-in failures.
    expect(row.rows[0].failed_login_count).toBe(0);
    expect(row.rows[0].locked_until).toBeNull();
  });

  it('AC-5: a new password failing the policy changes nothing', async () => {
    const { id, tokens } = await signedInUser();
    const before = await storedHash(id);

    await expect(
      auth.changePassword({
        userId: id,
        currentPassword: OLD_PW,
        newPassword: WEAK_PW,
      }),
    ).rejects.toBeInstanceOf(PasswordPolicyError);

    expect(await storedHash(id)).toBe(before);
    expect(await sessions.resolve(tokens[0])).not.toBeNull();
  });

  it('AC-9: audits password_changed on success and password_change_failure on a wrong current password', async () => {
    const { id } = await signedInUser();

    await expect(
      auth.changePassword({
        userId: id,
        currentPassword: 'wrong',
        newPassword: NEW_PW,
        ip: '198.51.100.7',
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordInvalidError);
    await auth.changePassword({
      userId: id,
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
      ip: '198.51.100.7',
    });

    const events = await auditEvents(id);
    expect(events).toContain('password_change_failure');
    expect(events).toContain('password_changed');

    const rows = await db.query<{ detail: unknown; event: string }>(
      `SELECT event, detail FROM audit_log
        WHERE user_id = $1 AND event LIKE 'password%'`,
      [id],
    );
    const serialized = JSON.stringify(rows.rows);
    expect(serialized).toContain('wrong_current_password');
    // No secrets in the audit trail.
    expect(serialized).not.toContain(OLD_PW);
    expect(serialized).not.toContain(NEW_PW);
    expect(serialized).not.toContain('$argon2id$');
  });

  it('D6: the change consumes any pending reset token', async () => {
    const { id, email } = await signedInUser();
    await auth.requestPasswordReset(email);
    const pending = await db.query<{ reset_token_hash: string | null }>(
      'SELECT reset_token_hash FROM users WHERE id = $1',
      [id],
    );
    expect(pending.rows[0].reset_token_hash).not.toBeNull();

    await auth.changePassword({
      userId: id,
      currentPassword: OLD_PW,
      newPassword: NEW_PW,
    });

    const after = await db.query<{
      reset_token_hash: string | null;
      reset_token_expires_at: Date | null;
    }>(
      'SELECT reset_token_hash, reset_token_expires_at FROM users WHERE id = $1',
      [id],
    );
    expect(after.rows[0].reset_token_hash).toBeNull();
    expect(after.rows[0].reset_token_expires_at).toBeNull();
  });
});
