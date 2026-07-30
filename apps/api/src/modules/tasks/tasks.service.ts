import { Injectable } from '@nestjs/common';
import {
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
  type ListTasksResponse,
  type TaskDetailResponse,
  type TaskPriority,
  type TaskSummary,
  type UpdateTaskRequest,
} from '@todo/shared';
import {
  TasksRepository,
  type TaskPatch,
  type TaskRow,
} from './tasks.repository';
import {
  ListNotFoundError,
  TaskFieldInvalidError,
  TaskNotFoundError,
  TaskTitleInvalidError,
} from './tasks.errors';

/**
 * Task creation and the list view (FEAT-010 technical-design §5) — FR-TASK-001,
 * FR-TASK-002, FR-TASK-003 (partial), FR-LIST-009 (partial).
 *
 * Every method takes the **session** user's id as `ownerId`, and every operation
 * resolves the list through the owner-scoped repository first: a list that is
 * unknown and one that belongs to someone else arrive as the same null and leave
 * as the same ListNotFoundError (FR-AUTHZ-002/003, FEAT-009 D3).
 */
@Injectable()
export class TasksService {
  constructor(private readonly tasks: TasksRepository) {}

  /** The list view: the list itself plus its tasks, split by the server
   * (FR-TASK-003 — the system separates active from completed, not the client). */
  async listView(ownerId: string, listId: string): Promise<ListTasksResponse> {
    assertLookupId(listId);
    const list = await this.tasks.findOwnedList(ownerId, listId);
    if (!list) {
      throw new ListNotFoundError();
    }
    const rows = await this.tasks.findByList(ownerId, listId);
    return {
      list,
      active: rows.filter((r) => r.completedAt === null).map(toSummary),
      completed: rows.filter((r) => r.completedAt !== null).map(toSummary),
    };
  }

  /** Create an active task in one of the caller's lists (FR-TASK-001). The list
   * is checked **before** the insert, so a task can never land in a list the
   * caller doesn't own. */
  async create(
    ownerId: string,
    listId: string,
    rawTitle: string,
    extras: { dueAt?: string | null; priority?: TaskPriority } = {},
  ): Promise<TaskSummary> {
    assertLookupId(listId);
    const list = await this.tasks.findOwnedList(ownerId, listId);
    if (!list) {
      throw new ListNotFoundError();
    }
    const title = normalizeTitle(rawTitle);
    // UC-009 step 2, which FEAT-010 D6 deferred to this feature. Both optional:
    // an absent priority is left out entirely so the column default supplies
    // 'none' (FR-TASK-008), and an absent/null dueAt is simply no due date.
    return toSummary(
      await this.tasks.create(ownerId, listId, title, {
        dueAt: parseDueAt(extras.dueAt), // undefined and null alike = no due date
        ...(extras.priority !== undefined
          ? { priority: normalizePriority(extras.priority) }
          : {}),
      }),
    );
  }

  /** FR-TASK-004 — the task with its owning list, the five details the FR names
   * (FEAT-011 §3.1). Two statements (D5). */
  async detail(ownerId: string, id: string): Promise<TaskDetailResponse> {
    assertTaskLookupId(id);
    const task = await this.tasks.findById(ownerId, id);
    if (!task) {
      throw new TaskNotFoundError();
    }
    const list = await this.tasks.findOwnedList(ownerId, task.listId);
    if (!list) {
      // Unreachable in practice — tasks.list_id is NOT NULL with an FK and the
      // list is the same owner's. Treated as not-found rather than crashing,
      // because a task whose list cannot be resolved is not a task we can show.
      throw new TaskNotFoundError();
    }
    return { task: toSummary(task), list };
  }

