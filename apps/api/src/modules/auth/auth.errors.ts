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

/** Sign-in credentials do not match — unknown email OR wrong password, thrown
 * identically for both so the response cannot reveal which (FEAT-003 → 401
 * invalid_credentials; FR-AUTH-010; UC-003 alt 3a). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("That email or password doesn't match. Please try again.");
    this.name = 'InvalidCredentialsError';
  }
}

/** Credentials are correct but the account is not yet verified — revealed only
 * after a correct password so it is not an enumeration oracle (FEAT-003 → 403
 * email_not_verified; FR-AUTH-007; UC-003 alt 3b). */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('Your email is not verified yet. Check your inbox for the link.');
    this.name = 'EmailNotVerifiedError';
  }
}

/** The `currentPassword` supplied to a change-password request does not verify
 * against the stored hash (FEAT-006 → 400 current_password_invalid, field
 * `currentPassword`; FR-AUTH-015; UC-006 alt 3a). Not 401: on an authenticated
 * route 401 means the session is gone (technical-design D3). */
export class CurrentPasswordInvalidError extends Error {
  constructor() {
    super('That current password is incorrect.');
    this.name = 'CurrentPasswordInvalidError';
  }
}

/** The account is within its lockout window after too many failed sign-ins
 * (FEAT-003 → 423 account_locked; FR-AUTH-019; UC-003 exc-3c). Carries the
 * seconds until the lock lifts, for the retry-after message. */
export class AccountLockedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      'Too many attempts. For your security, sign-in is paused — please try again later.',
    );
    this.name = 'AccountLockedError';
  }
}
