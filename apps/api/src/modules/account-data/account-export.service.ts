import { Injectable } from '@nestjs/common';
import {
  ACCOUNT_EXPORT_FORMAT_VERSION,
  type AccountExportDocument,
  type AccountExportList,
  type AccountExportTask,
} from '@todo/shared';
import {
  AccountExportRepository,
  type ListRow,
  type TaskRow,
} from './account-export.repository';
import {
  AccountNotFoundError,
  ExportIntegrityError,
} from './account-data.errors';

/**
 * The data export (FEAT-017 technical-design §5.1) — FR-DATA-001, FR-DATA-002.
 *
 * Takes the **session** user's id; nothing here accepts a subject from a
 * request (FR-AUTHZ-004). Its substance is the row → wire mapping: what the
 * file says, and what it deliberately leaves out.
 */
@Injectable()
export class AccountExportService {
  constructor(private readonly repo: AccountExportRepository) {}

  /** Compile the caller's entire export document (FR-DATA-001). */
  async export(userId: string): Promise<AccountExportDocument> {
    const { account, lists, tasks } = await this.repo.readAll(userId);
    if (!account) {
      throw new AccountNotFoundError();
    }

    // One pass over the task rows, into their lists.
    const byList = new Map<string, AccountExportTask[]>();
    for (const list of lists) {
      byList.set(list.id, []);
    }
    for (const task of tasks) {
      const bucket = byList.get(task.listId);
      if (!bucket) {
        // Unreachable by construction — see ExportIntegrityError. Never
        // silently dropped: an export that quietly omits a task is worse than
        // one that fails.
        throw new ExportIntegrityError(task.id, task.listId);
      }
      bucket.push(toExportTask(task));
    }

    return {
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      account: {
        email: account.email,
        // The STORED value — `displayNameFor` is deliberately not applied
        // (technical-design D4): an export is the one artifact where "did the
        // user choose this?" is the whole question.
        displayName: account.displayName,
        timezone: account.timezone,
        theme: account.theme,
        createdAt: account.createdAt.toISOString(),
      },
      lists: lists.map((list) => toExportList(list, byList.get(list.id) ?? [])),
    };
  }
}

const toExportList = (
  row: ListRow,
  tasks: AccountExportTask[],
): AccountExportList => ({
  id: row.id,
  name: row.name,
  isDefault: row.isDefault,
  position: row.position,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  tasks,
});

/** Note what is absent: `isOverdue` (derived at read time against the clock —
 * FEAT-011 D3 — and meaningless in a stored file) and any `status` field
 * (`completedAt === null` already is the status everywhere in this product). */
const toExportTask = (row: TaskRow): AccountExportTask => ({
  id: row.id,
  listId: row.listId,
  title: row.title,
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  dueAt: row.dueAt ? row.dueAt.toISOString() : null,
  priority: row.priority,
  position: row.position,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
