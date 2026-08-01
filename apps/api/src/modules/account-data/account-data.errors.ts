// Domain errors thrown by AccountExportService and translated to HTTP by the
// controller / exception filter (technical-design §3.1). Kept framework-free so
// the domain layer doesn't depend on HTTP — the convention auth.errors.ts
// established and lists.errors.ts / profile.errors.ts carried.

/** The session resolved but its user row is gone — the account was deleted while
 * a session was live (FEAT-018's concern). Mapped to `401 unauthenticated`,
 * because "your account is gone" and "your session is not valid" are the same
 * fact to a caller, and a 500 would be a lie (technical-design §3.1). The same
 * rule `ProfileNotFoundError` already applies. */
export class AccountNotFoundError extends Error {
  constructor() {
    super('That account no longer exists.');
    this.name = 'AccountNotFoundError';
  }
}

/**
 * A task came back whose list is not in the same snapshot's list set — an
 * invariant violation that should be unreachable: `tasks.list_id` is `NOT NULL`
 * with an FK (FR-LIST-009), both reads are owner-scoped, and D8's REPEATABLE
 * READ snapshot means they cannot disagree about what exists.
 *
 * It throws rather than dropping the task because this is an **export**. The
 * quiet alternative — skip the orphan and return the rest — hands the user a
 * file that is missing their data and says nothing about it, and they have no
 * way to know. Failing loudly is recoverable (they retry, we get a log); a
 * silently incomplete export is not (technical-design AC-9).
 */
export class ExportIntegrityError extends Error {
  constructor(taskId: string, listId: string) {
    super(
      `Task ${taskId} references list ${listId}, which is not in the export snapshot.`,
    );
    this.name = 'ExportIntegrityError';
  }
}
