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

// --- Tasks: task detail — title, due date, priority, overdue (FEAT-011) ---

/**
 * The four priority values (FR-TASK-008). **The single source** the DTO
 * validator, the `tasks_priority_check` CHECK constraint (migration 009) and
 * the `priority-selector` all read, so they cannot drift apart
 * (FEAT-011 technical-design D6).
 *
 * Deliberately unordered: nothing sorts by priority today, and no FR asks it
 * to. If one ever does, that is an ordinal decision made there, with a
 * requirement behind it.
 */
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const;

/** FR-TASK-008 — None / Low / Medium / High, lowercase on the wire. */
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Path of a single task: GET (details) and PATCH (edit). Task ids are globally
 * unique and ownership is checked on `tasks.owner_id` directly, so the list is
 * not in the path — unlike the collection above. FEAT-012's complete/reopen and
 * FEAT-013's delete/restore extend this same resource. */
export const taskPath = (id: string): string => `/tasks/${id}`;

/** Success response (200) of GET /tasks/{id} — FR-TASK-004 names five details:
 * title, list, due date/time, priority and status. `task` carries four; `list`
 * carries the fifth as the same `ListSummary` every list endpoint returns, so
 * the detail surface renders "in Inbox" without a second round trip
 * (FEAT-011 technical-design D5). */
export interface TaskDetailResponse {
  task: TaskSummary;
  list: ListSummary;
}

/**
 * Request body of PATCH /tasks/{id} — **partial, and absent is not null**
 * (FEAT-011 technical-design D4).
 *
 * - field **absent** → leave it unchanged. A detail panel saving one field must
 *   not blank the other two.
 * - `dueAt: null` → **clear** the due date. FR-TASK-006 requires "set, change,
 *   **or clear**", so null must be a transmittable value, not a sentinel.
 *
 * A body with no recognized field is a `400 validation_failed`, not a silent
 * `200`: the API's global ValidationPipe runs `whitelist: true`, which *strips*
 * unknown properties, so a misspelled `dueDate` would otherwise look like a
 * successful no-op — the worst available outcome.
 */
export interface UpdateTaskRequest {
  /** Trimmed, then non-empty and ≤ TASK_TITLE_MAX_LENGTH — the same rule
   * creation applies (FR-TASK-005 is "subject to FR-TASK-002 validation"). */
  title?: string;
  /** ISO-8601 instant to set, or null to clear. Past instants are legal — and
   * necessary: FR-TASK-007's overdue state would be unreachable otherwise
   * (technical-design D2). */
  dueAt?: string | null;
  priority?: TaskPriority;
}

/** Success response (200) of PATCH /tasks/{id} — the task as stored, with
 * `isOverdue` recomputed (UC-010 main 3: "persists the changes and updates
 * overdue indication as needed"). */
export interface UpdateTaskResponse {
  task: TaskSummary;
}

/** Error `code` values the single-task endpoints add to the ApiError envelope.
 * `task_not_found` is the uniform answer for unknown, not-owned, non-uuid and
 * soft-deleted ids alike — the response never discloses which (FR-AUTHZ-002/003,
 * the convention FEAT-009 D3 set). Minted here rather than in FEAT-010, which
 * had no by-id lookup and said so (FEAT-010 technical-design D7). */
export const TASK_ERROR_CODES = {
  taskNotFound: "task_not_found",
} as const;

