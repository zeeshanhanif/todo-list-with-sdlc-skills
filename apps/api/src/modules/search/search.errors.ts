// Domain errors thrown by SearchService and translated to HTTP by the controller /
// exception filter (technical-design §3.1). Framework-free, the convention
// auth.errors.ts established and every module since has carried.

/** A supplied search parameter is unusable. Carries the **field** it belongs to
 * so the controller can render `validation_failed` + `fields[]` without a second
 * mapping table (→ 400; FR-SRCH-001/003/004/009, technical-design §3.1).
 *
 * One error class for every field rather than one class per field: unlike the
 * profile module's errors, these differ only in which name goes in `fields[0]`,
 * and five near-identical classes would be ceremony. */
export class SearchCriteriaInvalidError extends Error {
  constructor(
    public readonly field: 'q' | 'status' | 'due' | 'limit' | 'cursor',
    public readonly requirement: string,
  ) {
    super(requirement);
    this.name = 'SearchCriteriaInvalidError';
  }
}

/** The request carried none of `q` / `status` / `due` (→ 400 on the synthetic
 * field `_`; technical-design D6).
 *
 * An error rather than "return everything": answering the empty question with
 * the user's whole task list would duplicate FEAT-016's `All` view before it
 * exists, make the most expensive query the easiest one to trigger, and leave
 * SCR-WEB-012's **idle** state indistinguishable from a real result set. */
export class NoSearchCriteriaError extends Error {
  constructor() {
    super('Enter a keyword or choose a filter.');
    this.name = 'NoSearchCriteriaError';
  }
}
