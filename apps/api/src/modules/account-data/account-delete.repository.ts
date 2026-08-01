import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';

/** The one column account deletion reads before it writes (FR-DATA-004). */
export interface CredentialRow {
  passwordHash: string;
}

const CREDENTIAL_SQL = `
  SELECT password_hash
    FROM users
   WHERE id = $1`;

// The outbox has no foreign key to `users` (technical-design §2), so nothing
// cascades it. Keyed on the id inside the payload rather than on `recipient`:
// the address is freed by this very transaction and may belong to someone else
// tomorrow, while the id was only ever this account's (D5).
const DELETE_OUTBOX_SQL = `
  DELETE FROM email_outbox
   WHERE payload->>'userId' = $1`;

const DELETE_USER_SQL = `
  DELETE FROM users
   WHERE id = $1`;

/**
 * Persistence for account deletion (FEAT-018 technical-design §5.1) —
 * FR-DATA-003, FR-DATA-005.
 *
 * Two statements and no cleverness, because the interesting part is not here:
 * `lists`, `tasks` and `sessions` all carry `ON DELETE CASCADE` to `users`
 * (migrations 002/005/006, written by FEAT-001/003/009 naming this feature), and
 * the unique `users_email_key` means removing the row is itself what frees the
 * address for re-registration. So one `DELETE FROM users` destroys the account
 * — and because the cascades run inside the same transaction, the whole
 * destruction is atomic (ADR-003): if any part of it fails, none of it happened.
 *
 * Reading and writing `users` from here is not a boundary violation — the
 * enforced rule forbids importing another *module's code*, and this module
 * already reads `users`, `lists` and `tasks` for the export (FEAT-017 §2).
 */
@Injectable()
export class AccountDeleteRepository {
  constructor(private readonly db: DbService) {}

  /** The caller's stored password hash, or `null` when the row is gone — the
   * session outlived its user (technical-design §3.1 → 401). */
  async findCredential(userId: string): Promise<CredentialRow | null> {
    const res = await this.db.query<{ password_hash: string }>(CREDENTIAL_SQL, [
      userId,
    ]);
    const row = res.rows[0];
    return row ? { passwordHash: row.password_hash } : null;
  }

  /**
   * Destroy the account and everything the schema hangs off it (FR-DATA-003).
   *
   * Returns whether the user row was actually deleted: `false` means someone
   * else deleted it between the credential read and this call, which the
   * service reports as `401` rather than a success it did not perform.
   *
   * `beforeUserDelete` is a test seam and nothing else: AC-10's guarantee —
   * that a mid-transaction failure leaves *everything* in place — is only
   * observable by making the transaction fail after the outbox delete has run,
   * which no test can do without a point to interleave at. It is `undefined` in
   * production and costs one falsy check.
   */
  async deleteAccount(
    userId: string,
    beforeUserDelete?: () => Promise<void>,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.query(DELETE_OUTBOX_SQL, [userId]);

      if (beforeUserDelete) await beforeUserDelete();

      const res = await tx.query(DELETE_USER_SQL, [userId]);
      return res.rowCount === 1;
    });
  }
}
