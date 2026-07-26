import { Injectable } from '@nestjs/common';
import { DbService, TxClient } from '../../infra/db.service';

/** A live session resolved to its owning user (FEAT-003 technical-design §5). */
export interface ResolvedSession {
  sessionId: string;
  userId: string;
  email: string;
}

/**
 * Persistence for the `sessions` table (ADR-005). Cross-cutting (`common/authz`)
 * so sign-in issues, the guard resolves, and later features (logout, password
 * change/reset, delete-account) revoke against the same store without a
 * cross-module dependency. Only the SHA-256 hash of a token is ever stored.
 */
@Injectable()
export class SessionsRepository {
  constructor(private readonly db: DbService) {}

  /** Insert a session row for `userId` with the token hash and expiry. `q`
   * defaults to the pool; a tx client may be passed so issuance runs in the same
   * transaction as a credential change (FEAT-006 D2 — atomic rotation). */
  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    q: TxClient = this.db,
  ): Promise<{ id: string }> {
    const res = await q.query<{ id: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, tokenHash, expiresAt],
    );
    return res.rows[0];
  }

  /** Resolve a token hash to its live (non-expired) session + user, or null.
   * `q` defaults to the pool; a tx client may be passed. */
  async findLiveByTokenHash(
    tokenHash: string,
    q: TxClient = this.db,
  ): Promise<ResolvedSession | null> {
    const res = await q.query<{
      session_id: string;
      user_id: string;
      email: string;
    }>(
      `SELECT s.id AS session_id, s.user_id, u.email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return { sessionId: row.session_id, userId: row.user_id, email: row.email };
  }

  /** Bump `last_used_at` on a resolved session (ADR-005). */
  async touchLastUsed(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE sessions SET last_used_at = now() WHERE id = $1`,
      [sessionId],
    );
  }

  /** Delete the single session matching a token hash (sign-out revoke, FEAT-004).
   * Returns the number of rows deleted (0 when nothing matched — idempotent). */
  async deleteByTokenHash(tokenHash: string): Promise<number> {
    const res = await this.db.query(
      `DELETE FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return res.rowCount ?? 0;
  }

  /** Delete ALL of a user's sessions — the "invalidate all" revoke for password
   * change/reset (FR-AUTH-017) and account deletion (FR-DATA-005). Returns the
   * number deleted. `q` accepts a tx client so it can run in the same transaction
   * as the credential change (FEAT-005). */
  async deleteByUserId(userId: string, q: TxClient = this.db): Promise<number> {
    const res = await q.query(`DELETE FROM sessions WHERE user_id = $1`, [
      userId,
    ]);
    return res.rowCount ?? 0;
  }
}
