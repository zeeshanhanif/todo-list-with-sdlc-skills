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

/** Presented verification token matches no live token — never issued, already
 * consumed, or rotated away by a later resend (FEAT-002 → 400 token_invalid;
 * UC-002 alt 2a / exc-3a). */
export class TokenInvalidError extends Error {
  constructor() {
    super('This verification link is invalid or has already been used.');
    this.name = 'TokenInvalidError';
  }
}

/** Presented verification token matches a user but is past its expiry
 * (FEAT-002 → 400 token_expired; NFR-SEC-004; UC-002 alt 2a). */
export class TokenExpiredError extends Error {
  constructor() {
    super('This verification link has expired.');
    this.name = 'TokenExpiredError';
  }
}
