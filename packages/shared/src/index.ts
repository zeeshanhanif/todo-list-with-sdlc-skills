// Shared contracts across web / api / worker (ADR-002 — one language, shared types).
// The walking skeleton uses these to prove the end-to-end path; per-slice DTOs
// (auth, lists, tasks, ...) are added here by detailed-design.

/** Path of the API liveness endpoint (NFR-OBS-002 — uptime monitoring). */
export const HEALTH_PATH = "/healthz";

/**
 * Liveness response for GET /healthz. Cheap, dependency-free: answers "is the
 * process up and serving?" — deliberately does NOT touch the database, so uptime
 * monitoring doesn't depend on (or load) Postgres. Readiness/DB checks, if needed,
 * belong on a separate endpoint later.
 */
export interface HealthResponse {
  status: "ok";
  service: string;
  /** Server timestamp (ISO-8601, UTC — NFR-LOC-001). */
  time: string;
}

// The walking skeleton's DB round-trip proof (SKELETON_PING_PATH /
// SkeletonPingResponse, GET /healthz/ping) lived here until FEAT-009 retired it
// with the rest of the scaffolding — the removal docs/scaffold-notes.md planned
// for "when the first real slice lands" (FEAT-009 technical-design D7).

// --- Auth: registration (FEAT-001) ---

/** Path of the registration endpoint. */
export const REGISTER_PATH = "/auth/register";

/** Password policy bounds (NFR-SEC-003). Reused by the web client for the
 * min-length hint so the UI can never drift from the server rule. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Request body of POST /auth/register. */
export interface RegisterRequest {
  email: string;
  password: string;
}

/** Success response (201) of POST /auth/register — neutral (SW-002). */
export interface RegisterResponse {
  status: "verification_sent";
}

/** Standard API error envelope (established by FEAT-001, technical-design D6).
 * `fields` is present for field-level validation failures. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  fields?: Array<{ field: string; message: string }>;
}

// --- Auth: verify email + resend (FEAT-002) ---

/** Path of the email-verification endpoint. Consumes a single-use token. */
export const VERIFY_PATH = "/auth/verify";

/** Path of the resend-verification endpoint. Neutral response (no enumeration). */
export const RESEND_VERIFICATION_PATH = "/auth/verify/resend";

/** Request body of POST /auth/verify — the raw token from the email link. */
export interface VerifyRequest {
  token: string;
}

/** Success response (200) of POST /auth/verify. */
export interface VerifyResponse {
  status: "verified";
}

/** Request body of POST /auth/verify/resend. */
export interface ResendVerificationRequest {
  email: string;
}

/** Success response (200) of POST /auth/verify/resend — neutral: the same body
 * whether or not the address exists / is already verified / is in cooldown
 * (FEAT-002 technical-design D3). */
export interface ResendVerificationResponse {
  status: "verification_sent";
}

// --- Auth: sign in + session (FEAT-003) ---

/** Path of the sign-in endpoint. Issues an opaque session cookie (ADR-005). */
export const LOGIN_PATH = "/auth/login";

/** Path of the current-session introspection endpoint (authenticated). */
export const SESSION_PATH = "/auth/session";

/** Name of the opaque session cookie (HttpOnly, Secure, SameSite=Lax;
 * NFR-SEC-007). Shared so web and API never disagree on the cookie name. */
export const SESSION_COOKIE = "sid";

/** Request body of POST /auth/login. */
export interface SignInRequest {
  email: string;
  password: string;
}

/** The authenticated user's public identity — returned by sign-in and session
 * introspection; safe to expose to the client (no credentials). */
export interface SessionUser {
  id: string;
  email: string;
}

/** Success response (200) of POST /auth/login — the session cookie is set via
 * the response's Set-Cookie header (FEAT-003 technical-design §3.1). */
export interface SignInResponse {
  status: "signed_in";
  user: SessionUser;
}

/** Success response (200) of GET /auth/session — the current session's user
 * (FR-AUTHZ-001; 401 `unauthenticated` when no valid session). */
export interface SessionResponse {
  user: SessionUser;
}

/** Error `code` values the sign-in flow adds to the ApiError envelope
 * (FEAT-003 technical-design §3). Shared so the web can branch on them without
 * string-drift: 401 invalid_credentials (generic, no enumeration — FR-AUTH-010),
 * 403 email_not_verified (FR-AUTH-007), 423 account_locked (FR-AUTH-019),
 * 429 rate_limited (FR-AUTH-018), 401 unauthenticated (FR-AUTHZ-001). */