/**
 * A task as the task endpoints return it (FEAT-010 technical-design §3).
 *
 * **Deliberately minimal, and it grows** (technical-design D5): these are exactly
 * the columns that exist today. FEAT-011 added `dueAt` and `priority`, FEAT-014
 * added `position`. Consumers should read the fields they need rather than assume
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
  /**
   * Due date/time as an ISO-8601 UTC **instant**, or null for no due date
   * (FR-TASK-006 — "the due date/time is optional" is exactly null). Added by
   * FEAT-011.
   *
   * The user's timezone interprets what they typed and formats what they see;
   * it does not change the instant, which is why overdue below is
   * timezone-invariant (FEAT-011 technical-design D1).
   */
  dueAt: string | null;
  /** FR-TASK-008. Defaults to 'none' at creation — the column default is the
   * source of that default, not the application. Added by FEAT-011. */
  priority: TaskPriority;
  /**
   * FR-TASK-007 — derived by the **server**, in one place, so the list view,
   * the detail surface and FEAT-016's Overdue view cannot drift into three
   * definitions (FEAT-011 technical-design D3). True exactly when the task is
   * **active** and `dueAt` is strictly in the past; a completed task is never
   * overdue, per the FR's own note.
   *
   * A snapshot at response time: a page held open past the due instant keeps a
   * stale `false`. Clients may re-derive from `dueAt` against a fresher clock —
   * that is the same rule, not a second one.
   */
  isOverdue: boolean;
  /**
   * FR-TASK-012 — the task's 0-based rank within its list's **active** order,
   * the manual arrangement `POST /lists/{listId}/tasks/reorder` writes. Added by
   * FEAT-014.
   *
   * Meaningful only for active tasks: a completed or soft-deleted task keeps the
   * position it last held (nothing rewrites it — FEAT-014 D4), which is what
   * makes a reopen or a restore land somewhere deterministic rather than
   * arbitrary, but the completed section sorts by `completedAt`, not by this.
   *
   * **Not a stable identifier and not a display value** (ui-design D5): every
   * reorder renumbers it, and the order of the rows is its rendered form.
   * Positions are dense `0..n-1` immediately after a reorder and merely
   * increasing between them — new tasks append at `MAX + 1` (D5) — so read it
   * as a sort key, never as a count.
   */
  position: number;
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

/**
 * Request body of POST /lists/{listId}/tasks.
 *
 * `dueAt` and `priority` were added by FEAT-011, closing UC-009 step 2 which
 * FEAT-010 D6 deferred. Both are **optional with behaviour-preserving
 * defaults**, so a `{ title }` body behaves exactly as it did before
 * (FEAT-011 technical-design D8) — that additivity is asserted by AC-10, and a
 * FEAT-010 test needing an edit to stay green would mean the change was not
 * additive.
 */
export interface CreateTaskRequest {
  title: string;
  /** ISO-8601 instant, or null/omitted for no due date (FR-TASK-006). */
  dueAt?: string | null;
  /** Omitted = 'none', the FR-TASK-008 default. */
  priority?: TaskPriority;
}

/** Success response (201) of POST /lists/{listId}/tasks — created active
 * (`completedAt: null`) in the path's list, appended to the active order
 * (FR-TASK-001). */
export interface CreateTaskResponse {
  task: TaskSummary;
}

// --- Tasks: complete / reopen (FEAT-012) ---

/**
 * Path of the complete transition: `POST /tasks/{id}/complete` (FR-TASK-009).
 *
 * A **verb route**, not a field on PATCH: the completion instant is the
 * server's fact, never the client's, and FEAT-011's PATCH contract refuses
 * `completedAt` in the body outright (FEAT-012 technical-design D1).
 *
 * **Idempotent** — completing an already-completed task returns 200 with the
 * ORIGINAL `completedAt`, not a re-stamp and not a 409. A checkbox over a
 * network gets double-tapped and retried after a timeout, and FR-TASK-009's
 * "recording the completion timestamp" means the moment it was finished, not
 * the moment of the last click (D2).
 */
export const completeTaskPath = (id: string): string =>
  `${taskPath(id)}/complete`;

/** Path of the reopen transition: `POST /tasks/{id}/reopen` (FR-TASK-010).
 * Clears the completion timestamp; idempotent on an already-active task (D2). */
export const reopenTaskPath = (id: string): string => `${taskPath(id)}/reopen`;

/**
 * Success response (200) of **both** transitions — the task as stored, with
 * `isOverdue` recomputed.
 *
 * That recomputation is why this carries the task rather than being an empty
 * 204: completing a late task is the same call that clears its overdue
 * indication (FR-TASK-009's own note), and the client renders the server's
 * answer rather than deriving a second one (FEAT-011 technical-design D3).
 *
 * Neither route takes a request body — method, path and session fully specify
 * both operations (D8).
 */
