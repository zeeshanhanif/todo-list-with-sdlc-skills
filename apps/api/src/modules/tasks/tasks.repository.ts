import { Injectable } from '@nestjs/common';
import type { ListSummary, TaskPriority } from '@todo/shared';
import { DbService, TxClient } from '../../infra/db.service';

/** A `tasks` row as this module reads it. Mapped to the wire `TaskSummary` by the
 * service, which owns the ISO-8601 UTC formatting (NFR-LOC-001) and the
 * `isOverdue` derivation (FEAT-011 D3). */
export interface TaskRow {
  id: string;
  listId: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
  /** FR-TASK-006 — null is "no due date", not "unset" (FEAT-011). */
  dueAt: Date | null;
  /** FR-TASK-008 — never null; the column is NOT NULL DEFAULT 'none'. */
  priority: TaskPriority;
}

/** The fields PATCH /tasks/{id} may change (FEAT-011 §3.2). **Key presence is
 * meaningful**: a key that is absent means "leave it alone", while
 * `dueAt: null` means "clear it" (D4). That is why this is built by picking keys
 * off the request rather than by defaulting — a `Partial<>` whose absent keys
 * were normalized to `undefined` would lose exactly the distinction the contract
 * depends on. */
export interface TaskPatch {
  title?: string;
  dueAt?: Date | null;
  priority?: TaskPriority;
}

/** The columns every task read projects — one list so the three statements below
 * cannot drift apart as the table grows (FEAT-012/013/014 each add to it). */
const TASK_COLUMNS = `id, list_id, title, completed_at, created_at, due_at, priority`;

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
    const res = await q.query<TaskRowShape>(
      `SELECT ${TASK_COLUMNS}
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

  /** One of the caller's tasks by id, or null when the id is unknown, owned by
   * someone else, **or soft-deleted** — all three collapse into the same null so
   * the controller's uniform 404 can never disclose which (FR-AUTHZ-002/003/005;
   * FEAT-011 §3.1). Soft-deleted rows are excluded for the same reason they are
   * absent from the list view: FEAT-013 owns restoring them. */
  async findById(
    ownerId: string,
    id: string,
    q: TxClient = this.db,
  ): Promise<TaskRow | null> {
    const res = await q.query<TaskRowShape>(
      `SELECT ${TASK_COLUMNS}
         FROM tasks
        WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [ownerId, id],
    );
    const row = res.rows[0];
    return row ? toTaskRow(row) : null;
  }

  /**
   * Apply a partial edit and return the stored row, or null for the same uniform
   * not-found as `findById` (FR-TASK-005/006/008; FEAT-011 §3.2).
   *
   * **The SET clause is built from the keys the patch actually carries** — that
   * is the whole mechanism behind D4's absent-vs-null rule. `dueAt: null` reaches
   * here as a present key holding null and clears the column; an absent `dueAt`
   * contributes no assignment at all, so a concurrent edit to another field
   * cannot blank it. One statement, ownership in the WHERE, `updated_at` moved
   * the way ListsRepository.rename does it.
   *
   * An empty patch never reaches here: the service rejects it (D4), because
   * `UPDATE ... SET updated_at = now()` alone would be a silent write.
   */
  async update(
    ownerId: string,
    id: string,
    patch: TaskPatch,
    q: TxClient = this.db,
  ): Promise<TaskRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [ownerId, id];

    if ('title' in patch) {
      values.push(patch.title);
      sets.push(`title = $${values.length}`);
    }
    if ('dueAt' in patch) {
      values.push(patch.dueAt);
      sets.push(`due_at = $${values.length}`);
    }
    if ('priority' in patch) {
      values.push(patch.priority);
      sets.push(`priority = $${values.length}`);
    }
    if (sets.length === 0) {
      throw new Error('TasksRepository.update called with an empty patch');
    }

    const res = await q.query<TaskRowShape>(
      `UPDATE tasks
          SET ${sets.join(', ')}, updated_at = now()
        WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING ${TASK_COLUMNS}`,
      values,
    );
    const row = res.rows[0];
    return row ? toTaskRow(row) : null;
  }

  /**
   * Complete or reopen one of the caller's tasks (FR-TASK-009/010; FEAT-012
   * §5), returning the stored row or null for the same uniform not-found
   * `findById` returns.
   *
   * **`COALESCE(completed_at, now())` is the whole idempotency mechanism**
   * (FEAT-012 D2), and it is worth reading twice: completing a task that is
   * already completed keeps the **original** instant. Not a re-stamp — because
   * FR-TASK-009 records the moment the task was finished, not the moment of the
   * last click, and the completed section sorts on that column, so re-stamping
   * would silently reorder a list on a no-op. Not a `409` either: a checkbox
   * over a network is double-tapped and retried, and UC-011 defines no
   * exception flow for "already completed".
   *
   * The alternative encoding — `WHERE … AND completed_at IS NULL` — is what
   * this deliberately avoids: a zero-row result would then mean *either*
   * not-found *or* already-done, and telling those apart costs a second
   * statement, which AC-9 (NFR-PERF-001) forbids.
   *
   * `updated_at` does move on a no-op repeat, which is correct: a legitimate
   * operation was requested and re-affirmed. (Contrast FEAT-011's *empty patch*,
   * which writes nothing at all — that was a malformed request.)
   */
  async setCompletion(
    ownerId: string,
    id: string,
    completed: boolean,
    q: TxClient = this.db,
  ): Promise<TaskRow | null> {
    const res = await q.query<TaskRowShape>(
      `UPDATE tasks
          SET completed_at = ${completed ? 'COALESCE(completed_at, now())' : 'NULL'},
              updated_at = now()
        WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING ${TASK_COLUMNS}`,
      [ownerId, id],
    );
    const row = res.rows[0];
    return row ? toTaskRow(row) : null;
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
    due: { dueAt?: Date | null; priority?: TaskPriority } = {},
    q: TxClient = this.db,
  ): Promise<TaskRow> {
    // COALESCE($5, DEFAULT) is not expressible, so priority falls back to the
    // literal the column default holds — the point of FEAT-011 AC-6 asserting
    // the default at the database is that the column stays its source; an
    // omitted priority simply omits the column from the INSERT.
    const withPriority = due.priority !== undefined;
    const res = await q.query<TaskRowShape>(
      `INSERT INTO tasks (owner_id, list_id, title, due_at${
        withPriority ? ', priority' : ''
      })
       VALUES ($1, $2, $3, $4${withPriority ? ', $5' : ''})
       RETURNING ${TASK_COLUMNS}`,
      withPriority
        ? [ownerId, listId, title, due.dueAt ?? null, due.priority]
        : [ownerId, listId, title, due.dueAt ?? null],
    );
    return toTaskRow(res.rows[0]);
  }
}

/** The raw shape `TASK_COLUMNS` selects. */
interface TaskRowShape {
  id: string;
  list_id: string;
  title: string;
  completed_at: Date | null;
  created_at: Date;
  due_at: Date | null;
  priority: TaskPriority;
}

function toTaskRow(row: TaskRowShape): TaskRow {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    dueAt: row.due_at,
    priority: row.priority,
  };
}
