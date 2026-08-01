# Technical Design: FEAT-017 — Export personal data (JSON)

> Feature from: docs/implementation-plan.md §3 · Epic: EPIC-G — Account Data & Privacy (`account-data` module)
> Implements: FR-DATA-001, FR-DATA-002, NFR-COMP-001 (partial) · Realizes: UC-015 · Screens: SCR-WEB-016, SCR-WEB-014 (designed by ui-design)
> Status: Draft · Date: 2026-08-01

## 1. Intent

A signed-in user downloads everything the product holds for them — their account
preferences, all of their lists, and every active and completed task in those
lists — as one portable JSON file (FR-DATA-001, FR-DATA-002). It is the first
half of EPIC-G's privacy pair: export before delete, so that FEAT-018's
irreversible deletion has a way for a user to keep their data first
(NFR-COMP-001). It is next because Phases 1–3 are complete and the plan's
Phase 4 opens with it.

This feature **mints the `account-data` module** (architecture §5), the last
capability module in the API monolith; FEAT-018 extends it with account
deletion.

## 2. Codebase context

Surveyed at commit `2ceb55d` (migration 012, `1721590000000_task-manual-order`).
What this design conforms to:

**Module shape.** `apps/api/src/modules/profile/` is the closest structural
model: controller + service + repository + errors, framework-free domain errors,
a `toHttp` mapper in the controller, module registered in `app.module.ts`.
`account-data` copies that *shape*. `src/modules/README.md` already reserves the
row (`account-data` | FR-DATA-* | FEAT-017, FEAT-018).

**Contract conventions in force.**
- Paths and wire types are declared in `@todo/shared` and consumed by both tiers
  (`PROFILE_PATH`, `LISTS_PATH`, `taskPath`, …). Constants that both tiers must
  agree on live there too (`PASSWORD_MIN_LENGTH`, `LIST_NAME_MAX_LENGTH`,
  `TASK_PRIORITIES`, `displayNameFor`) — the anti-drift rule FEAT-001 set.
- Error envelope: `ApiError { statusCode, code, message, fields? }`, rendered by
  the global `HttpExceptionFilter`; module-specific `code` values are exported as
  a `*_ERROR_CODES` const (`LIST_ERROR_CODES`, `PROFILE_ERROR_CODES`).
- Authenticated routes carry class-level `@UseGuards(SessionGuard)` and read the
  caller through `@CurrentUser()`. Ownership is `WHERE owner_id = $1`, never
  optional, never conditional (FEAT-009 D3).
- Timestamps cross the wire as ISO-8601 UTC strings, formatted in the service by
  `Date.toISOString()` (`tasks.service.ts` `toSummary`).

**Current schema** (migrations 001–012), all of it already sufficient:
- `users(id, email, password_hash, verified_at, verification_token_hash,
  verification_token_expires_at, reset_token_hash, reset_token_expires_at,
  failed_login_count, locked_until, display_name, timezone, theme, created_at,
  updated_at)`
- `lists(id, owner_id, name, is_default, position, created_at, updated_at)`
- `tasks(id, owner_id, list_id, title, completed_at, deleted_at, due_at,
  priority, position, created_at, updated_at)`

**Reading another module's tables is established and is not a boundary
violation.** `modules/search` reads `lists`, `modules/tasks` reads `lists`
(FEAT-010 D8). The enforced rule (`npm run boundaries`) forbids importing another
module's *code*. `account-data` reads `users`, `lists` and `tasks` and imports
nothing from `auth`, `lists`, `tasks` or `profile`.

**Web tier.** BFF proxy routes under `app/api/**` forward the browser's session
cookie to the API and relay status + body verbatim (`app/api/profile/route.ts` is
the model). `app/settings/security/page.tsx` (SCR-WEB-014) already exists as the
hub and its comment names FEAT-017 as a future row — the entry point is a
one-row addition, not a new screen.

**Divergence found:** none. The plan's `POST /account/export` and the
architecture's `account-data` module both match the code's conventions as they
stand.

**Standing defects that constrain this feature** (see §8): DEF-002 (run the api
suite serially), and the three closed web-tier design-system rules — DEF-006
(`--color-danger-text` on the danger tint), DEF-009 (visible focus ring),
DEF-011 (≥44px icon-only controls on touch) — which any new UI must be born
conforming to rather than re-fixed later.