export interface TaskStatusResponse {
  task: TaskSummary;
}

// --- Tasks: delete / restore (FEAT-013) ---

/**
 * Path of the restore transition: `POST /tasks/{id}/restore` (FR-TASK-014).
 *
 * The delete side needs no helper — `taskPath(id)` with the DELETE method is
 * the whole contract (FEAT-013 technical-design D1): HTTP already has a verb
 * for "remove this resource", and whether removal is *soft* is a storage fact
 * the client has no business encoding. Restore has no such verb, so it takes a
 * route beside `complete` and `reopen`.
 *
 * **Idempotent** — restoring a task that is not deleted returns 200 with
 * `deleted_at` already NULL, the same shape as reopening an active task (D3).
 */
export const restoreTaskPath = (id: string): string =>
  `${taskPath(id)}/restore`;

/**
 * Success response (200) of `DELETE /tasks/{id}` — the task as stored, plus
 * the instant its retention clock started (FR-TASK-013 → FR-TASK-015).
 *
 * **The task is not destroyed**: `deleted_at` is set, the row stays, and
 * `POST /tasks/{id}/restore` brings it back until FEAT-020's purge removes it
 * 30 days later. Nothing else about the row moves — which is exactly what
 * makes FR-TASK-014's "returning it to its original list and status" free.
 *
 * **`deletedAt` is here and NOT on `TaskSummary`** (D4): every read in the
 * system filters soft-deleted rows out, so the field would be `null` in 100%
 * of every other response. On the wire once, where it is the operation's own
 * result — and where it makes the idempotency of a repeat DELETE observable
 * without reading the database.
 *
 * **Idempotent, and it does not re-stamp** (D3): deleting an already-deleted
 * task returns the ORIGINAL `deletedAt`. A re-stamp would silently extend the
 * retention window on a double-tapped click, letting a client influence a
 * privacy-relevant schedule.
 */
export interface DeleteTaskResponse {
  task: TaskSummary;
  /** ISO-8601 UTC (NFR-LOC-001). The server's instant, never client-supplied
   * (FR-AUTHZ-004) — neither route takes a request body. */
  deletedAt: string;
}

/**
 * Success response (200) of `POST /tasks/{id}/restore` — the task, back in its
 * original list and status (FR-TASK-014).
 *
 * `listId` and `completedAt` were never touched by the delete, so a task
 * deleted while completed restores into the completed section with its
 * timestamp intact, and `isOverdue` re-derives on the way out: one whose due
 * date passed while it sat deleted comes back overdue, which is FR-TASK-007's
 * rule applied to a now-visible task rather than a second rule.
 */
export interface RestoreTaskResponse {
  task: TaskSummary;
}

// --- Tasks: manual order (FEAT-014) ---

/** Path of the reorder endpoint: `POST /lists/{listId}/tasks/reorder`
 * (FR-TASK-012). A sub-path of the collection rather than a sibling of it, so —
 * unlike `LIST_REORDER_PATH` — no route-declaration order is load-bearing: the
 * single-task routes live on `/tasks/{id}`, not under this collection. */
export const reorderTasksPath = (listId: string): string =>
  `${listTasksPath(listId)}/reorder`;

/**
 * Request body of `POST /lists/{listId}/tasks/reorder` — the caller's
 * **complete set of active, non-deleted task ids in that list**, in the desired
 * order (FEAT-014 technical-design D2).
 *
 * The whole vector, not a `{ taskId, toIndex }` patch: the server rewrites
 * positions to a dense `0..n-1` from it, which is what makes the operation
 * idempotent and keeps positions drift-free — and what lets a **stale** client
 * be told (`400`) rather than allowed to apply a move against an order it no
 * longer has. The same contract `ReorderListsRequest` uses for lists.
 *
 * Completed and soft-deleted tasks are not part of it: FR-TASK-012 orders
 * *active* tasks, and the completed section's order is FR-TASK-011's
 * (most recently completed first).
 */
