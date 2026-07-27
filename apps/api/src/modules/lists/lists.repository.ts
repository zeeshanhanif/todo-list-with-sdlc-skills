import { Injectable } from '@nestjs/common';
import type { ListSummary } from '@todo/shared';
import { DbService, TxClient } from '../../infra/db.service';

/**
 * Persistence for the `lists` table (FEAT-009 technical-design §5).
 *
 * **Ownership is enforced here, structurally (technical-design D3).** Every method
 * takes `ownerId` and every statement carries `WHERE owner_id = $1`, so no code
 * path in this module can read or write a row the caller doesn't own
 * (FR-AUTHZ-002/003/005). A miss is indistinguishable from "not owned" — the
 * service turns both into the same ListNotFoundError. Later data modules
 * (tasks, search, account-data) inherit this convention.
 */
@Injectable()
export class ListsRepository {
  constructor(private readonly db: DbService) {}

  /**
   * All of the owner's lists with their task counts, ordered per FR-LIST-005/008.
   * **One statement, no N+1** (NFR-PERF-001, technical-design D5): the counts are
   * FILTER-ed aggregates over a single LEFT JOIN, riding
   * `tasks_active_by_list_idx` for the active half.
   */
  async findAllWithCounts(
    ownerId: string,
    q: TxClient = this.db,
  ): Promise<ListSummary[]> {
    const res = await q.query<{
      id: string;
      name: string;
      is_default: boolean;
      position: number;
      active_task_count: string;
      task_count: string;
    }>(
      `SELECT l.id,
              l.name,
              l.is_default,
              l.position,
              COUNT(t.id) FILTER (
                WHERE t.completed_at IS NULL AND t.deleted_at IS NULL
              ) AS active_task_count,
              COUNT(t.id) AS task_count
         FROM lists l
         LEFT JOIN tasks t ON t.list_id = l.id
        WHERE l.owner_id = $1
        GROUP BY l.id, l.name, l.is_default, l.position, l.created_at
        ORDER BY l.position ASC, l.created_at ASC`,
      [ownerId],
    );
    return res.rows.map(toSummary);
  }

  /** One of the owner's lists with its counts, or null when unknown/not owned. */
  async findByIdWithCounts(
    ownerId: string,
    id: string,
    q: TxClient = this.db,
  ): Promise<ListSummary | null> {
    const res = await q.query<{
      id: string;
      name: string;
      is_default: boolean;
      position: number;
      active_task_count: string;
      task_count: string;
    }>(
      `SELECT l.id,
              l.name,
              l.is_default,
              l.position,
              COUNT(t.id) FILTER (
                WHERE t.completed_at IS NULL AND t.deleted_at IS NULL
              ) AS active_task_count,
              COUNT(t.id) AS task_count
         FROM lists l
         LEFT JOIN tasks t ON t.list_id = l.id
        WHERE l.owner_id = $1 AND l.id = $2
        GROUP BY l.id, l.name, l.is_default, l.position`,
      [ownerId, id],
    );
    const row = res.rows[0];
    return row ? toSummary(row) : null;
  }

  /** Whether the list exists for this owner, and whether it is the default one
   * (FR-LIST-004). Null when unknown or not owned. */
  async findOwned(
    ownerId: string,
    id: string,
    q: TxClient = this.db,
  ): Promise<{ id: string; isDefault: boolean } | null> {
    const res = await q.query<{ id: string; is_default: boolean }>(
      `SELECT id, is_default FROM lists WHERE owner_id = $1 AND id = $2`,
      [ownerId, id],
    );
    const row = res.rows[0];
    return row ? { id: row.id, isDefault: row.is_default } : null;
  }

  /** Create a list for the owner, appended to the end of their order
   * (FR-LIST-001, FR-LIST-008 "new lists appended"; FR-AUTHZ-004 — ownership is
   * the passed session user, never a client-supplied field). */
  async create(
    ownerId: string,
    name: string,
    q: TxClient = this.db,
  ): Promise<{ id: string }> {
    const res = await q.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, position)
       VALUES (
         $1, $2,
         (SELECT COALESCE(MAX(position) + 1, 0) FROM lists WHERE owner_id = $1)
       )
       RETURNING id`,
      [ownerId, name],
    );
    return res.rows[0];
  }

  /** Rename one of the owner's lists (FR-LIST-006). Returns false when the id is
   * unknown or not owned — `is_default` is deliberately untouched, since the
   * default list is renameable (FR-LIST-004). */
  async rename(
    ownerId: string,
    id: string,
    name: string,
    q: TxClient = this.db,
  ): Promise<boolean> {
    const res = await q.query(
      `UPDATE lists
          SET name = $3, updated_at = now()
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, id, name],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Count every task in one of the owner's lists — active, completed and
   * soft-deleted alike, because all of them go when the list does (FR-LIST-007). */
  async countTasks(
    ownerId: string,
    id: string,
    q: TxClient = this.db,
  ): Promise<number> {
    const res = await q.query<{ count: string }>(
      `SELECT COUNT(t.id) AS count
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
        WHERE l.owner_id = $1 AND l.id = $2`,
      [ownerId, id],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  /** Delete one of the owner's lists. The contained tasks go with it via the
   * `tasks.list_id` FK's ON DELETE CASCADE (migration 007; FR-LIST-007) — the
   * permanence FR-LIST-007 asks for, not a soft delete (technical-design D4).
   * Returns false when the id is unknown or not owned. */
  async deleteById(
    ownerId: string,
    id: string,
    q: TxClient = this.db,
  ): Promise<boolean> {
    const res = await q.query(
      `DELETE FROM lists WHERE owner_id = $1 AND id = $2`,
      [ownerId, id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Rewrite the owner's list order to dense 0..n-1 in `orderedIds` order
   * (FR-LIST-008). Caller passes a tx client so the whole vector moves atomically;
   * every statement stays owner-scoped, so a foreign id simply matches no row —
   * the service has already rejected that case (technical-design D2). */
  async setPositions(
    tx: TxClient,
    ownerId: string,
    orderedIds: string[],
  ): Promise<void> {
    await tx.query(
      `UPDATE lists AS l
          SET position = ordered.position, updated_at = now()
         FROM (
           SELECT id, (ordinality - 1)::int AS position
             FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, ordinality)
         ) AS ordered
        WHERE l.id = ordered.id AND l.owner_id = $1`,
      [ownerId, orderedIds],
    );
  }
}

function toSummary(row: {
  id: string;
  name: string;
  is_default: boolean;
  position: number;
  active_task_count: string;
  task_count: string;
}): ListSummary {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    position: row.position,
    // pg returns COUNT() as a string (bigint); the contract is a number.
    activeTaskCount: Number(row.active_task_count),
    taskCount: Number(row.task_count),
  };
}