## 3. API contracts

### 3.1 `POST /account/export`

| | |
| :-- | :-- |
| Auth | Required — `SessionGuard`; the caller is the session user (FR-AUTHZ-001). |
| Path | `ACCOUNT_EXPORT_PATH = "/account/export"` |
| Request body | **None.** There is no id, filter or scope parameter: the export is the session user's data, and no request shape can address another account (FR-AUTHZ-004) — the same property that lets `/profile` skip ownership plumbing. |
| Success | `200` with the export document as the body (see §3.2 and D2). |
| Headers | `Content-Type: application/json; charset=utf-8`, and `Content-Disposition: attachment; filename="<accountExportFilename(...)>"` (D5). |
| Side effects | None on domain data. One best-effort `data_exported` audit row (D6). No `changed` signal — this is a read, so the controller does **not** carry `ChangeSignalInterceptor` (contrast `ProfileController`). |
| Idempotency | Naturally idempotent: repeated calls return the same document apart from `exportedAt`. `POST` is the plan's verb — see D1. |

**Errors**

| Status | `code` | When | Traces to |
| :-- | :-- | :-- | :-- |
| `401` | `unauthenticated` | Missing / expired / revoked session cookie. Same body the other guarded routes return. | FR-AUTHZ-001; UC-015 precondition |
| `401` | `unauthenticated` | The session resolves but the user row is gone (deleted concurrently). To a caller that is the same fact as an invalid session, and a `500` would be a lie — the rule `ProfileController.toHttp` already applies to `ProfileNotFoundError`. | §3.1 of FEAT-008's design |
| `500` | `internal_error` | Rendered by the global filter for anything unrecognized. | — |

There is no `404` and no `validation_failed`: the endpoint takes no input and
its subject always exists whenever the session does. UC-015 defines no exception
flow, which is consistent — the only way this call fails is infrastructural.

### 3.2 The export document (`AccountExportDocument`)

New in `@todo/shared`. **The response body is the document itself**, not an
envelope around it (D2).

```jsonc
{
  "formatVersion": 1,                       // ACCOUNT_EXPORT_FORMAT_VERSION
  "exportedAt": "2026-08-01T09:14:22.881Z", // ISO-8601 UTC, response time
  "account": {
    "email": "sam@example.com",
    "displayName": null,                    // as STORED; null = never set (D4)
    "timezone": "Asia/Calcutta",            // as stored, verbatim; null = unset
    "theme": "system",
    "createdAt": "2026-07-22T11:02:41.006Z"
  },
  "lists": [                                // position ASC, created_at ASC
    {
      "id": "…", "name": "Inbox", "isDefault": true, "position": 0,
      "createdAt": "…", "updatedAt": "…",
      "tasks": [                            // position ASC, created_at ASC
        {
          "id": "…",
          "listId": "…",                    // redundant with nesting, on purpose (D3)
          "title": "Call the supplier back",
          "completedAt": null,              // null = active (FR-DATA-002)
          "dueAt": "2026-08-02T09:00:00.000Z",
          "priority": "high",
          "position": 0,
          "createdAt": "…",
          "updatedAt": "…"
        }
      ]
    }
  ]
}
```

TypeScript shapes exported from `@todo/shared`: `AccountExportDocument`,
`AccountExportAccount`, `AccountExportList`, `AccountExportTask`, the constants
`ACCOUNT_EXPORT_PATH` and `ACCOUNT_EXPORT_FORMAT_VERSION`, and the filename
helper `accountExportFilename(exportedAt, timeZone)` (D5).

**Scope rules, each with its requirement:**

| Included | Why |
| :-- | :-- |
| Every list the user owns, including the Inbox and lists holding no tasks | FR-DATA-002 "all of the user's current lists" |
| Active tasks (`completed_at IS NULL`) | FR-DATA-002 |
| Completed tasks (`completed_at IS NOT NULL`) | FR-DATA-002 |
| The account's own preference fields | FR-DATA-001 "all of their personal data"; NFR-COMP-001 |

