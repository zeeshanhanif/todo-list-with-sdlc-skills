// Domain errors thrown by ProfileService and translated to HTTP by the controller /
// exception filter (technical-design §3). Kept framework-free so the domain layer
// doesn't depend on HTTP — the convention auth.errors.ts established and
// lists.errors.ts carried.

/** A submitted display name fails FR-PROF-002 (empty after trim, over the maximum,
 * or carrying control characters). `requirement` is the specific message to show
 * under the field, mirroring ListNameInvalidError (→ 400 validation_failed, field
 * `displayName`; UC-007 alt 3a).
 *
 * Note what this is NOT thrown for: `displayName: null`, which is the deliberate
 * "unset it" value and a success (technical-design D1). */
export class DisplayNameInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'DisplayNameInvalidError';
  }
}

/** The submitted timezone is not a zone this runtime's ICU database resolves, or
 * is a fixed-offset form (`+05:30`, `Etc/GMT+5`) — legal input to `Intl` and wrong
 * for a person, because an offset is DST-blind (→ 400 validation_failed, field
 * `timezone`; FR-PROF-003, technical-design D2). */
export class TimezoneInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'TimezoneInvalidError';
  }
}

/** The submitted theme is not one of THEME_PREFERENCES (→ 400 validation_failed,
 * field `theme`; FR-PROF-004). Reachable only from a non-browser client or a
 * stale tab — the UI can offer nothing else. */
export class ThemeInvalidError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'ThemeInvalidError';
  }
}

/** The PATCH body carried no recognized field (→ 400 validation_failed, field `_`;
 * technical-design D6).
 *
 * This is an error rather than a no-op on purpose: the global ValidationPipe runs
 * with `whitelist: true`, which **strips** unknown properties silently, so a typo
 * like `{ timeZone: "Europe/Paris" }` would otherwise return `200` having changed
 * nothing — the worst available outcome. FEAT-011 D4 established the rule; this is
 * the second resource to inherit it. */
export class EmptyProfilePatchError extends Error {
  constructor() {
    super('Send at least one setting to change.');
    this.name = 'EmptyProfilePatchError';
  }
}

/** The session resolved but its user row is gone — the account was deleted while a
 * session was live (FEAT-018's future concern). Mapped to `401 unauthenticated`,
 * because "your account is gone" and "your session is not valid" are the same fact
 * to a caller, and a 500 would be a lie (technical-design §3.1). */
export class ProfileNotFoundError extends Error {
  constructor() {
    super('That account no longer exists.');
    this.name = 'ProfileNotFoundError';
  }
}
