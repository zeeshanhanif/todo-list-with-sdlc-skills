// Domain errors thrown by ListsService and translated to HTTP by the controller /
// exception filter (technical-design §3). Kept framework-free so the domain layer
// doesn't depend on HTTP — the convention auth.errors.ts established.

/** The requested list is unknown **or** owned by another user. One error for both
 * cases on purpose: the response must not disclose that an id exists elsewhere
 * (FR-AUTHZ-003 → 404 list_not_found; technical-design D3). */
export class ListNotFoundError extends Error {
  constructor() {
    super('That list no longer exists.');
    this.name = 'ListNotFoundError';
  }
}

/** Deletion was attempted on the account's default (Inbox) list, which must always
 * survive so a task always has a destination (FR-LIST-004 → 409 list_not_deletable;
 * UC-008 exc-4b). */
export class ListNotDeletableError extends Error {
  constructor() {
    super("The Inbox list can't be deleted.");
    this.name = 'ListNotDeletableError';
  }
}

/** A submitted list name fails FR-LIST-002 (empty after trim, or over the maximum).
 * `requirement` is the specific message to show under the field, mirroring
 * PasswordPolicyError (→ 400 validation_failed, field `name`; UC-008 alt 3a). */
export class ListNameInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'ListNameInvalidError';
  }
}

/** The reorder body is not exactly the caller's set of list ids — one is missing,
 * repeated, or not owned by the caller (→ 400 validation_failed, field `listIds`;
 * FR-LIST-008, technical-design §3.5). */
export class ListOrderInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'ListOrderInvalidError';
  }
}
