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
}