| Excluded | Why |
| :-- | :-- |
| Soft-deleted tasks (`deleted_at IS NOT NULL`) | D7 |
| `password_hash`, token hashes, `failed_login_count`, `locked_until`, `verified_at` | Credentials and security state are not the user's *content*; exporting a password hash into a file that lands in a downloads folder is the opposite of NFR-COMP-001's data-minimization. Sessions and audit rows likewise. |
| `isOverdue` | Derived at read time from `dueAt` against the clock (FEAT-011 D3). It has no meaning inside a stored file, and writing it down would be a second derivation of the rule FEAT-011 deliberately keeps in one place. |
| A `status: "active" \| "completed"` field | Same rule: `completedAt` already *is* the status (`null` = active) everywhere in this product. Two representations of one fact is the drift this codebase keeps refusing. |

## 4. Schema changes

**None.** No migration, no table, no column, no index.

Every field the export needs already exists (§2) and every access path is keyed
on an existing index: `lists_owner_position_idx` on `(owner_id, position)` serves
the list read, and `tasks_owner_list_idx` on `(owner_id, list_id)` serves the task
read. The feature is a pure read over entities the conceptual model already owns
(User, List, Task — architecture §8), so there is nothing to escalate.

*This is worth stating positively rather than by silence:* an implementer
following the usual schema → domain → contract order should not go looking for
the migration task, and a reviewer should be able to see that "no migration" was
a finding, not an omission.

## 5. Component design

### 5.1 API — `apps/api/src/modules/account-data/`

```
account-data/
  account-data.module.ts        registers controller + providers; imported by AppModule
  account-export.controller.ts  POST /account/export; toHttp; sets Content-Disposition
  account-export.service.ts     orchestration + row → wire mapping
  account-export.repository.ts  the three reads, inside one snapshot transaction
  account-data.errors.ts        AccountNotFoundError
```

**`AccountExportRepository.readAll(ownerId)`** — the whole of the data access,
and the only place the snapshot rule lives:

```ts
return this.db.transaction(async (tx) => {
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); // D8
  const account = await tx.query(ACCOUNT_SQL, [ownerId]);
  const lists   = await tx.query(LISTS_SQL,   [ownerId]);
  const tasks   = await tx.query(TASKS_SQL,   [ownerId]);
  return { account: account.rows[0] ?? null, lists: lists.rows, tasks: tasks.rows };
});
```

- `ACCOUNT_SQL` — `SELECT email, display_name, timezone, theme, created_at FROM users WHERE id = $1`.
  The module reads `users` directly rather than through `common/preferences`'
  `UserTimezoneService`: it needs four other columns from the same row anyway, so
  routing the timezone through the shared service would cost a second query to
  avoid nothing.
- `LISTS_SQL` — `SELECT id, name, is_default, position, created_at, updated_at
  FROM lists WHERE owner_id = $1 ORDER BY position ASC, created_at ASC`
  (the order `GET /lists` returns, so the file matches the app).
- `TASKS_SQL` — `SELECT id, list_id, title, completed_at, due_at, priority,
  position, created_at, updated_at FROM tasks
  WHERE owner_id = $1 AND deleted_at IS NULL
  ORDER BY list_id, position ASC, created_at ASC`.

Three statements rather than one join: a join would repeat every list's columns
once per task and force the service to re-group them, and lists with no tasks
would need a `LEFT JOIN` with null-task branches. The grouping is one pass over
the task rows in the service.

**`AccountExportService.export(userId)`** — reads, then maps to the wire shape:
`Date → toISOString()`, `display_name → displayName` (**stored value, not the
derived default** — D4), grouping tasks into their lists by `list_id` in a single
pass over a `Map<string, AccountExportTask[]>`. A missing account row throws
`AccountNotFoundError`. It stamps `exportedAt` once and returns it alongside the
document so the controller can build the filename from the same instant.

**`AccountExportController`** — `@UseGuards(SessionGuard)`, **no**
`ChangeSignalInterceptor`. Sets `Content-Disposition` via `@Res({ passthrough: true })`
and returns the document. `toHttp` maps `AccountNotFoundError → 401 unauthenticated`.
Fires the audit record (D6) without awaiting its failure path — `AuditService.record`
is best-effort by contract.

