import { Injectable } from '@nestjs/common';
import type { TaskPriority, ThemePreference } from '@todo/shared';
import { DbService } from '../../infra/db.service';

/** The account row as the export reads it. Deliberately five columns: the
 * export carries the user's *content and preferences*, never their credentials
 * or security state (technical-design §3.2). */
export interface AccountRow {
  email: string;
  displayName: string | null;
  timezone: string | null;
  theme: ThemePreference;
  createdAt: Date;
}

export interface ListRow {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRow {
  id: string;
  listId: string;
  title: string;
  completedAt: Date | null;
  dueAt: Date | null;
  priority: TaskPriority;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportRows {
  /** `null` when the account row is gone — the session outlived its user. */
  account: AccountRow | null;
  lists: ListRow[];
  tasks: TaskRow[];
}

// Three statements rather than one join: a join would repeat every list's
// columns once per task and force the service to re-group them, and lists with
// no tasks would need a LEFT JOIN with null-task branches. The grouping is one
// pass in the service (technical-design §5.1).

const ACCOUNT_SQL = `
  SELECT email, display_name, timezone, theme, created_at
    FROM users
   WHERE id = $1`;

const LISTS_SQL = `
  SELECT id, name, is_default, position, created_at, updated_at
    FROM lists
   WHERE owner_id = $1
   ORDER BY position ASC, created_at ASC`;

const TASKS_SQL = `
  SELECT id, list_id, title, completed_at, due_at, priority, position,
         created_at, updated_at
    FROM tasks
   WHERE owner_id = $1 AND deleted_at IS NULL
   ORDER BY list_id, position ASC, created_at ASC`;

/**
 * Persistence for the data export (FEAT-017 technical-design §5.1).
 *
 * Ownership is enforced the way every data module since FEAT-009 D3 enforces
 * it: the `WHERE owner_id = $1` is not optional and not conditional, so no
 * argument can widen the read past the caller's own rows (FR-AUTHZ-002/003).
 *
 * Reading `users`, `lists` and `tasks` from here is not a boundary violation —
 * the enforced rule forbids importing another *module's code*, and `search` and
 * `tasks` already read `lists` the same way (FEAT-010 D8).
 */
@Injectable()
export class AccountExportRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Every row the export needs, read as **one consistent snapshot** (D8).
   *
   * Postgres' default READ COMMITTED takes a *new* snapshot per statement, so a
   * task moved between lists between the list read and the task read could be
   * exported under a list that no longer holds it — a file that contradicts
   * itself. REPEATABLE READ fixes one snapshot for the whole transaction.
   *
   * Note the snapshot is taken at the **first statement**, not at BEGIN, which
   * is why the isolation level is set before any read runs.
   *
   * `betweenReads` is a test seam and nothing else: AC-9's guarantee is only
   * observable by writing from another connection *while* this transaction is
   * open, which no test can do without a point to interleave at. It is
   * `undefined` in production and costs one falsy check.
   */
  async readAll(
    ownerId: string,
    betweenReads?: () => Promise<void>,
  ): Promise<ExportRows> {
    return this.db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      const account = await tx.query<{
        email: string;
        display_name: string | null;
        timezone: string | null;
        theme: ThemePreference;
        created_at: Date;
      }>(ACCOUNT_SQL, [ownerId]);

      if (betweenReads) await betweenReads();

      const lists = await tx.query<{
        id: string;
        name: string;
        is_default: boolean;
        position: number;
        created_at: Date;
        updated_at: Date;
      }>(LISTS_SQL, [ownerId]);

      const tasks = await tx.query<{
        id: string;
        list_id: string;
        title: string;
        completed_at: Date | null;
        due_at: Date | null;
        priority: TaskPriority;
        position: number;
        created_at: Date;
        updated_at: Date;
      }>(TASKS_SQL, [ownerId]);

      const row = account.rows[0];
      return {
        account: row
          ? {
              email: row.email,
              displayName: row.display_name,
              timezone: row.timezone,
              theme: row.theme,
              createdAt: row.created_at,
            }
          : null,
        lists: lists.rows.map((l) => ({
          id: l.id,
          name: l.name,
          isDefault: l.is_default,
          position: l.position,
          createdAt: l.created_at,
          updatedAt: l.updated_at,
        })),
        tasks: tasks.rows.map((t) => ({
          id: t.id,
          listId: t.list_id,
          title: t.title,
          completedAt: t.completed_at,
          dueAt: t.due_at,
          priority: t.priority,
          position: t.position,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
      };
    });
  }
}
