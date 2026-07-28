import { Injectable } from '@nestjs/common';
import { TxClient } from '../../infra/db.service';

@Injectable()
export class ListsRepository {
  /** Provision the default Inbox list for a new user (FR-LIST-003). `position` is
   * stated explicitly rather than left to the column default: the Inbox is the
   * account's first list, so it holds rank 0 in the manual order FEAT-009 added
   * (FR-LIST-008). This one INSERT stays in the auth module on purpose — the
   * boundary rule forbids `modules/auth → modules/lists`, and registration's Inbox
   * write must stay inside its transaction (FEAT-009 technical-design D6). */
  async createDefaultInbox(tx: TxClient, ownerId: string): Promise<void> {
    await tx.query(
      `INSERT INTO lists (owner_id, name, is_default, position)
       VALUES ($1, 'Inbox', true, 0)`,
      [ownerId],
    );
  }
}
