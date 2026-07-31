# Technical Design: FEAT-015 — Keyword search + status/due filters + pagination

> Feature from: docs/implementation-plan.md · Epic: EPIC-F — Search, Filter & Smart Views (`search` module)
> Implements: FR-SRCH-001, FR-SRCH-002, FR-SRCH-003, FR-SRCH-004, FR-SRCH-005,
> FR-SRCH-006, FR-SRCH-009 · binds NFR-PERF-003, NFR-USE-003 (partial), NFR-SCAL-002 ·
> also FR-AUTHZ-001/002/003 · **consumes** FEAT-008's stored timezone (FR-PROF-003)
> Realizes: UC-013 (main 1–3 + alt 2a) · Screens: SCR-WEB-012 — designed by ui-design
> Status: Draft · Date: 2026-07-31

## 1. Intent

Every read the product offers today is *positional*: open a list, see its tasks.
This slice adds the first **content-addressed** read — find a task by what it
says and narrow by what state it is in — across all of a user's lists at once.
It mints the `search` module the architecture reserved (§5,
`src/modules/README.md`), and it is the first endpoint whose result set can
exceed a screen, so it also establishes the product's **pagination convention**
(FR-SRCH-009) that FEAT-016's smart views will inherit.

It is second in Phase 3 because FR-SRCH-004's date buckets are defined *in the
user's timezone* — a sentence that had no implementation until FEAT-008 stored
one. That ordering was deliberate and this feature is where it pays.

## 2. Codebase context

Surveyed live (last migration `010_1721570000000_profile-preferences.js`; API
modules = `auth`, `profile`, `lists`, `tasks` — `search` is an unbuilt stub in
`src/modules/README.md`, which names this feature as its builder). The design
conforms to and reuses:

- **The `tasks` table as it now stands** — `id, owner_id, list_id, title,
  completed_at, deleted_at, created_at, updated_at, due_at, priority`, with
  `tasks_owner_list_idx (owner_id, list_id)` and the partial
  `tasks_active_by_list_idx`. §4 adds **nothing**; D3 explains why, with
  measurements.
- **`TaskSummary` and its `isOverdue` derivation** (`@todo/shared`;
  `tasks.service.ts`). Overdue has **one** definition in this system — active,
  has a due date, that instant has passed (FEAT-011 D3) — and this feature adds
  no second opinion (D5), which is what keeps `status=overdue` and the
  `due=overdue` bucket from drifting apart.
- **The module shape** `lists` established and `tasks`/`profile` inherited:
  `<area>.module.ts` / `.controller.ts` / `.service.ts` / `.repository.ts` /
  `.errors.ts` / `dto/*.dto.ts`; framework-free domain errors mapped by a
  `toHttp` helper; every statement owner-scoped in the repository.
- **Contract/error conventions.** `ApiError`
  (`statusCode/code/message/fields[]`) via the global `HttpExceptionFilter`;
  `validation_failed` + `fields[]`; shared path/error-code constants in
  `@todo/shared`; class-validator DTOs behind the global `ValidationPipe`
  (`whitelist: true, transform: true`). Data endpoints are not rate-limited.
- **`ChangeSignalInterceptor` is NOT used here** — it publishes on writes, and
  this feature has none. A read-only controller carries no interceptor.
- **FEAT-008's `users.timezone`** — nullable, stored verbatim, effective value
  `COALESCE(timezone, 'UTC')` (FEAT-008 D2). This feature is its first
  *server-side* consumer, which is what D2 anticipated and what forces D1 below.
