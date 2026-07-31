/**
 * Smart-view domain errors (FEAT-016 technical-design §5.1) — framework-free,
 * the shape every module since FEAT-009 uses, mapped to HTTP by the controller.
 */

/** The `view` segment named something outside SMART_VIEWS.
 *
 * A `404`, not a `400` (technical-design D6): the segment names a **resource**,
 * not a filter value, and `/views/bogus` is a URL that does not exist. The four
 * names are a closed, public set, so unlike an id there is nothing to disclose
 * — FR-AUTHZ-003's uniform-404 rule is about ownership, and no ownership
 * question arises here. */
export class SmartViewNotFoundError extends Error {
  constructor() {
    super('That view does not exist.');
    this.name = 'SmartViewNotFoundError';
  }
}