  /**
   * FR-TASK-005/006/008 — apply a partial edit (FEAT-011 §3.2).
   *
   * **"Sent" is `!== undefined`, not `in`** — and the distinction is load-bearing
   * enough that it cost a debugging round to establish, so it is written down.
   *
   * D4 requires separating "clear the due date" (`dueAt: null`) from "leave it
   * alone" (absent). The obvious encoding of that is `'dueAt' in patch`, and it
   * is **wrong here**: this method's argument is an `UpdateTaskDto` produced by
   * class-transformer, which materializes *every declared property* on the
   * instance. `Object.keys(dto)` is always `['title','dueAt','priority']`, so
   * `in` is always true — which sent `normalizeTitle(undefined)` down the
   * title path on a priority-only PATCH.
   *
   * `!== undefined` is exactly right at this boundary instead, because **JSON
   * cannot carry `undefined`**: a key the client sent always arrives with a
   * real value (`null` included, and `null !== undefined`), and a key it did
   * not send is `undefined` whether or not the instance has the property. The
   * clear operation is preserved; the absent-field case is preserved.
   */
  async update(
    ownerId: string,
    id: string,
    patch: UpdateTaskRequest,
  ): Promise<TaskSummary> {
    assertTaskLookupId(id);

    const toApply: TaskPatch = {};
    if (patch.title !== undefined) {
      toApply.title = normalizeTitle(patch.title);
    }
    if (patch.dueAt !== undefined) {
      toApply.dueAt = parseDueAt(patch.dueAt);
    }
    if (patch.priority !== undefined) {
      toApply.priority = normalizePriority(patch.priority);
    }

    // A body whose recognized fields are all absent. Rejected rather than
    // treated as a no-op: the global ValidationPipe runs `whitelist: true`, so a
    // misspelled field is STRIPPED, and a silent 200 would tell the client the
    // edit landed when nothing was written (D4).
    if (Object.keys(toApply).length === 0) {
      throw new TaskFieldInvalidError(
        '_',
        'Nothing to update — send a title, dueAt, or priority.',
      );
    }

    const updated = await this.tasks.update(ownerId, id, toApply);
    if (!updated) {
      throw new TaskNotFoundError();
    }
    return toSummary(updated);
  }

  /**
   * FR-TASK-009 — mark an active task completed (FEAT-012 §3.1).
   *
   * The completion instant is the **server's**, written in SQL; nothing about
   * it is client-supplied (FR-AUTHZ-004). Idempotent — completing a completed
   * task returns the original instant rather than a re-stamp or a 409 (D2).
   *
   * Note what this method does **not** do: it does not clear the overdue flag.
   * `toSummary` derives `isOverdue` in the one place FEAT-011 D3 put it, and
   * its first clause is `completedAt === null` — so the response that completes
   * a late task is already the response that reports it no longer overdue.
   * FR-TASK-009's "completing clears overdue indication" is satisfied by
   * inheritance, and a second implementation here would be exactly the drift
   * that derivation exists to prevent.
   */
  async complete(ownerId: string, id: string): Promise<TaskSummary> {
    return this.setCompletion(ownerId, id, true);
  }

  /** FR-TASK-010 — return a completed task to active (FEAT-012 §3.2). Clears
   * the completion timestamp; `isOverdue` re-derives on the way out, so a task
   * reopened with a past due date is overdue again. Idempotent on an already
   * active task (D2). */
  async reopen(ownerId: string, id: string): Promise<TaskSummary> {
    return this.setCompletion(ownerId, id, false);
  }

  /**
   * FR-TASK-013 — soft-delete a task (FEAT-013 §3.1).
   *
   * Returns the task **and** the instant its retention clock started. The row
   * is not destroyed: it stays, invisible to every other statement in the
   * module, until `restore` brings it back or FEAT-020's purge removes it 30
   * days on. Idempotent — a repeat returns the ORIGINAL instant, because
   * re-stamping would extend that window on a double-tapped click (D3).
   */
  async softDelete(
    ownerId: string,
    id: string,
  ): Promise<{ task: TaskSummary; deletedAt: string }> {
    const row = await this.setDeletion(ownerId, id, true);
    // Non-null by construction: the delete side COALESCEs, so a returned row
    // always carries an instant. Checked rather than asserted — a silent
    // `null!` here would surface as `deletedAt: null` on the wire, which the
    // contract says cannot happen.
    if (!row.deletedAt) {
      throw new TaskNotFoundError();
    }
    return { task: toSummary(row), deletedAt: row.deletedAt.toISOString() };
  }

  /** FR-TASK-014 — undo a soft-delete (FEAT-013 §3.2). Clears the column and
   * returns the task to its **original list and status**: `list_id` and
   * `completed_at` were never touched by the delete, so nothing has to be
   * reconstructed. `isOverdue` re-derives on the way out — a task whose due
   * date passed while it sat deleted comes back overdue. Idempotent on a task
   * that was never deleted (D3). */
  async restore(ownerId: string, id: string): Promise<TaskSummary> {
    return toSummary(await this.setDeletion(ownerId, id, false));
  }