- **Web tier.** The BFF proxy pattern (`app/api/**/route.ts`), `lib/lists.ts` /
  `lib/profile.ts` server-fetch helpers, `components/shell-frame.tsx` (the
  client frame that will host the overlay trigger), `components/task-meta.tsx`
  (`DueChip`/`PriorityDot`, already zone-aware via `useTimeZone()` — search
  results reuse them rather than minting a second task-row treatment).
  `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web
  code.
- **Divergence found:** one, recorded rather than worked around. Architecture §8
  lists *"a title index for search"* among the indexes that keep search under
  500 ms. **Measured at the requirement's own ceiling, no such index is needed**
  — see D3. The architecture's sentence describes an anticipated need, not an
  observed one; this design records the measurement and the threshold at which
  the sentence becomes true again. No amendment is filed: an index is physical,
  and the conceptual model is untouched.

## 3. API contracts

One endpoint, read-only, authenticated by the existing `SessionGuard`, scoped
to the session user. No id of any kind is accepted — the corpus searched is
always the caller's own (FR-AUTHZ-002).

```
GET /search?q=&status=&due=&cursor=&limit=   → 200 SearchResponse
```

### 3.1 `GET /search` — keyword + filters, paginated (FR-SRCH-001..006, 009; UC-013)

- **Query parameters** — all optional individually, but **at least one of
  `q` / `status` / `due` is required** (D6):

  | Param | Type | Meaning | Validation |
  | :-- | :-- | :-- | :-- |
  | `q` | `string` | Case-insensitive **substring** match against `title`, across every list the caller owns (FR-SRCH-001) | trimmed; non-empty after trim; `≤ SEARCH_QUERY_MAX_LENGTH` (200) |
  | `status` | `active \| completed \| overdue` | FR-SRCH-003 | one of the three |
  | `due` | `today \| upcoming \| overdue \| none` | FR-SRCH-004, bucketed **in the caller's timezone** (D1) | one of the four |
  | `cursor` | `string` | Opaque keyset cursor from a previous page's `nextCursor` (D4) | decodes to a valid `(createdAt, id)` pair |
  | `limit` | `number` | Page size (FR-SRCH-009) | integer `1..SEARCH_PAGE_SIZE_MAX` (50); default `SEARCH_PAGE_SIZE` (25) |

  Filters are **conjunctive** — a task must satisfy every supplied criterion
  (FR-SRCH-005). Soft-deleted tasks are excluded unconditionally and are not
  reachable by any parameter combination (FR-TASK-013; FR-SRCH-002's note).

- **Success `200`** `SearchResponse`:

  ```ts
  interface SearchResult extends TaskSummary { listName: string }
  interface SearchResponse {
    results: SearchResult[];
    /** The cursor for the next page, or null when this page is the last. */
    nextCursor: string | null;
  }
  ```

  Each result carries the full `TaskSummary` (so `completedAt`, `dueAt`,
  `priority` and the server-derived `isOverdue` all travel — FR-SRCH-002's
  "status") plus `listName` (FR-SRCH-002's "the list it belongs to"). Ordered
  **newest first** by `(created_at DESC, id DESC)` (D2). An empty `results`
  array with `nextCursor: null` is the "no matches" answer FR-SRCH-006's empty
  state renders — a `200`, never a `404` (D7).

- **Errors:**

  | Status | code | When | Trace |
  | :-- | :-- | :-- | :-- |
  | `401` | `unauthenticated` | No/expired/revoked session | FR-AUTHZ-001 |
  | `400` | `validation_failed` (field `q`) | Empty after trim, or over 200 chars | FR-SRCH-001 |
  | `400` | `validation_failed` (field `status`) | Not one of the three | FR-SRCH-003 |
  | `400` | `validation_failed` (field `due`) | Not one of the four | FR-SRCH-004 |
  | `400` | `validation_failed` (field `limit`) | Not an integer in `1..50` | FR-SRCH-009 |
  | `400` | `validation_failed` (field `cursor`) | Not a cursor this API issued | D4 |
  | `400` | `validation_failed` (field `_`) | **No criteria** — none of `q`/`status`/`due` supplied | D6 |

- Read-only, idempotent, **two statements** (the caller's effective timezone,
  then the search itself — D1). Cacheable by nobody: results depend on `now()`.

## 4. Schema changes

**None. No migration, and no index.**

This is a deliberate, measured decision, not an omission — see D3 for the
numbers and the threshold that would reverse it. If you find yourself writing a
migration for this feature, stop and read D3 first.

## 5. Component design

### 5.1 API — `src/modules/search/` and one cross-cutting addition

| File | Responsibility |
| :-- | :-- |
| `search.module.ts` | Wires controller + service + repository; imports `PreferencesModule`; registered in `app.module.ts` |
| `search.controller.ts` | `@Controller('search')`, class-level `@UseGuards(SessionGuard)`; one `@Get()`; `toHttp` maps domain errors. **No `ChangeSignalInterceptor`** — nothing is written |
| `search.service.ts` | Criteria validation, the cursor codec (D4), the no-criteria rule (D6); resolves the caller's zone through `UserTimeZoneService`, then calls the repository |
| `search.repository.ts` | One owner-scoped statement building its `WHERE` from the supplied criteria, joined to `lists` for `listName`, keyset-paginated, `LIMIT n+1` to detect a next page |
| `search.errors.ts` | `SearchCriteriaInvalidError` (carries `field` + `requirement`), `NoSearchCriteriaError` — framework-free, the established shape |
| `dto/search-query.dto.ts` | `@IsOptional()` + `@IsIn`/`@IsString`/`@IsInt` per parameter, with `@Type(() => Number)` for `limit` (query strings arrive as text) |
| **`src/common/preferences/`** | **New cross-cutting provider** (D1): `UserTimeZoneService.effectiveFor(userId)` → the stored zone or `'UTC'`, plus its module |

**The one statement**, shaped by criteria (illustrative, not literal — the
builder assembles only the clauses supplied):

```sql
SELECT t.id, t.list_id, t.title, t.completed_at, t.created_at,
       t.due_at, t.priority, l.name AS list_name
  FROM tasks t
  JOIN lists l ON l.id = t.list_id
 WHERE t.owner_id = $1
   AND t.deleted_at IS NULL                      -- always (FR-TASK-013)
   AND t.title ILIKE '%' || $2 || '%'            -- when q supplied (FR-SRCH-001)
   AND t.completed_at IS NULL                    -- status=active
   AND (t.due_at AT TIME ZONE $tz)::date
       = (now() AT TIME ZONE $tz)::date          -- due=today (FR-SRCH-004)
   AND (t.created_at, t.id) < ($cursorAt, $cursorId)  -- when paging (D4)
 ORDER BY t.created_at DESC, t.id DESC
 LIMIT $limit + 1;
