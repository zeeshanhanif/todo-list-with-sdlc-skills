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