```mermaid
sequenceDiagram
    autonumber
    participant W as "Web (SCR-WEB-016)"
    participant B as "BFF /api/account/export"
    participant C as "AccountExportController"
    participant S as "AccountExportService"
    participant R as "AccountExportRepository"
    participant D as "Postgres"
    W->>B: "POST (session cookie)"
    B->>C: "POST /account/export (cookie forwarded)"
    C->>C: "SessionGuard resolves the user"
    C->>S: "export(userId)"
    S->>R: "readAll(ownerId)"
    R->>D: "BEGIN; REPEATABLE READ"
    R->>D: "account / lists / tasks"
    D-->>R: "rows (one snapshot)"
    R-->>S: "rows"
    S-->>C: "AccountExportDocument"
    C->>C: "audit data_exported (best effort)"
    C-->>B: "200 + Content-Disposition"
    B-->>W: "200 + body relayed verbatim"
    W->>W: "Blob → anchor download"
```

**Skeleton stubs replaced:** none — `account-data` has no stub; this feature
creates the directory. `src/modules/README.md`'s table row moves to *built
(export)*.

### 5.2 Web — `apps/web/src/`

| File | Role |
| :-- | :-- |
| `app/api/account/export/route.ts` | BFF `POST` proxy. Forwards `cookie`, relays status, body **and** `Content-Disposition` verbatim. Modelled on `app/api/profile/route.ts`. |
| `lib/account-export.ts` | `requestExport()` — POSTs, returns `{ document, filename }` or a typed failure; parses the filename from `Content-Disposition` with `accountExportFilename` as the fallback. |
| `app/settings/security/export/page.tsx` | **SCR-WEB-016**. Server component, `requireSession()`, renders the shell + the client island. |
| `components/export-data.tsx` | Client island: the button and the three states SCR-WEB-016 names — `default`, `preparing`, `ready` — plus the error state NFR-USE-003 requires. Triggers the download (D5). |
| `app/settings/security/page.tsx` | **SCR-WEB-014**: one new `HubRow` → `/settings/security/export`. |

The download itself: `new Blob([JSON.stringify(document, null, 2)])` → object URL
→ a programmatic `<a download={filename}>` click → `URL.revokeObjectURL`. A
fetch-based POST cannot let the browser's own download machinery handle
`Content-Disposition`, which is why the client re-serializes; the header is still
set for direct API consumers (curl, scripts) and is what `lib/account-export.ts`
prefers when present.

Screens themselves are ui-design's output; the table above is the wiring these
tasks own.

## 6. Acceptance criteria