export interface ReorderTasksRequest {
  taskIds: string[];
}

/** Success response (200) of the reorder endpoint — the **full list view** in
 * its new order, so the client re-renders from the server's truth rather than
 * its optimistic guess (D6). Deliberately the same shape `GET /lists/{listId}/tasks`
 * returns: one code path, so "the reorder response" and "a fresh read" cannot
 * disagree. */
export type ReorderTasksResponse = ListTasksResponse;

// --- Realtime cross-device sync (FEAT-019) ---

/**
 * Path of the Realtime token endpoint: `GET /realtime/token` (NFR-PERF-004,
 * ADR-006).
 *
 * The caller sends **nothing** — no body, no query, no user id. The subject is
 * always the session user, so there is no request shape that makes the API mint
 * another user's channel (FEAT-019 technical-design §3.1, FR-AUTHZ-002/003).
 */
export const REALTIME_TOKEN_PATH = "/realtime/token";

/**
 * The per-user Broadcast topic (ADR-006). Derived server-side from the session
 * and re-derived client-side only to subscribe — exported so the two sides
 * cannot drift on the string.
 */
export const userChannel = (userId: string): string => `user:${userId}`;

/** The Broadcast event name. One event, because the signal says only *that*
 * something changed, never what (technical-design §3.2). */
export const REALTIME_CHANGED_EVENT = "changed";

/**
 * The signal's entire payload — a change cursor and nothing else.
 *
 * No task id, no list id, no title, no change type. That emptiness is what lets
 * Realtime be used without Supabase Auth or RLS over our data (ADR-005/ADR-006):
 * even a mis-scoped channel leaks nothing, and every actual read still goes
 * through the authenticated API, which stays the sole enforcer of ownership.
 *
 * The client does **not** use `cursor` to suppress refreshes — a duplicate
 * refresh costs one refetch, a dropped one leaves a stale screen (D6). It is
 * here for ADR fidelity, log correlation, and a future `since`-style refetch.
 */
export interface RealtimeChangedPayload {
  /** ISO-8601 UTC instant assigned by the API at publish time. */
  cursor: string;
}

/**
 * Success response (200) of `GET /realtime/token`.
 *
 * `enabled: false` is the honest answer when no Realtime provider is configured
 * — **not** an error, and the default configuration today. The client does not
 * retry it; it falls back to the adaptive refetch schedule, which is what keeps
 * NFR-PERF-004 satisfied without a socket (technical-design D4).
 */
export type RealtimeTokenResponse =
  | { enabled: false }
  | {
      enabled: true;
      /** Supabase project URL the client opens the socket against. */
      url: string;
      /** The project's publishable (anon) key — public by design. **Never** the
       * service-role key, which signs broadcasts and stays server-side (D5). */
      publishableKey: string;
      /** Short-lived HS256 JWT: `sub` = the session user, `role` =
       * "authenticated". Accepted by Supabase Realtime and by nothing else —
       * presenting it to this API authenticates nothing (AC-6). */
      token: string;
      /** Always `user:{session user id}` — server-derived, never requested. */
      channel: string;
      /** ISO-8601 UTC expiry; the client re-mints at 80% of the lifetime. */
      expiresAt: string;
    };

// --- Profile & settings (FEAT-008) ---

/** Path of the profile resource — `GET` to read, `PATCH` to edit. Single-subject:
 * the caller is always the session user, so no id appears in the path, the query
 * or the body (FR-AUTHZ-004; technical-design §3). */
export const PROFILE_PATH = "/profile";

/** The three theme preferences (FR-PROF-004). `system` means "match the OS",
 * which is a stored *preference*, not a resolved value — the client resolves it
 * per device via `matchMedia` (technical-design D3). */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

