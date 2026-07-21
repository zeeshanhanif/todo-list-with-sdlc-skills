// Domain errors thrown by AuthService and translated to HTTP by the controller /
// exception filter (technical-design §3). Kept framework-free so the domain layer
// doesn't depend on HTTP.

/** Email already associated with an account (FR-AUTH-002 → 409 email_taken). */
export class EmailTakenError extends Error {
  constructor() {
    super('This email is already in use.');
    this.name = 'EmailTakenError';
  }
}

/** Password fails the policy (FR-AUTH-004 → 400 validation_failed, field=password).
 * `requirement` is the specific message to show (UC-001 alt 3b). */
export class PasswordPolicyError extends Error {
  constructor(public readonly requirement: string) {
    super(requirement);
    this.name = 'PasswordPolicyError';
  }
}
