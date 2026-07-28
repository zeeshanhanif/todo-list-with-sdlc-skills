import { Injectable } from '@nestjs/common';
import {
  TASK_TITLE_MAX_LENGTH,
  type ListTasksResponse,
  type TaskSummary,
} from '@todo/shared';
import { TasksRepository, type TaskRow } from './tasks.repository';
import { ListNotFoundError, TaskTitleInvalidError } from './tasks.errors';

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
  ): Promise<TaskSummary> {
    assertLookupId(listId);
    const list = await this.tasks.findOwnedList(ownerId, listId);
    if (!list) {
      throw new ListNotFoundError();
    }
    const title = normalizeTitle(rawTitle);
    return toSummary(await this.tasks.create(ownerId, listId, title));
  }
}

/** Row → wire shape. Timestamps become ISO-8601 UTC strings; an active task
 * carries `completedAt: null` (NFR-LOC-001, technical-design §3). */
function toSummary(row: TaskRow): TaskSummary {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