| AC | Statement | Traces to |
| :-- | :-- | :-- |
| AC-1 | **Given** a signed-in user, **when** they `POST /account/export`, **then** the response is `200` whose body parses as JSON with exactly the top-level keys `formatVersion`, `exportedAt`, `account`, `lists`; `formatVersion === 1`. | FR-DATA-001; UC-015 main 1–3 |
| AC-2 | **Given** a user with several lists — including the Inbox and at least one list holding no tasks — **when** they export, **then** every list appears exactly once, in `position ASC, created_at ASC` order, with `id`, `name`, `isDefault`, `position`, `createdAt`, `updatedAt`; the empty list appears with `tasks: []`. | FR-DATA-002 |
| AC-3 | **Given** a list holding both active and completed tasks, **when** they export, **then** both appear under that list, the active one with `completedAt: null` and the completed one with its ISO-8601 `completedAt`, each carrying `title`, `listId`, `dueAt`, `priority`, `position`, `createdAt`, `updatedAt`. | FR-DATA-002 |
| AC-4 | **Given** a task that has been soft-deleted (FEAT-013) and not yet purged, **when** the owner exports, **then** that task appears nowhere in the document, and no other task is affected. | FR-DATA-002 (note); D7 |
| AC-5 | **Given** two accounts each holding lists and tasks, **when** each exports, **then** neither document contains any id, list name or task title belonging to the other — asserted over the serialized document, not only over the parsed arrays. | FR-DATA-001 ("scoped to the requesting user only"); FR-AUTHZ-002/003 |
| AC-6 | **Given** no session cookie, an expired one, or one revoked by sign-out, **when** `POST /account/export` is called, **then** the response is `401` with `code: "unauthenticated"` and carries no account, list or task data. | FR-AUTHZ-001; UC-015 precondition |
| AC-7 | **Given** any export, **then** every timestamp in it (`exportedAt`, `account.createdAt`, and each list's and task's `createdAt`/`updatedAt`/`completedAt`/`dueAt`) is either `null` or an ISO-8601 UTC string ending in `Z` that round-trips through `new Date(...).toISOString()` unchanged. | FR-DATA-001 ("portable, machine-readable"); NFR-LOC-001 |
| AC-8 | **Given** a user who has never set a display name, **when** they export, **then** `account.displayName` is `null` (the stored value, **not** the email-derived default), `account.email`, `account.timezone` (verbatim as stored, `null` when unset), `account.theme` and `account.createdAt` are present; and no `password_hash`, token hash, `failedLoginCount`, `lockedUntil` or `verifiedAt` appears anywhere in the document. | FR-DATA-001; NFR-COMP-001; D4 |
| AC-9 | **Given** an export in progress, **when** a concurrent write moves or creates a task, **then** the document is internally consistent: every task's `listId` matches the list it is nested under, and no task is nested under a list absent from `lists`. | UC-015 main 2 ("compiles… into JSON" — one document, one state); D8 |
| AC-10 | **Given** an account at the NFR-SCAL-002 ceiling — 100 lists and 5,000 tasks — **when** they export, **then** one complete document is returned in a single response within **2 s** server-side, with every task present. | NFR-SCAL-002; D9 |
| AC-11 | **Given** a successful export, **then** exactly one `data_exported` audit row is appended for that user, and it contains no exported content (no titles, no list names); **and** an audit-write failure still returns `200` with the document. | NFR-SEC-009; D6 |
| AC-12 | **Given** the export screen (SCR-WEB-016), **when** the user requests the export, **then** the control moves `default → preparing → ready` and a file downloads named `todo-export-<YYYY-MM-DD>.json` where the date is *the user's* effective timezone's date, matching `accountExportFilename`; the downloaded bytes parse as the document from AC-1. | UC-015 main 3; FR-DATA-001; D5 |
| AC-13 | **Given** the Security & account hub (SCR-WEB-014), **then** it offers a row reaching SCR-WEB-016, keyboard-reachable, and SCR-WEB-016 links back. | UC-015 main 1; SCR-WEB-014 |
| AC-14 | **Given** the export request fails (network or `500`), **then** SCR-WEB-016 renders an error state naming what failed with a retry that re-runs the request; nothing is downloaded; the session is untouched. | NFR-USE-003; NFR-REL-004; UC-015 |
| AC-15 | Every new or changed web surface conforms to design.md §5 as the standing defects fixed it: text on `--color-danger-subtle` uses `--color-danger-text` (≥ 4.5:1), every interactive element shows the 2px `--color-focus-ring` on `:focus-visible`, and any icon-only control is ≥ 44×44px at a touch viewport. | NFR-USE-004; DEF-006, DEF-009, DEF-011 |

## 7. Decisions

**D1 — `POST`, not `GET`, for a read-only operation.**
*Decision:* the endpoint is `POST /account/export`, as the plan specifies.
*Driver:* the plan's Blocks/Endpoints column for FEAT-017, and the response body
is the user's entire dataset — a `GET` URL is bookmarkable, prefetchable, and
lands in browser history and intermediary access logs, all of which are worse
places for a full-data URL to live. `POST` also keeps the door open for FEAT-018's
sibling `POST /account/delete` to read symmetrically.
*Rejected:* `GET /account/export`, which would be more RESTful for a pure read
and would let the browser's own download machinery handle `Content-Disposition`
directly (see §5.2). Not worth reopening a decision the plan already made.
*Consequence:* the operation is idempotent despite its verb; the client
re-serializes the body for download.

**D2 — the response body is the export document, with no `{ export: … }` envelope.**
*Decision:* deviate, deliberately and only here, from the wrapper convention
every other endpoint follows (`{ profile }`, `{ lists }`, `{ task }`).
*Driver:* FR-DATA-001 — this body *is* the artifact the user keeps. A wrapper
would either be written into the downloaded file, where it is meaningless noise
around the data, or be stripped by the client, which would mean the bytes the
user gets are not the bytes the API returned. `formatVersion` at the top level is
what makes the file self-describing to whatever reads it next.
*Rejected:* `{ export: AccountExportDocument }` for consistency's sake — a
consistency that would cost the feature its point.
*Consequence:* one endpoint in the product whose success body is unwrapped. Its
*error* bodies still use the standard `ApiError` envelope, so client error
handling is unchanged. Recorded here because contracts discipline treats an
unannounced second convention as a defect.