```

`ILIKE` with the term interpolated as a **bound parameter** and the wildcards
added in SQL — never string-concatenated into the statement text — so a term
containing `%` or `_` is matched literally… which it is **not** by default:
those are `LIKE` metacharacters. D8 covers the escaping.

### 5.2 Bucket semantics (FR-SRCH-004), in the caller's zone

| `due` | Predicate |
| :-- | :-- |
| `today` | `due_at IS NOT NULL AND (due_at AT TIME ZONE tz)::date = (now() AT TIME ZONE tz)::date` |
| `upcoming` | `due_at IS NOT NULL AND (due_at AT TIME ZONE tz)::date > (now() AT TIME ZONE tz)::date` |
| `overdue` | `completed_at IS NULL AND due_at IS NOT NULL AND due_at < now()` — **the instant comparison, not a date bucket** (D5) |
| `none` | `due_at IS NULL` |

`today` and `upcoming` are **calendar-day** questions and therefore zone-dependent
(verified against Postgres: `18:45Z` is 2026-07-31 in `Asia/Calcutta` and
2026-07-30 in `America/New_York`). `overdue` is an **instant** question and is
therefore zone-invariant — the same rule FEAT-011 D1 and FEAT-008 D4 established.
Both facts live in one table so a reader cannot conclude the inconsistency is an
oversight.

### 5.3 Web

| File | Responsibility |
| :-- | :-- |
| `app/api/search/route.ts` | BFF proxy: `GET` with the query string forwarded, cookie forwarded, status + JSON relayed verbatim |
| `lib/search.ts` | Client-side `searchTasks(params)` returning the parsed `SearchResponse` or a typed failure — the overlay is interactive, so this is a client helper, not a server fetch |
| `components/search-overlay.tsx` | SCR-WEB-012's island: the `command-search` field, the filter controls, results, and its four states. Screens are ui-design's manifest; this task is the contract wiring |
| `components/shell-frame.tsx` | Gains the overlay's trigger and its keyboard shortcut |

Result rows reuse `DueChip` and `PriorityDot` from `task-meta.tsx`, which already
read the account zone via `useTimeZone()` — so a due date reads identically in
search and in the list view without a second implementation.

### 5.4 Skeleton stubs replaced

`src/modules/README.md`'s `search` row (FR-SRCH-*, "FEAT-015, FEAT-016") becomes
half-built: this feature delivers the module and its first endpoint; FEAT-016
adds the smart-view routes beside it.

## 6. Acceptance criteria

- **AC-1 (FR-SRCH-001; UC-013 main 1–2).** `GET /search?q=report` returns the
  caller's tasks whose title contains `report` **case-insensitively**
  (`Report`, `REPORT`, `quarterly report` all match) and as a **substring**
  (`por` matches `report`), drawn from **every list the caller owns** — verified
  with matching tasks seeded in two different lists, both present in one
  response.
- **AC-2 (FR-SRCH-002).** Every result carries `listName` equal to the name of
  the list it belongs to, plus its status fields (`completedAt`, `isOverdue`).
  A **soft-deleted** task whose title matches is absent from every response, for
  every combination of parameters.
- **AC-3 (FR-SRCH-003).** `status=active` returns exactly the tasks with
  `completedAt: null`; `status=completed` exactly those with a non-null
  `completedAt`; `status=overdue` exactly those that are active **and** past
  due. Each asserted against a fixture containing all three kinds.
- **AC-4 (FR-SRCH-004, FR-PROF-003).** With the account's timezone set to
  `America/New_York`, a task due `2026-07-30T18:45:00Z` is returned by
  `due=today` on that date and **not** by `due=upcoming`; with the same account
  switched to `Asia/Calcutta` — where that instant is 00:15 on the 31st — the
  same task is returned by `due=upcoming` and **not** by `due=today`. The
  fixture and the stored zone are the only things that change. `due=none`
  returns exactly the tasks with no due date.
- **AC-5 (FR-SRCH-005).** `q=report&status=active&due=today` returns exactly the
  tasks satisfying **all three**; removing any one criterion returns a superset;
  a contradictory pair (`status=completed&due=overdue`, which cannot both hold
  because overdue requires active) returns an empty result rather than an error.
- **AC-6 (FR-SRCH-006; UC-013 alt 2a).** A query matching nothing returns
  `200 { results: [], nextCursor: null }`, and SCR-WEB-012 renders its empty
  state — distinct from its idle state, which is what the screen shows before
  any criterion is entered.
- **AC-7 (FR-SRCH-009).** With 60 matching tasks and `limit=25`: the first page
  returns 25 results and a non-null `nextCursor`; following the cursor twice
  more yields 25 then 10, with `nextCursor: null` on the last; the 60 ids across
  the three pages are **distinct and complete** (no duplicates, no gaps). A
  `limit` over the maximum is a `400`, not a silently clamped page.
- **AC-8 (FR-AUTHZ-001/002/003).** Without a session both the endpoint and the
  BFF return `401 unauthenticated`. Another user's task whose title matches the
  query never appears in any response, under any parameter combination.
- **AC-9 (validation).** `q` empty-after-trim or over 200 chars, `status`/`due`
  outside their sets, `limit` non-integer or out of range, and a `cursor` this
  API did not issue each return `400 validation_failed` naming that field; a
  request with **none** of `q`/`status`/`due` returns `400` on field `_`.
- **AC-10 (NFR-PERF-003, NFR-SCAL-002).** Against a user holding **5,000 tasks**,
  the p95 of `GET /search` stays under **500 ms** for: a keyword matching few
  rows, a keyword matching most rows, a filter-only query, and a deep cursor
  page. Measured against the local stack and recorded with its environment
  caveat.
- **AC-11 (NFR-USE-003).** SCR-WEB-012 presents **idle, loading, results and
  empty** distinctly (the inventory's four states), plus an error state when the
  request fails, and every control is keyboard-operable.
- **AC-12 (FR-SRCH-003/004 consistency; FEAT-011 D3 preserved).**
  `status=overdue` and `due=overdue` return **identical** result sets, and every
  task in them has `isOverdue: true` in its own payload — one definition of
  overdue, asserted across all three surfaces that express it.
- **AC-13 (D4, keyset stability).** A task created **between** two page requests
  does not cause a task already returned on page 1 to reappear on page 2, and
  does not push an unseen task past the boundary unread. (The property offset
  pagination cannot provide, which is why the cursor exists.)
- **AC-14 (D8, term escaping).** A query of `%` returns only tasks whose title
  literally contains a percent sign — not every task; `_` likewise matches a
  literal underscore, not any single character.

## 7. Decisions

- **D1 — The caller's timezone is read through a new `common/preferences`
  provider, and this is the cross-module read interface FEAT-010 D8 asked the
  third case to mint.** Driver: FR-SRCH-004's buckets are defined in the user's
  zone, which FEAT-008 stores on `users`. `modules/search` may not import
  `modules/profile` (dependency-cruiser), and FEAT-010 D8 recorded that the
  *third* cross-module read should stop copying SQL and mint an interface —
  this is that third case, and it is a different shape from the first two (a
  **preference**, not an ownership check), which makes the case stronger rather
  than weaker. `common/` is the right home because the effective timezone is a
  cross-cutting *concern* applied to queries, exactly like `common/authz`'s
  session — not an entity operation, which is what D8 correctly refused to put
  there. FEAT-016 is its second consumer, immediately. Rejected: a scalar
  subquery inlining `COALESCE(timezone,'UTC')` into every search statement (one
  fewer round trip, but the fallback rule would then live in each module that
  ever needs it — precisely the copying D8 wanted stopped); accepting the zone
  as a **query parameter** from the client (the server would take a stored
  preference on the client's word, and two devices could bucket the same account
  differently); widening `SessionUser` (FEAT-008 D7 rejected it, and this
  feature has no new argument). Consequence: two statements per search, measured
  at ~1 ms for the first.
- **D2 — Results are ordered newest-first, not by relevance.** Driver: a
  substring match has **no rank** — `ILIKE` yields a boolean, so any "relevance"
  would be invented (title position, length ratio) and would need explaining to
  a user who cannot see it. Newest-first is predictable, matches how the product
  already talks about tasks, and gives the keyset cursor a stable, indexed key.
  Rejected: `ts_rank` full-text ranking (FR-SRCH-001 specifies *substring*
  matching, which tsvector does not do — it matches lexemes; adopting it would
  change the requirement, not implement it); ordering by due date (meaningless
  for the many tasks with no due date). Consequence: the list view's
  oldest-first order and search's newest-first order deliberately differ, which
  §5's ORDER BY comment records so it is not "fixed" later.
- **D3 — No index, measured.** Driver: architecture §8 anticipates "a title
  index for search", and NFR-PERF-003 bounds keyword search at **500 ms for a
  user with up to 5,000 tasks**. Measured on this stack at exactly that ceiling
  (5,000 tasks for the probe user inside a 25,440-row table, `EXPLAIN ANALYZE`):

  | Query shape | Execution time |
  | :-- | --: |
  | Keyword matching few rows (`%report%`) | **2.6 ms** |
  | Keyword matching most rows (`%a%`) | **6.2 ms** |
  | Filter only, no keyword (overdue bucket) | **1.5 ms** |
  | Deep keyset page (4,000 rows in) | **8.4 ms** |

  The existing `tasks_owner_list_idx (owner_id, list_id)` already narrows to one
  user's rows; an `ILIKE` scan over ≤ 5,000 short titles is two orders of
  magnitude inside the budget. Rejected: a `pg_trgm` GIN index (the only index
  type that helps a leading-wildcard `ILIKE` — it would add an extension, write
  amplification on every task insert and update, and maintenance, to buy nothing
  measurable at the scale the requirement names); a `tsvector` index (wrong
  matching semantics, see D2). **The threshold**: this holds because the corpus
  per user is bounded by NFR-SCAL-002 at 5,000. If that ceiling rises materially
  — or if search moves to matching descriptions/notes, which are longer text —
  re-measure and expect `pg_trgm` to become correct. Recorded here so the
  reversal is a measurement, not a rediscovery.
- **D4 — Keyset pagination with an opaque cursor, not offset.** Driver:
  FR-SRCH-009's page size plus a result set that changes under the user's own
  edits. `OFFSET` re-reads from the top, so a task created between two page
  requests shifts every subsequent page by one — the user silently re-reads one
  task and never sees another. The cursor carries the last row's
  `(created_at, id)` — the exact `ORDER BY` tuple, `id` breaking ties so the
  order is total — base64url-encoded so it is **opaque**: clients pass it back
  and never construct it. A cursor that does not decode is a `400` on `cursor`,
  not a silent first page. Rejected: `OFFSET`/`LIMIT` (the correctness problem
  above, which AC-13 pins); a page-number API (same problem, worse ergonomics);
  exposing the tuple unencoded (an interface we would then have to keep).
- **D5 — Overdue keeps exactly one definition, and the `due=overdue` bucket is
  an instant comparison rather than a calendar-day one.** Driver: FR-SRCH-003
  lists overdue as a **status** and FR-SRCH-004 lists it as a **due bucket** —
  two doors to one concept. FEAT-011 D3 established the single derivation
  (active AND `due_at < now()`), FEAT-008 D4 confirmed it is zone-invariant, and
  reimplementing it as "due date is before today in the user's zone" would make
  a task due at 09:00 today, at 10:00, overdue in one surface and not in
  another. Both parameters therefore compile to the same predicate. Consequence:
  `status=overdue` and `due=overdue` are redundant *by design* and AC-12 asserts
  they agree — with each other and with `TaskSummary.isOverdue`.
- **D6 — A search with no criteria is a `400`, not "everything".** Driver: the
  empty query is not a question, and answering it with the user's entire task
  list would (a) duplicate FEAT-016's `All` smart view before it exists, (b)
  make the most expensive possible query the easiest one to trigger, and (c)
  make SCR-WEB-012's **idle** state — the screen before anything is typed —
  indistinguishable from a real result set. The client simply does not send the
  request until there is a criterion. Rejected: returning all tasks paginated
  (above); returning an empty array (it would report "no matches" for a question
  never asked, which is the empty state lying).
- **D7 — No matches is `200` with an empty array, never `404`.** Driver: the
  query is the resource and it exists; zero rows is a successful answer to a
  well-formed question (FR-SRCH-006 asks for an empty *state*, which is a UI
  concept, not an error). Consistent with `GET /lists` returning `[]` for a user
  with no lists. Rejected: `404` (a client would have to distinguish "no such
  endpoint" from "no such results").
- **D8 — The search term is escaped for `LIKE` metacharacters.** Driver: `%` and
  `_` are wildcards to `ILIKE`, so a user searching for `%` would otherwise
  match **every** task and one searching `report_v2` would match `report-v2`.
  The term is bound as a parameter (never concatenated — that is an injection
  question and is already answered by parameterization), and its `%`, `_` and
  `\` are escaped before binding so the match is literal, which is what a person
  typing into a search box means. AC-14 pins it. Consequence: the escape happens
  in the service, once, beside the trim — not in SQL, where it would be invisible
  to the unit tests that own this rule.

## 8. Escalations & open items

- **No architecture amendment.** No new entity, no ownership change, no boundary
  crossed: the feature reads `tasks`, `lists` and (through the new
  `common/preferences` provider) one column of `users`. The `search` module is
  in the architecture's own building-block view.
- **No schema change and no index** — measured, see D3. Recorded as a
  **divergence from architecture §8's anticipated title index**, with the
  threshold that would make that sentence true again. Flagged rather than
  silently skipped.
- **`common/preferences` is new cross-cutting code**, minted under FEAT-010 D8's
  own rule (D1). It is deliberately minimal — one read, no writes, no cache — so
  that if a future feature needs more, extending it is a decision someone makes
  rather than one this feature pre-made.
- **FEAT-016 inherits three things from here**: the pagination convention (D4),
  the `common/preferences` provider (D1), and the single overdue definition
  (D5). Its smart views are the same query with fixed criteria, which is why the
  repository takes criteria as data rather than exposing four methods.
- **DEF-002 is open.** The api suite must be run **serially**
  (`npm test -w @todo/api -- --runInBand`); a red parallel run is re-checked
  serially before it is attributed to this feature.
- **DEF-006 and DEF-009 are open** and touch any new screen: SCR-WEB-012's error
  state must use `--color-danger-text` on the danger tint (never
  `--color-danger` — the 3.95:1 pairing), and the missing product-wide focus
  ring (DEF-009) is **not** this feature's to fix, though its controls will
  inherit the browser default like every other screen.
- **Not in this feature:** searching anything but the title (no FR asks for it —
  tasks have no description field); saved searches; sort options (D2 fixes one
  order); the smart views themselves (FEAT-016); highlighting the matched
  substring in results (a presentation choice ui-design may make from the data
  already returned, needing no contract change).
