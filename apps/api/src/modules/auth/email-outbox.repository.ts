import { Injectable } from '@nestjs/common';
import { TxClient } from '../../infra/db.service';

export interface VerificationEmailIntent {
  recipient: string;
  userId: string;
  token: string; // raw token for the email link
}

@Injectable()
export class EmailOutboxRepository {
  /** Enqueue a verification email (status 'pending'). The worker (FEAT-007)
   * delivers it later; nothing is sent in the request path (SW-002 / AC-9). */
  async enqueueVerification(
    tx: TxClient,
    intent: VerificationEmailIntent,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO email_outbox (type, recipient, payload)
       VALUES ('verification', $1, $2)`,
      [
        intent.recipient,
        JSON.stringify({ token: intent.token, userId: intent.userId }),
      ],
    );
  }

  /** Enqueue a password-reset email (status 'pending', type 'password_reset').
   * The worker's EmailRenderer already handles this type (FEAT-007), building the
   * /reset-password?token= link. Same INSERT shape as enqueueVerification. */
  async enqueuePasswordReset(
    tx: TxClient,
    intent: VerificationEmailIntent,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO email_outbox (type, recipient, payload)
       VALUES ('password_reset', $1, $2)`,
      [
        intent.recipient,
        JSON.stringify({ token: intent.token, userId: intent.userId }),
      ],
    );
  }

  /** Timestamp of the most recent verification email enqueued for a recipient,
   * or null if none. Drives the resend cooldown (FEAT-002 D4) without a schema
   * addition. `q` is any query executor (pool or tx client). */
  async lastVerificationEnqueuedAt(
    q: TxClient,
    recipient: string,
  ): Promise<Date | null> {
    const res = await q.query<{ last: Date | null }>(
      `SELECT max(created_at) AS last
         FROM email_outbox
        WHERE recipient = $1 AND type = 'verification'`,
      [recipient],
    );
    return res.rows[0]?.last ?? null;
  }
}
