// Domain errors thrown by TasksService and translated to HTTP by the controller /
// exception filter (technical-design §3). Kept framework-free so the domain layer
// doesn't depend on HTTP — the convention auth.errors.ts / lists.errors.ts set.

/** The list named in the path is unknown **or** owned by another user. One error
 * for both, so the response can never disclose that an id exists elsewhere
 * (FR-AUTHZ-002/003 → 404 list_not_found).
 *
 * A module-local class rather than an import of the lists module's identical one:
 * `.dependency-cruiser.cjs` forbids `modules/tasks → modules/lists` (ADR-001's
 * seam). The shared *wire* code (`LIST_ERROR_CODES.listNotFound`) is what keeps
 * the two in agreement — see technical-design D7/D8. */
export class ListNotFoundError extends Error {
  constructor() {
    super('That list no longer exists.');
    this.name = 'ListNotFoundError';
  }
}

/** A submitted task title fails FR-TASK-002 (empty after trim, or over the
 * maximum). `requirement` is the specific message to show under the field,
 * mirroring ListNameInvalidError (→ 400 validation_failed, field `title`;
 * UC-009 alt 3a). */
export class TaskTitleInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'TaskTitleInvalidError';
  }
}