export const AUTH_ERROR_CODES = {
  invalidCredentials: "invalid_credentials",
  emailNotVerified: "email_not_verified",
  accountLocked: "account_locked",
  rateLimited: "rate_limited",
  unauthenticated: "unauthenticated",
  /** 400 on POST /auth/change-password when `currentPassword` doesn't verify
   * (FEAT-006 technical-design D3). Deliberately NOT 401 — on an authenticated
   * route 401 means "your session is gone" and the client redirects to sign-in. */
  currentPasswordInvalid: "current_password_invalid",
} as const;

/** Extra fields carried on 423/429 error envelopes so the UI can render a
 * human retry-after message (FEAT-003 technical-design §3.1, D3). */
export interface RetryAfterError extends ApiError {
  retryAfterSeconds: number;
}

// --- Auth: sign out (FEAT-004) ---

/** Path of the sign-out endpoint. Idempotent; clears the session cookie. */
export const LOGOUT_PATH = "/auth/logout";

/** Success response (200) of POST /auth/logout — always neutral/idempotent
 * (FEAT-004 technical-design §3.1). The session cookie is cleared via the
 * response's Set-Cookie header. */
export interface SignOutResponse {
  status: "signed_out";
}

// --- Auth: forgot / reset password (FEAT-005) ---

/** Path of the forgot-password (reset-request) endpoint. Neutral response. */
export const FORGOT_PATH = "/auth/forgot";

/** Path of the reset-password endpoint. Consumes a single-use reset token. */
export const RESET_PATH = "/auth/reset";

/** Request body of POST /auth/forgot. */
export interface ForgotPasswordRequest {
  email: string;
}

/** Success response (200) of POST /auth/forgot — neutral: the same body whether
 * or not the address is registered (FEAT-005 technical-design §3.1, no enumeration). */
export interface ForgotPasswordResponse {
  status: "reset_requested";
}

/** Request body of POST /auth/reset — the raw token from the email link + the
 * new password (validated against the policy, NFR-SEC-003). */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/** Success response (200) of POST /auth/reset. The reset invalidates all of the
 * user's existing sessions (FR-AUTH-017). */
export interface ResetPasswordResponse {
  status: "password_reset";
}

// --- Auth: change password (FEAT-006) ---

/** Path of the change-password endpoint. Authenticated; rotates the caller's
 * session cookie (FEAT-006 technical-design D1). */
export const CHANGE_PASSWORD_PATH = "/auth/change-password";

/** Request body of POST /auth/change-password. The user is taken from the
 * session, never from the body (FR-AUTHZ-001). */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Success response (200) of POST /auth/change-password. All sessions that
 * existed before the change are invalidated (FR-AUTH-017) and the response
 * carries a freshly issued session cookie for the calling device
 * (NFR-SEC-007 — rotation on privilege change). */
export interface ChangePasswordResponse {
  status: "password_changed";
}

// --- Lists: list management (FEAT-009) ---

/** Path of the list collection: GET (all with counts) and POST (create). */
export const LISTS_PATH = "/lists";

/** Path of the reorder endpoint. Declared before `/lists/:id` on the server so
 * the static segment isn't captured as an id (FEAT-009 technical-design §3). */
export const LIST_REORDER_PATH = "/lists/reorder";

/** Maximum list-name length (FR-LIST-002). Shared so the client bound can never
 * drift from the server rule — the constant-sharing convention FEAT-001 set with
 * PASSWORD_MIN_LENGTH. Names are trimmed before validation; duplicates are legal. */
export const LIST_NAME_MAX_LENGTH = 100;

/** A list as every list endpoint returns it. `activeTaskCount` counts incomplete,
 * not-soft-deleted tasks (FR-LIST-005); `taskCount` counts every task in the list
 * and exists so the delete confirmation can quantify what will be permanently
 * lost (FR-LIST-007, NFR-USE-002 — FEAT-009 technical-design D8). */
export interface ListSummary {
  id: string;
  name: string;
  /** The Inbox (FR-LIST-003): renameable, never deletable (FR-LIST-004). */
  isDefault: boolean;
  /** 0-based rank within the owner's lists (FR-LIST-008). */
  position: number;
  activeTaskCount: number;
  taskCount: number;
}

/** Success response (200) of GET /lists — ordered by position (FR-LIST-005/008). */
export interface ListsResponse {
  lists: ListSummary[];
}