  private async setDeletion(
    ownerId: string,
    id: string,
    deleted: boolean,
  ): Promise<TaskRow> {
    assertTaskLookupId(id);
    const row = await this.tasks.setDeletion(ownerId, id, deleted);
    if (!row) {
      throw new TaskNotFoundError();
    }
    return row;
  }

  private async setCompletion(
    ownerId: string,
    id: string,
    completed: boolean,
  ): Promise<TaskSummary> {
    assertTaskLookupId(id);
    const row = await this.tasks.setCompletion(ownerId, id, completed);
    if (!row) {
      throw new TaskNotFoundError();
    }
    return toSummary(row);
  }
}

/** Row → wire shape. Timestamps become ISO-8601 UTC strings; an active task
 * carries `completedAt: null` (NFR-LOC-001, technical-design §3). */
// NB: takes exactly one argument on purpose. It is used as `.map(toSummary)`,
// and any second parameter would silently receive the array INDEX — which is
// how an earlier `now: Date = new Date()` default turned into a latent
// `(0).getTime is not a function` on any list view containing a due-dated task.
function toSummary(row: TaskRow): TaskSummary {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    priority: row.priority,
    isOverdue: isOverdue(row),
  };
}

/**
 * FR-TASK-007, derived in **exactly one place** (FEAT-011 D3) so the list view,
 * the detail surface and FEAT-016's Overdue view cannot drift into three
 * definitions.
 *
 * Overdue = **active** AND has a due date AND that instant has passed. The
 * `completedAt === null` clause is the FR's own note — "only active (incomplete)
 * tasks can be overdue" — not an optimization.
 *
 * No timezone enters this comparison, and that is correct rather than an
 * oversight: `due_at` is an absolute instant, so "has it passed?" has the same
 * answer in every zone (D1). Timezone governs how the due date is typed and
 * displayed, which is the client's business.
 */
function isOverdue(row: TaskRow): boolean {
  return (
    row.completedAt === null &&
    row.dueAt !== null &&
    row.dueAt.getTime() < Date.now()
  );
}

/** FR-TASK-006: a due date is an ISO-8601 instant, or null for "no due date".
 * Format is the only rule — **past instants are deliberately legal** (D2),
 * because FR-TASK-007's overdue state is otherwise unreachable. */
function parseDueAt(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new TaskFieldInvalidError('dueAt', 'Enter a valid date and time.');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new TaskFieldInvalidError('dueAt', 'Enter a valid date and time.');
  }
  return parsed;
}

/** FR-TASK-008: one of the four values. Validated against the shared
 * TASK_PRIORITIES tuple — the same constant the CHECK constraint mirrors — so
 * the API and the column can never disagree about what is legal. */
function normalizePriority(raw: unknown): TaskPriority {
  if (!TASK_PRIORITIES.includes(raw as TaskPriority)) {
    throw new TaskFieldInvalidError(
      'priority',
      `Choose one of: ${TASK_PRIORITIES.join(', ')}.`,
    );
  }
  return raw as TaskPriority;
}

/** FR-TASK-002: trim, then require non-empty and at most TASK_TITLE_MAX_LENGTH.
 * Duplicate titles are permitted — no requirement forbids them, exactly as
 * FR-LIST-002 permits duplicate list names. */
function normalizeTitle(raw: string): string {
  const title = (raw ?? '').trim();
  if (title.length === 0) {
    throw new TaskTitleInvalidError('Enter a title for this task.');
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw new TaskTitleInvalidError(
      `Keep the title to ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
    );
  }
  return title;
}

/** An id that isn't a uuid can match no list, so it takes the same uniform
 * not-found path as any other unknown id — checked before the query so a
 * malformed path parameter can't reach Postgres as a cast error (which would
 * surface as a 500 instead of the designed 404). The rule FEAT-009 set. */
function assertLookupId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new ListNotFoundError();
  }
}

/** The same rule for a task id — a malformed path parameter takes the uniform
 * not-found path before it can reach Postgres as a cast error (which would
 * surface as a 500 instead of the designed 404). AC-8 asserts the response is
 * byte-identical to the unknown-uuid one. */
function assertTaskLookupId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new TaskNotFoundError();
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