/** A stored theme preference. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Maximum display-name length (FR-PROF-002). Shared so the client bound can
 * never drift from the server rule — the constant-sharing convention FEAT-001
 * set with PASSWORD_MIN_LENGTH. Names are trimmed before validation. */
export const DISPLAY_NAME_MAX_LENGTH = 80;

/**
 * The profile as `GET /profile` returns it (FR-PROF-001).
 *
 * Two fields are nullable, and each null means something specific:
 * - `displayName: null` — never set. The default is **derived at read time**,
 *   never stored (technical-design D1); render it with `displayNameFor`.
 * - `timezone: null` — not yet established. The effective zone is `UTC` until
 *   the client adopts the browser-detected one, which is FR-PROF-003's own
 *   two-stage default (technical-design D2).
 */
export interface UserProfile {
  /** The account email. Read-only in the MVP (FR-PROF-001). */
  email: string;
  displayName: string | null;
  /** An IANA zone id **exactly as the user chose it** — the server validates it
   * but deliberately does not re-canonicalize (technical-design D2). */
  timezone: string | null;
  theme: ThemePreference;
}

/** Success response (200) of `GET /profile`. */
export interface ProfileResponse {
  profile: UserProfile;
}

/**
 * Request body of `PATCH /profile` — **partial**, and *absent ≠ null*
 * (technical-design D6, the semantics FEAT-011 D4 established for this API).
 *
 * Omit a field to leave it alone. `displayName: null` **unsets** it back to the
 * derived default; `""` is a validation error, not a way to clear it. `timezone`
 * takes no null — a zone that has been established cannot be un-established.
 * A body with no recognized field is a `400`, never a silent no-op.
 */
export interface UpdateProfileRequest {
  displayName?: string | null;
  timezone?: string;
  theme?: ThemePreference;
}

/** Success response (200) of `PATCH /profile` — the profile **as stored**. */
export interface UpdateProfileResponse {
  profile: UserProfile;
}

/** Error `code` values the profile endpoints add to the ApiError envelope
 * (FEAT-008 technical-design §3). Field-level failures reuse the existing
 * `validation_failed` + `fields[]` convention; the empty patch reports on the
 * synthetic field `_`, which names the body itself rather than any one field. */
export const PROFILE_ERROR_CODES = {
  emptyPatchField: "_",
} as const;

/**
 * The display name to show for a user — the single rule both tiers render the
 * fallback with (technical-design D1).
 *
 * A stored name wins; otherwise the email's local part stands in
 * (`ada@example.com` → `ada`). Derived here rather than backfilled into the
 * column so that "did the user choose this?" stays answerable, and so the
 * fallback follows the email instead of drifting from it.
 */
export const displayNameFor = (user: {
  displayName: string | null;
  email: string;
}): string => user.displayName ?? user.email.split("@")[0];

// --- Search & filters (FEAT-015) ---

/** Path of the search endpoint — read-only, single-subject: the corpus searched
 * is always the caller's own, so no id appears anywhere in the request
 * (FR-AUTHZ-002; technical-design §3). */
export const SEARCH_PATH = "/search";

/** Status filter values (FR-SRCH-003). `overdue` is **the same predicate** as
 * the `overdue` due-bucket below — one definition of overdue in this system,
 * the one FEAT-011 D3 owns (technical-design D5). */