/** Request body of POST /lists. Ownership comes from the session, never the
 * body (FR-AUTHZ-004). */
export interface CreateListRequest {
  name: string;
}

/** Success response (201) of POST /lists — the new list, appended last. */
export interface CreateListResponse {
  list: ListSummary;
}

/** Request body of PATCH /lists/{id} — rename only (FR-LIST-006). */
export interface RenameListRequest {
  name: string;
}

/** Success response (200) of PATCH /lists/{id}. */
export interface RenameListResponse {
  list: ListSummary;
}

/** Success response (200) of DELETE /lists/{id}. The contained tasks are
 * permanently deleted with the list (FR-LIST-007); `deletedTaskCount` is how
 * many rows went. Irreversible — there is no restore (technical-design D4). */
export interface DeleteListResponse {
  status: "list_deleted";
  deletedTaskCount: number;
}

/** Request body of POST /lists/reorder — the caller's **complete** set of list
 * ids in the desired order. The server rewrites positions to 0..n-1 in one
 * transaction, which makes the operation idempotent (technical-design D2). */
export interface ReorderListsRequest {
  listIds: string[];
}

/** Success response (200) of POST /lists/reorder — the full collection in its
 * new order, so the client renders from the server's truth. */
export interface ReorderListsResponse {
  lists: ListSummary[];
}

/** Error `code` values the list endpoints add to the ApiError envelope
 * (FEAT-009 technical-design §3). Shared so the web branches on codes without
 * string-drift: 404 list_not_found (unknown **or** not owned — uniform, so the
 * response never discloses another user's ids, FR-AUTHZ-003), 409
 * list_not_deletable (the default Inbox list, FR-LIST-004). Field-level name
 * failures reuse the existing `validation_failed` + `fields[]` convention. */
export const LIST_ERROR_CODES = {
  listNotFound: "list_not_found",
  listNotDeletable: "list_not_deletable",
} as const;

// --- Tasks: create + list view (FEAT-010) ---

/** Path of a list's task collection: GET (the list view) and POST (create).
 * The list is always in the path — a task belongs to exactly one list, assigned
 * at creation (FR-LIST-009), and the owner comes from the session, never the
 * body (FR-AUTHZ-004). */
export const listTasksPath = (listId: string): string =>
  `${LISTS_PATH}/${listId}/tasks`;

/** Maximum task-title length (FR-TASK-002). Shared so the client bound can never
 * drift from the server rule — the convention PASSWORD_MIN_LENGTH and
 * LIST_NAME_MAX_LENGTH set. Titles are trimmed before validation; duplicates are
 * legal. */
export const TASK_TITLE_MAX_LENGTH = 500;

/**
 * A task as the task endpoints return it (FEAT-010 technical-design §3).
 *
 * **Deliberately minimal, and it grows** (technical-design D5): these are exactly
 * the columns that exist today. FEAT-011 adds `dueAt` and `priority`, FEAT-014
 * adds `position`. Consumers should read the fields they need rather than assume
 * this shape is exhaustive — shipping `dueAt: null` placeholders for columns the
 * system does not store would be a contract that lies.
 */
export interface TaskSummary {
  id: string;
  /** The one list it belongs to (FR-LIST-009). */
  listId: string;
  title: string;
  /** ISO-8601 UTC, or null when the task is active (NFR-LOC-001). */
  completedAt: string | null;
  /** ISO-8601 UTC. Also the active section's sort key (technical-design D4). */
  createdAt: string;
}

/**
 * Success response (200) of GET /lists/{listId}/tasks — the list view.
 * The split between active and completed is the **server's** answer, not a
 * client-side filter (FR-TASK-003); soft-deleted tasks appear in neither
 * (FR-TASK-013). `list` rides along so the screen renders its header without a
 * second round trip (technical-design D3).
 */
export interface ListTasksResponse {
  list: ListSummary;
  /** completed_at IS NULL, oldest first — append order (technical-design D4). */
  active: TaskSummary[];
  /** completed_at IS NOT NULL, most recently completed first. */
  completed: TaskSummary[];
}

/** Request body of POST /lists/{listId}/tasks. */
export interface CreateTaskRequest {
  title: string;
}

/** Success response (201) of POST /lists/{listId}/tasks — created active
 * (`completedAt: null`) in the path's list, appended to the active order
 * (FR-TASK-001). */
export interface CreateTaskResponse {
  task: TaskSummary;
}
