import { Injectable } from '@nestjs/common';
import { TxClient } from '../../infra/db.service';

export interface NewUser {
  email: string; // already normalized (trim+lowercase)
  passwordHash: string;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
}

/** A user matched by its live verification token (FEAT-002 verify flow). */
export interface VerificationTokenMatch {
  id: string;
  verifiedAt: Date | null;
  verificationTokenExpiresAt: Date | null;
}

/** A user loaded for the sign-in credential check (FEAT-003 sign-in flow). */
export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  verifiedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

@Injectable()
export class UsersRepository {
  /** Insert an unverified user. Throws pg 23505 on users_email_key if the email
   * exists — AuthService maps that to EmailTakenError. */
  async create(tx: TxClient, u: NewUser): Promise<{ id: string }> {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, verification_token_hash, verification_token_expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        u.email,
        u.passwordHash,
        u.verificationTokenHash,
        u.verificationTokenExpiresAt,
      ],
    );
    return res.rows[0];
  }

  /** Look a user up by the SHA-256 hash of a presented verification token
   * (FEAT-002 verify, technical-design §5). Returns null when no live token
   * matches — never issued, already consumed (cleared to NULL), or rotated away.
   * `q` is any query executor (the pool via DbService, or a tx client). */
  async findByVerificationTokenHash(
    q: TxClient,
    tokenHash: string,
  ): Promise<VerificationTokenMatch | null> {
    const res = await q.query<{
      id: string;
      verified_at: Date | null;
      verification_token_expires_at: Date | null;
    }>(
      `SELECT id, verified_at, verification_token_expires_at
         FROM users
        WHERE verification_token_hash = $1`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      verifiedAt: row.verified_at,
      verificationTokenExpiresAt: row.verification_token_expires_at,
    };
  }

  /** Find an unverified user by normalized email (FEAT-002 resend). Returns null
   * when the email is unknown OR the account is already verified — the caller
   * treats both identically (neutral, no enumeration; technical-design D3). */
  async findUnverifiedByEmail(
    q: TxClient,
    email: string,
  ): Promise<{ id: string } | null> {
    const res = await q.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND verified_at IS NULL`,
      [email],
    );
    return res.rows[0] ?? null;
  }

  /** Replace a user's verification token with a freshly issued one (resend
   * rotation — technical-design D5). Invalidates the prior link. */
  async rotateVerificationToken(
    tx: TxClient,
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await tx.query(
      `UPDATE users
          SET verification_token_hash = $2,
              verification_token_expires_at = $3,
              updated_at = now()
        WHERE id = $1`,
      [id, tokenHash, expiresAt],
    );
  }

  /** Load a user by normalized email for the sign-in credential check
   * (FEAT-003 §5). Returns null when no account has that email. */
  async findByEmailForAuth(
    q: TxClient,
    email: string,
  ): Promise<AuthUser | null> {
    const res = await q.query<{
      id: string;
      email: string;
      password_hash: string;
      verified_at: Date | null;
      failed_login_count: number;
      locked_until: Date | null;
    }>(
      `SELECT id, email, password_hash, verified_at, failed_login_count, locked_until
         FROM users WHERE email = $1`,
      [email],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      verifiedAt: row.verified_at,
      failedLoginCount: row.failed_login_count,
      lockedUntil: row.locked_until,
    };
  }

  /** Record a failed sign-in: increment the consecutive-failure counter and,
   * when a lock is triggered, set `locked_until` (FEAT-003 §5; FR-AUTH-019). */
  async recordFailedLogin(
    q: TxClient,
    id: string,
    lockUntil: Date | null,
  ): Promise<void> {
    await q.query(
      `UPDATE users
          SET failed_login_count = failed_login_count + 1,
              locked_until = $2,
              updated_at = now()
        WHERE id = $1`,
      [id, lockUntil],
    );
  }

  /** Clear the failed-login counter and any lock after a successful credential
   * check (FEAT-003 §5; FR-AUTH-019). */
  async resetFailedLogin(q: TxClient, id: string): Promise<void> {
    await q.query(
      `UPDATE users
          SET failed_login_count = 0,
              locked_until = NULL,
              updated_at = now()
        WHERE id = $1`,
      [id],
    );
  }

  /** Mark a user verified and consume its token (single-use, NFR-SEC-004): set
   * verified_at and clear the token columns. Guarded `WHERE verified_at IS NULL`
   * so a concurrent second verify is a no-op. Returns true when this call did the
   * transition. (technical-design §5, D2) */
  async markVerified(q: TxClient, id: string): Promise<boolean> {
    const res = await q.query(
      `UPDATE users
          SET verified_at = now(),
              verification_token_hash = NULL,
              verification_token_expires_at = NULL,
              updated_at = now()
        WHERE id = $1 AND verified_at IS NULL`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
