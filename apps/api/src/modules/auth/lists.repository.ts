import { Injectable } from '@nestjs/common';
import { TxClient } from '../../infra/db.service';

@Injectable()
export class ListsRepository {
  /** Provision the default Inbox list for a new user (FR-LIST-003). */
  async createDefaultInbox(tx: TxClient, ownerId: string): Promise<void> {
    await tx.query(
      `INSERT INTO lists (owner_id, name, is_default) VALUES ($1, 'Inbox', true)`,
      [ownerId],
    );
  }
}