**D3 — tasks nest inside their list *and* carry `listId`.**
*Decision:* nesting is the document's structure; each task also repeats its
`listId`.
*Driver:* nesting is what a human opening the file expects and mirrors the domain
(`tasks.list_id` is `NOT NULL` with an FK, so orphans are impossible —
FR-LIST-009). The repeated `listId` keeps a task object self-describing when it
is lifted out of the tree by a script, which is what "machine-readable"
(FR-DATA-001) has to survive.
*Rejected:* flat `lists[]` + `tasks[]` sibling arrays — better for a hypothetical
importer, worse for the human reader, and there is no import feature to serve.
*Consequence:* one duplicated field per task, whose consistency AC-9 asserts.

**D4 — the export carries the *stored* display name, not the derived default.**
*Decision:* `account.displayName` is `users.display_name` verbatim — `null` when
the user never set one. `displayNameFor()` is **not** applied.
*Driver:* FEAT-008 D1 established that the default is derived at read time and
never stored, precisely so "did the user choose this?" stays answerable. An
export is the one artifact where that distinction is the whole point: writing the
email-derived fallback into the file would record a preference the user never
expressed.
*Consequence:* a consumer wanting the display label applies the same fallback
rule; the API's own UI already does.

**D5 — one filename rule, shared, resolved in the user's timezone.**
*Decision:* `accountExportFilename(exportedAt, timeZone)` in `@todo/shared`
returns `todo-export-<YYYY-MM-DD>.json`, the date computed in the user's
effective timezone (`users.timezone ?? "UTC"`). The API uses it for
`Content-Disposition`; the client uses it for the `download` attribute.
*Driver:* the constant-sharing convention (`PASSWORD_MIN_LENGTH`,
`LIST_NAME_MAX_LENGTH`, `displayNameFor`) exists so the two tiers cannot drift;
a filename the API claims and the browser contradicts is exactly that drift. The
user's zone rather than UTC because every other date this product shows a user is
in their zone (FR-PROF-003, NFR-LOC-001) — a Calcutta user exporting at 02:00
should not get yesterday's date on the file.
*Rejected:* a UTC date (simpler, but visibly wrong for half the planet for part
of every day — the same class of bug DEF-010 just fixed in the smart-view
fixtures); a filename invented independently on each tier.
*Consequence:* the service already holds the timezone from the account row, so
this costs no extra query.

**D6 — a successful export appends a `data_exported` audit event.**
*Decision:* add `dataExported: 'data_exported'` to `AUDIT_EVENTS` and record it
on success, with the user id and nothing else.
*Driver:* NFR-SEC-009 requires security-relevant events to be logged and names
account deletion explicitly; a full read-out of an account's data belongs in the
same category, and `AUDIT_EVENTS`' own comment says the set is extensible. It is
also the only durable trace that an export happened — the endpoint changes no
domain state.
*Rejected:* logging nothing (NFR-SEC-009's list is illustrative, not exhaustive,
and this is the single most sensitive read in the product); logging counts or
list names (the audit log must never become a second copy of the data it
protects — AC-11 asserts this).
*Consequence:* one extra insert per export, best-effort by `AuditService`'s
existing contract — an audit failure cannot fail the export.

**D7 — soft-deleted tasks are excluded.**
*Decision:* `WHERE deleted_at IS NULL`.
*Driver:* FR-DATA-002 enumerates "active and completed tasks", which is the
product's own two-state vocabulary; a soft-deleted task is in neither state — it
is in the trash, awaiting the 30-day purge (FR-TASK-013/015). Every other read
path in the product filters it out, and a user who wants a deleted task in their
export can restore it first (FEAT-013) — the undo window exists for exactly that.
Excluding it also reads with NFR-COMP-001's data-minimization rather than
against it.
*Rejected:* including them with a `deletedAt` field, on a "portability means
everything the system holds" reading. Defensible, but it would put data the user
has already discarded into a file they may hand to someone else, and it would
contradict FR-DATA-002's own wording.
*Consequence:* the export is a snapshot of what the user can *see*, which is the
promise SCR-WEB-016's copy should make. AC-4 pins it.

