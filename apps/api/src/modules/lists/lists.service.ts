import { Injectable } from '@nestjs/common';
import { LIST_NAME_MAX_LENGTH, type ListSummary } from '@todo/shared';
import { DbService } from '../../infra/db.service';
import { ListsRepository } from './lists.repository';
import {
  ListNameInvalidError,
  ListNotDeletableError,
  ListNotFoundError,
  ListOrderInvalidError,
} from './lists.errors';

/**
 * List management (FEAT-009 technical-design §5) — FR-LIST-001/002/004..008.
 *
 * Every method takes the **session** user's id as `ownerId`; nothing here accepts
 * an owner from a request body (FR-AUTHZ-004). The repository keeps every
 * statement owner-scoped, so "unknown id" and "someone else's id" arrive here as
 * the same null and leave as the same ListNotFoundError (FR-AUTHZ-003, D3).
 */
@Injectable()
export class ListsService {
  constructor(
    private readonly db: DbService,
    private readonly lists: ListsRepository,
  ) {}

  /** All of the caller's lists with counts, in their persisted order (FR-LIST-005). */
  async listAll(ownerId: string): Promise<ListSummary[]> {
    return this.lists.findAllWithCounts(ownerId);
  }

  /** Create a list, appended last (FR-LIST-001, FR-LIST-002). */
  async create(ownerId: string, rawName: string): Promise<ListSummary> {
    const name = normalizeName(rawName);
    const { id } = await this.lists.create(ownerId, name);
    const created = await this.lists.findByIdWithCounts(ownerId, id);
    if (!created) {
      // Unreachable: we just inserted it as this owner.
      throw new ListNotFoundError();
    }
    return created;
  }

  /** Rename any of the caller's lists — including the default one, which
   * FR-LIST-004 explicitly permits (FR-LIST-006). */
  async rename(
    ownerId: string,
    id: string,
    rawName: string,
  ): Promise<ListSummary> {
    assertLookupId(id);
    const name = normalizeName(rawName);
    const renamed = await this.lists.rename(ownerId, id, name);
    if (!renamed) {
      throw new ListNotFoundError();
    }
    const updated = await this.lists.findByIdWithCounts(ownerId, id);
    if (!updated) {
      throw new ListNotFoundError();
    }
    return updated;
  }

  /**
   * Delete a non-default list and, with it, every task it contained
   * (FR-LIST-007). The default list is refused (FR-LIST-004). Counting and
   * deleting share one transaction so the reported `deletedTaskCount` is exactly
   * what the cascade removed.
   */
  async delete(ownerId: string, id: string): Promise<number> {
    assertLookupId(id);
    return this.db.transaction(async (tx) => {
      const owned = await this.lists.findOwned(ownerId, id, tx);
      if (!owned) {
        throw new ListNotFoundError();
      }
      if (owned.isDefault) {
        throw new ListNotDeletableError();
      }
      const deletedTaskCount = await this.lists.countTasks(ownerId, id, tx);
      await this.lists.deleteById(ownerId, id, tx);
      return deletedTaskCount;
    });
  }

  /**
   * Persist a manual order (FR-LIST-008). `listIds` must be exactly the caller's
   * set — the whole vector is rewritten to dense 0..n-1 in one transaction, which
   * is what makes the operation idempotent and drift-free (technical-design D2).
   */
  async reorder(ownerId: string, listIds: string[]): Promise<ListSummary[]> {
    return this.db.transaction(async (tx) => {
      const current = await this.lists.findAllWithCounts(ownerId, tx);

      if (new Set(listIds).size !== listIds.length) {
        throw new ListOrderInvalidError(
          'The same list was listed more than once.',
        );
      }
      const owned = new Set(current.map((l) => l.id));
      const submitted = new Set(listIds);
      const sameSet =
        owned.size === submitted.size &&
        [...owned].every((id) => submitted.has(id));
      if (!sameSet) {
        // Covers missing, extra, and foreign ids alike — the message never
        // reveals whether an unrecognized id exists for someone else (D3).
        throw new ListOrderInvalidError(
          'Send every one of your lists exactly once, in the order you want.',
        );
      }

      await this.lists.setPositions(tx, ownerId, listIds);
      return this.lists.findAllWithCounts(ownerId, tx);
    });
  }
}

/** An id that isn't a uuid at all can match no row, so it takes the same path as
 * any other unknown id — a uniform ListNotFoundError (technical-design §3.3).
 * Checked before the query so a malformed path parameter can't reach Postgres as
 * a cast error (which would surface as a 500 instead of the designed 404). */
function assertLookupId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new ListNotFoundError();
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FR-LIST-002: trim, then require non-empty and at most LIST_NAME_MAX_LENGTH.
 * Duplicate names are permitted by the requirement, so nothing checks for them. */
function normalizeName(raw: string): string {
  const name = (raw ?? '').trim();
  if (name.length === 0) {
    throw new ListNameInvalidError('Enter a name for this list.');
  }
  if (name.length > LIST_NAME_MAX_LENGTH) {
    throw new ListNameInvalidError(
      `Keep the name to ${LIST_NAME_MAX_LENGTH} characters or fewer.`,
    );
  }
  return name;
}
