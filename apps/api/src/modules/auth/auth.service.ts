import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';
import { loadConfig } from '../../infra/config';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import {
  SessionService,
  IssuedSession,
} from '../../common/authz/session.service';
import { AuditService, AUDIT_EVENTS } from '../../common/audit/audit.service';
import {
  AccountLockedError,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidCredentialsError,
  PasswordPolicyError,
  TokenExpiredError,
  TokenInvalidError,
} from './auth.errors';
import type { SessionUser } from '@todo/shared';

/**
 * Registration orchestration (FR-AUTH-001/002/005, FR-LIST-003; technical-design §5):
 * normalize email → enforce password policy → hash → issue verification token →
 * insert user + Inbox + verification outbox row in ONE transaction (ADR-003, AC-8).
 * A duplicate email surfaces as pg 23505 and maps to EmailTakenError (race-safe).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly policy: PasswordPolicyService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: VerificationTokenService,
    private readonly users: UsersRepository,
    private readonly lists: ListsRepository,
    private readonly outbox: EmailOutboxRepository,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async register(input: { email: string; password: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();

    const requirement = this.policy.check(input.password);
    if (requirement) {
      throw new PasswordPolicyError(requirement);
    }

    const passwordHash = await this.hasher.hash(input.password);
    const token = this.tokens.issue();

    try {
      await this.db.transaction(async (tx) => {
        const user = await this.users.create(tx, {
          email,
          passwordHash,
          verificationTokenHash: token.hash,
          verificationTokenExpiresAt: token.expiresAt,
        });
        await this.lists.createDefaultInbox(tx, user.id);
        await this.outbox.enqueueVerification(tx, {
          recipient: email,
          userId: user.id,
          token: token.raw,
        });
      });
    } catch (err) {
      if (this.isEmailUniqueViolation(err)) {
        throw new EmailTakenError();
      }
      throw err;
    }
  }

  /**
   * Verify an account from the token in its email link (FR-AUTH-006, NFR-SEC-004;
   * technical-design §5). Hash the presented token, resolve the user, reject
   * expired/unmatched tokens, else mark verified and consume the token (single-use,
   * D2). No session is granted — the caller directs the user to sign in.
   */
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.tokens.hashToken(rawToken);
    const match = await this.users.findByVerificationTokenHash(
      this.db,
      tokenHash,
    );
    // No live token matches: never issued, already consumed, or rotated away
    // (also covers an already-verified account clicking an old link — D2).
    if (!match || match.verifiedAt !== null) {
      throw new TokenInvalidError();
    }
    if (
      !match.verificationTokenExpiresAt ||
      match.verificationTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new TokenExpiredError();
    }
    const transitioned = await this.users.markVerified(this.db, match.id);
    if (!transitioned) {
      // Lost a race to a concurrent verify; the account is verified either way.
      throw new TokenInvalidError();
    }
  }

  /**
   * Sign in with email + password (FR-AUTH-009/010/007/016/019; UC-003;
   * technical-design §5). Order: lockout check → password verify → verification
   * check → issue session. Failures are generic (no enumeration, FR-AUTH-010);
   * consecutive failures lock the account (FR-AUTH-019); every attempt is
   * audited (NFR-SEC-009). Returns the user + the issued session (raw token +
   * cookie options); the controller sets the cookie.
   */
  async signIn(input: {
    email: string;
    password: string;
    ip?: string | null;
  }): Promise<{ user: SessionUser; session: IssuedSession }> {
    const email = input.email.trim().toLowerCase();
    const ip = input.ip ?? null;

    const user = await this.users.findByEmailForAuth(this.db, email);
    if (!user) {
      // Unknown email — generic failure, nothing to lock (per-IP limiter guards
      // this path). Audited without a user id.
      await this.audit.record(AUDIT_EVENTS.signInFailure, {
        ip,
        detail: { reason: 'unknown_email' },
      });
      throw new InvalidCredentialsError();
    }

    // Lockout gate: while locked, every attempt (even a correct password) fails.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      );
      await this.audit.record(AUDIT_EVENTS.signInFailure, {
        userId: user.id,
        ip,
        detail: { reason: 'locked' },
      });
      throw new AccountLockedError(retryAfterSeconds);
    }

    const passwordOk = await this.hasher.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordOk) {
      const cfg = loadConfig();
      const nextCount = user.failedLoginCount + 1;
      const lockUntil =
        nextCount >= cfg.loginMaxFailedAttempts
          ? new Date(Date.now() + cfg.loginLockoutMinutes * 60 * 1000)
          : null;
      await this.users.recordFailedLogin(this.db, user.id, lockUntil);
      await this.audit.record(AUDIT_EVENTS.signInFailure, {
        userId: user.id,
        ip,
        detail: {
          reason: lockUntil ? 'bad_password_now_locked' : 'bad_password',
        },
      });
      // The failing attempt itself reports invalid credentials; the lock (if
      // just set) gates the next attempt (AC-5).
      throw new InvalidCredentialsError();
    }

    // Credentials are valid — clear any accumulated failures.
    await this.users.resetFailedLogin(this.db, user.id);

    if (user.verifiedAt === null) {
      await this.audit.record(AUDIT_EVENTS.signInFailure, {
        userId: user.id,
        ip,
        detail: { reason: 'unverified' },
      });
      throw new EmailNotVerifiedError();
    }

    const session = await this.sessions.issue(user.id);
    await this.audit.record(AUDIT_EVENTS.signInSuccess, {
      userId: user.id,
      ip,
    });
    return { user: { id: user.id, email: user.email }, session };
  }

  /**
   * Resend a verification email (FR-AUTH-008; technical-design §5, D3/D4/D5).
   * Always a no-throw, neutral operation for the caller: it performs its side
   * effect (rotate token + enqueue a fresh verification email in one
   * transaction) only for an existing, unverified account that is past the
   * resend cooldown; an unknown address, an already-verified account, and a
   * cooldown-active account are all silent no-ops (no enumeration).
   */
  async resendVerification(inputEmail: string): Promise<void> {
    const email = inputEmail.trim().toLowerCase();

    const user = await this.users.findUnverifiedByEmail(this.db, email);
    if (!user) {
      return; // unknown or already verified — neutral
    }

    const lastSentAt = await this.outbox.lastVerificationEnqueuedAt(
      this.db,
      email,
    );
    const cooldownMs = loadConfig().resendCooldownSeconds * 1000;
    if (lastSentAt && Date.now() - lastSentAt.getTime() < cooldownMs) {
      return; // within cooldown — neutral, no additional send
    }

    const token = this.tokens.issue();
    await this.db.transaction(async (tx) => {
      await this.users.rotateVerificationToken(
        tx,
        user.id,
        token.hash,
        token.expiresAt,
      );
      await this.outbox.enqueueVerification(tx, {
        recipient: email,
        userId: user.id,
        token: token.raw,
      });
    });
  }

  private isEmailUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; constraint?: string };
    return (
      e?.code === '23505' && String(e.constraint ?? '').includes('users_email')
    );
  }
}
