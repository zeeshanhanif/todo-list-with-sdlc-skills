import { Injectable } from '@nestjs/common';
import type { ListSummary } from '@todo/shared';
import { DbService, TxClient } from '../../infra/db.service';

/** A `tasks` row as this module reads it. Mapped to the wire `TaskSummary` by the
 * service, which owns the ISO-8601 UTC formatting (NFR-LOC-001). */
export interface TaskRow {
  id: string;
  listId: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * Persistence for the `tasks` table (FEAT-010 technical-design §5).
 *
 * **Ownership is enforced here, structurally** — the convention FEAT-009 D3
 * established and `modules/lists` demonstrates: every method takes `ownerId` and
 * every statement carries `WHERE owner_id = $1`, so no path in this module can
 * read or write a row the caller doesn't own (FR-AUTHZ-002/003/005).
 *
 * `findOwnedList` reads the `lists` table directly. That is not a boundary
 * violation: the rule forbids `modules/tasks` *importing* `modules/lists`, and
 * the traffic already runs the other way (ListsRepository.countTasks queries
 * `tasks`). See technical-design D8 — and its note that a third such duplication
 * is the signal to mint an explicit cross-module read interface.
 */
@Injectable()
export class TasksRepository {
  constructor(private readonly db: DbService) {}

  /** The caller's list, with the same counts `GET /lists` reports, or null when
   * the id is unknown or not owned. One statement; it doubles as the ownership
   * check every task operation runs first (technical-design §3). */
  async findOwnedList(
    ownerId: string,
    listId: string,
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
      [ownerId, listId],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      position: row.position,
      activeTaskCount: Number(row.active_task_count),
      taskCount: Number(row.task_count),
    };
  }

  /**
   * Every task in one of the caller's lists that is not soft-deleted
   * (FR-TASK-013 — the column exists, FEAT-013 gives it behavior), in **one
   * statement** (NFR-PERF-001, technical-design D3). Ordered so the service can
   * partition by walking the rows once: active first (oldest-first, the append
   * order of technical-design D4), then completed (most recently completed
   * first).
   */
  async findByList(
    ownerId: string,
    listId: string,
    q: TxClient = this.db,
  ): Promise<TaskRow[]> {
    const res = await q.query<{
      id: string;
      list_id: string;
      title: string;
      completed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, list_id, title, completed_at, created_at
         FROM tasks
        WHERE owner_id = $1 AND list_id = $2 AND deleted_at IS NULL
        ORDER BY (completed_at IS NOT NULL) ASC,
                 CASE WHEN completed_at IS NULL THEN created_at END ASC,
                 completed_at DESC,
                 id ASC`,
      [ownerId, listId],
    );
    return res.rows.map(toTaskRow);
  }

  /** Insert an **active** task (`completed_at` NULL) into one of the caller's
   * lists (FR-TASK-001). Ownership of the list is the caller's to check first;
   * `owner_id` is the session user, never a client-supplied field
   * (FR-AUTHZ-004), and `list_id` comes from the path — the "exactly one list,
   * assigned at creation" of FR-LIST-009. */
  async create(
    ownerId: string,
    listId: string,
    title: string,
    q: TxClient = this.db,
  ): Promise<TaskRow> {
    const res = await q.query<{
      id: string;
      list_id: string;
      title: string;
      completed_at: Date | null;
      created_at: Date;
    }>(
      `INSERT INTO tasks (owner_id, list_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, list_id, title, completed_at, created_at`,
      [ownerId, listId, title],
    );
    return toTaskRow(res.rows[0]);
  }
}

function toTaskRow(row: {
  id: string;
  list_id: string;
  title: string;
  completed_at: Date | null;
  created_at: Date;
}): TaskRow {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