export const SEARCH_STATUSES = ["active", "completed", "overdue"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

/** Due-date filter buckets (FR-SRCH-004).
 *
 * `today` and `upcoming` are **calendar-day** questions and are therefore
 * computed in the user's stored timezone (FR-PROF-003). `overdue` is an
 * **instant** question and is therefore the same in every zone. That asymmetry
 * is deliberate and is why the two live side by side here rather than in one
 * uniform rule (technical-design §5.2/D5). */
export const SEARCH_DUE_BUCKETS = [
  "today",
  "upcoming",
  "overdue",
  "none",
] as const;
export type SearchDueBucket = (typeof SEARCH_DUE_BUCKETS)[number];

/** Maximum length of a search term (FR-SRCH-001). Shared so the client bound
 * cannot drift from the server rule — the convention FEAT-001 set with
 * PASSWORD_MIN_LENGTH. The term is trimmed before validation. */
export const SEARCH_QUERY_MAX_LENGTH = 200;

/** Default page size (FR-SRCH-009). */
export const SEARCH_PAGE_SIZE = 25;

/** Hard ceiling on `limit`. A larger value is a `400`, never a silent clamp —
 * a client that asked for 500 results and received 50 without being told would
 * conclude there were only 50 (technical-design §3.1). */
export const SEARCH_PAGE_SIZE_MAX = 50;

/**
 * One search hit: the full task, plus the name of the list holding it.
 *
 * Extends `TaskSummary` rather than redefining it, so a result carries the same
 * `completedAt` / `dueAt` / `priority` / `isOverdue` the rest of the product
 * reads — FR-SRCH-002's "with the list it belongs to and its status" is exactly
 * these two halves. `listName` is denormalized onto each row deliberately: a
 * page is at most 50 rows, and the alternative (a lookup map the client joins)
 * buys nothing at that size.
 */
export interface SearchResult extends TaskSummary {
  listName: string;
}

/**
 * Success response (200) of `GET /search`.
 *
 * `results` is ordered newest-first by the server and rendered in that order —
 * substring matching produces no relevance rank, so inventing one would be a
 * number nobody could explain (technical-design D2).
 *
 * There is no total count: the contract carries what the screen needs, and the
 * screen shows "N results so far" while paging (technical-design D7's
 * neighbour).
 */
export interface SearchResponse {
  results: SearchResult[];
  /**
   * Opaque cursor for the next page, or `null` when this page is the last.
   *
   * **Opaque by contract**: it encodes the last row's `(createdAt, id)` — the
   * exact ORDER BY tuple — and clients pass it back untouched rather than
   * constructing it. Keyset, not offset, so a task created between two page
   * requests cannot make an already-read row reappear or push an unread one
   * past the boundary (technical-design D4).
   */
  nextCursor: string | null;
}

/**
 * FR-TASK-007's overdue rule, in **one** place for the whole system.
 *
 * A task is overdue exactly when it is **active**, has a due date, and that
 * instant has passed. The `completedAt === null` clause is the FR's own note —
 * "only active (incomplete) tasks can be overdue" — not an optimization.
 *
 * **No timezone enters this comparison, and that is correct rather than an
 * oversight**: `dueAt` is an absolute instant, so "has it passed?" has the same
 * answer in every zone (FEAT-011 technical-design D1, FEAT-008 D4). Timezone
 * governs how a due date is typed and displayed, which is the client's business.
 *
 * It lives here, not in a module, because two API modules now derive it —
 * `tasks` (the list view and detail) and `search` (FR-SRCH-003's `overdue`
 * status and FR-SRCH-004's `overdue` bucket, which are the same predicate by
 * FEAT-015 D5) — and module boundaries forbid one importing the other. FEAT-011
 * anticipated exactly this: "derived by the server, in one place, so the list
 * view, the detail surface and FEAT-016's Overdue view cannot drift into three
 * definitions."
 */
export const isTaskOverdue = (task: {
  completedAt: Date | string | null;
  dueAt: Date | string | null;
}): boolean => {
  if (task.completedAt !== null || task.dueAt === null) return false;
  const due =
    task.dueAt instanceof Date ? task.dueAt.getTime() : Date.parse(task.dueAt);
  return due < Date.now();
};

// --- Smart views (FEAT-016) ---

/**
 * The four cross-list views, in the order FR-SRCH-008 defines them — which is
 * also the order the sidebar renders (ui-design D6's neighbour: fixed, not
 * sorted and not user-arrangeable).
 *
 * Membership, all four excluding completed and soft-deleted tasks: **today** =
 * due within the current day, **upcoming** = due after it — both calendar-day
 * questions and therefore computed in the caller's stored timezone
 * (FR-PROF-003) — **overdue** = the due instant has passed, which is the same
 * zone-invariant rule `isTaskOverdue` spells above, and **all** = every active
 * task, due date or not.
 */
export const SMART_VIEWS = ["today", "upcoming", "overdue", "all"] as const;
export type SmartView = (typeof SMART_VIEWS)[number];

/** Path of one view. The segment is a **resource name**, not a filter value, so
 * a name outside the four is a `404 view_not_found` rather than a validation
 * error (technical-design D6). */
export const smartViewPath = (view: string): string => `/views/${view}`;

/** Error `code` values the smart-view endpoint adds to the ApiError envelope
 * (technical-design §3.1). Field-level failures — `limit`, `cursor` — reuse the
 * existing `validation_failed` + `fields[]` convention unchanged. */
export const SMART_VIEW_ERROR_CODES = {
  viewNotFound: "view_not_found",
} as const;

/**
 * Success response (200) of `GET /views/{view}`.
 *
 * `results` reuses `SearchResult` — the same task payload plus the originating
 * list's name — because a cross-list view and a cross-list search answer the
 * same question about a row: what is it, and where does it live (UC-014 step 3).
 * A second shape would be a second thing to keep in step.
 *
 * `view` is **echoed** so a client that fired two view requests cannot render
 * the slower one's answer under the other one's heading.
 *
 * Ordering is the server's and the client does not re-sort: due-date ascending
 * for `today`/`upcoming`/`overdue`, newest-created first for `all`, which is the
 * only view whose members can lack a due date (technical-design D2). `nextCursor`
 * is FEAT-015's opaque keyset cursor, unchanged in format — only the meaning of
 * its timestamp half follows the sort.
 */
export interface SmartViewResponse {
  view: SmartView;
  results: SearchResult[];
  /** Opaque cursor for the next page, or `null` when this page is the last. */
  nextCursor: string | null;
}

// --- Account data: export personal data (FEAT-017) ---

/** Path of the export endpoint. Single-subject: the export is always the caller's
 * own data, so no id appears in the path, the query or the body — there is no
 * request shape that addresses another account (FR-AUTHZ-004; technical-design
 * §3.1). `POST` rather than `GET` because a URL carrying an entire dataset would
 * be bookmarkable, prefetchable and logged (technical-design D1). */
export const ACCOUNT_EXPORT_PATH = "/account/export";

/**
 * The export document's shape version (FR-DATA-001 — "portable,
 * machine-readable"). It exists so a consumer can tell an old file from a new
 * one, and the obligation it creates is real: **any future change to
 * `AccountExportDocument`'s shape bumps this** (technical-design §8, watch
 * item 2).
 */
export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;

/** The account's own fields, as the export carries them (FR-DATA-001).
 *
 * Deliberately narrow: credentials, token hashes, lockout counters and
 * verification state are **not** the user's content, and writing a password hash
 * into a file that lands in a downloads folder is the opposite of NFR-COMP-001's
 * data minimization (technical-design §3.2). */
export interface AccountExportAccount {
  email: string;
  /** The **stored** value — `null` when the user never set one. `displayNameFor`
   * is deliberately NOT applied: an export is the one artifact where "did the
   * user choose this?" is the whole question, so recording the derived fallback
   * would write down a preference they never expressed (technical-design D4). */
  displayName: string | null;
  /** As stored, verbatim; `null` when never established (FEAT-008 D2). */
  timezone: string | null;
  theme: ThemePreference;
  createdAt: string;
}

/** A task inside the export (FR-DATA-002).
 *
 * Two omissions are deliberate. There is no `isOverdue`: it is derived at read
 * time against the clock (FEAT-011 D3) and has no meaning inside a stored file.
 * There is no `status`: `completedAt === null` already *is* the status
 * everywhere in this product, and two representations of one fact is the drift
 * this codebase keeps refusing (technical-design §3.2). */
export interface AccountExportTask {
  id: string;
  /** Repeated even though the task is nested inside its list, so the object
   * stays self-describing when a script lifts it out of the tree
   * (technical-design D3). */
  listId: string;
  title: string;
  /** ISO-8601 UTC, or `null` when the task is active (FR-DATA-002). */
  completedAt: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** A list inside the export, with its tasks nested (FR-DATA-002). Lists with no
 * tasks appear with an empty `tasks` array — "all of the user's current lists"
 * includes the empty ones. */
export interface AccountExportList {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  tasks: AccountExportTask[];
}

/**
 * The export document — **the success body of `POST /account/export` itself**,
 * with no `{ export: … }` envelope around it (technical-design D2).
 *
 * That is a deliberate, single-site deviation from the wrapper convention every
 * other endpoint in this API follows (`{ profile }`, `{ lists }`, `{ task }`):
 * this body *is* the artifact the user keeps, so a wrapper would either be
 * written into their file as meaningless noise or be stripped by the client —
 * meaning the bytes they get are not the bytes the API returned. **Error**
 * responses still use the standard `ApiError` envelope, so client error handling
 * is unchanged.
 *
 * Soft-deleted tasks are **not** included (technical-design D7): FR-DATA-002
 * enumerates "active and completed", which is this product's own two-state
 * vocabulary, and a user who wants a deleted task in the file can restore it
 * first inside FEAT-013's window.
 */
export interface AccountExportDocument {
  formatVersion: number;
  /** ISO-8601 UTC instant the export was compiled. */
  exportedAt: string;
  account: AccountExportAccount;
  /** Ordered as the app orders them: `position` ascending, then `createdAt`. */
  lists: AccountExportList[];
}

/**
 * The download's filename — one rule, shared, so the `Content-Disposition` the
 * API sets and the `download` attribute the browser uses cannot drift apart
 * (the constant-sharing convention `PASSWORD_MIN_LENGTH` and `displayNameFor`
 * set; technical-design D5).
 *
 * The date is resolved **in the user's effective timezone**, not UTC: every
 * other date this product shows a user is in their zone (FR-PROF-003,
 * NFR-LOC-001), and a Calcutta user exporting at 02:00 local should not get
 * yesterday's date on their file. Pass `timezone ?? "UTC"` — the same fallback
 * the rest of the system applies to a null zone.
 */
export const accountExportFilename = (
  exportedAt: string | Date,
  timeZone: string,
): string => {
  const instant =
    typeof exportedAt === "string" ? new Date(exportedAt) : exportedAt;
  // `en-CA` renders ISO-ordered YYYY-MM-DD, which is what we want the filename
  // to carry; the zone does the actual work.
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return `todo-export-${date}.json`;
};

// --- Account data: delete account (FEAT-018) ---

/** Path of the account-deletion endpoint. Single-subject, exactly like the
 * export: the account deleted is always the caller's own, so no id appears in
 * the path, the query or the body — there is no request shape that addresses
 * another account (FR-AUTHZ-004; technical-design §3.1). */
export const ACCOUNT_DELETE_PATH = "/account/delete";

/**
 * Request body of `POST /account/delete` (FR-DATA-003, FR-DATA-004).
 *
 * The user is taken from the session, never from the body (FR-AUTHZ-001) — the
 * same rule `ChangePasswordRequest` follows, which is also where the field name
 * `currentPassword` comes from: it is the same fact, so it keeps the same name.
 */
export interface DeleteAccountRequest {
  currentPassword: string;
  /**
   * Must be the literal `true`. FR-DATA-004 requires an explicit confirmation
   * of **the system**, not only of the screen, so it is encoded in the contract
   * rather than left as a property of one client (technical-design D3): no
   * caller destroys an account by sending a password alone, and the requirement
   * is testable at the API.
   */
  confirm: true;
}

/**
 * Success response (200) of `POST /account/delete`.
 *
 * Deliberately says nothing about what was deleted: the account is gone, and a
 * count of destroyed rows would be data about a user we no longer hold. The
 * response also carries a `Set-Cookie` clearing the session cookie — every
 * session was revoked with the account (FR-DATA-005).
 */
export interface DeleteAccountResponse {
  status: "account_deleted";
}