**D8 — the export is a single consistent snapshot (`REPEATABLE READ`).**
*Decision:* the three reads run in one transaction at `REPEATABLE READ`.
*Driver:* Postgres' default `READ COMMITTED` takes a **new** snapshot per
statement, so a task moved between lists between the `lists` read and the `tasks`
read could be exported under a list that no longer holds it, or a list created
mid-export could yield tasks whose parent is missing from `lists` — a file that
is internally contradictory. UC-015 step 2 describes compiling *the* user's data,
singular.
*Rejected:* one giant join (would fix consistency but costs the shape — see
§5.1); accepting the race as unlikely (it is unlikely, and it produces a corrupt
artifact when it happens, which is the worst trade in a data-export feature).
*Consequence:* one `SET TRANSACTION` statement; no lock contention, since a
`REPEATABLE READ` reader blocks no writer in Postgres' MVCC.

**D9 — synchronous single response; no background job.**
*Decision:* the export is compiled and returned in the request. UC-015's
alternate 2a ("may process in the background") is **not** taken.
*Driver:* two reasons, one about scale and one about scope. (a) At the
NFR-SCAL-002 ceiling — 100 lists, 5,000 tasks — the document is a few MB from two
index-served queries; that is a sub-second response, not a job. (b) A background
export would need somewhere to *put* the prepared file and something to track it
— an `ExportJob` entity and object storage, neither of which the architecture's
conceptual model (§8: `users`, `sessions`, `lists`, `tasks`, `email_outbox`,
`audit_log`) contains. That is an architecture amendment, and UC-015 says "may",
not "shall".
*Rejected:* the outbox/worker pattern (ADR-007) reused for exports — correct
shape for a genuinely long job, disproportionate for this one.
*Consequence:* AC-10 measures the ceiling with a 2 s budget. **If a future scale
target breaks that budget, 2a is the designed escape hatch** and it re-enters
through an architecture amendment, not a local invention. SCR-WEB-016's
`preparing` state is still real and still needed — it covers the round trip.

**D10 — no rate limiting on the endpoint.**
*Decision:* the export route carries no `RateLimitGuard`.
*Driver:* FR-AUTH-018 and NFR-SEC-006 scope throttling to *authentication*
endpoints, and `ProfileController` records the same reasoning for the same
reason. The existing guard is per-IP with auth-tuned thresholds
(`AUTH_RATELIMIT_MAX`), which would be the wrong axis (a user's own repeated
exports) and the wrong numbers.
*Consequence:* the heaviest authenticated read in the product is unthrottled.
Noted as a watch item in §8 rather than pre-solved: no requirement asks for it,
and inventing a second throttling mechanism with no requirement behind it is how
convention drift starts.

## 8. Escalations & open items

**Architecture amendments filed:** none. No new entity, no boundary change, no
schema change (§4). D9 records the one path that *would* have required one, and
why it is not taken.

**Plan corrections suggested:** none. The plan's FEAT-017 row (FRs, UC, screens,
endpoint, data) matched the design as built; the folder slug is
`FEAT-017-export-data`.

**Carried defects that bind implementation** (not this feature's to fix):

- **DEF-002 (open)** — the api suite is ~8% flaky in parallel. Run it serially:
  `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
  serially before it is attributed to this feature.
- **DEF-006 / DEF-009 / DEF-011 (closed)** — the danger-tint pairing, the
  `:focus-visible` ring and the 44px touch target are now guarded by
  `inline-alert-contrast.spec.ts`, `focus-ring.spec.ts` and `touch-target.spec.ts`.
  New UI must be born conforming; AC-15 is where that is checked. Do **not** copy
  alert markup out of older screens without checking which token it carries.

**Watch items** (recorded, not actioned):

1. **The export endpoint is unthrottled** (D10). If abuse or cost ever motivates
   throttling, it needs a per-user axis, which the current per-IP guard does not
   have — that is a new mechanism and should arrive with a requirement behind it.
2. **`formatVersion` is a promise this design is making on behalf of later
   features.** It exists so a consumer can tell an old file from a new one; the
   obligation it creates is that any future change to the document's shape bumps
   it. FEAT-018 is the first feature in a position to forget.
3. **No import.** FR-DATA has no counterpart requirement, so nothing in this
   design claims the file can be re-ingested. Worth saying out loud because
   "export" invites the assumption.
