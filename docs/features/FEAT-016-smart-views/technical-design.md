# Technical Design: FEAT-016 — Smart views (Today / Upcoming / Overdue / All)

> Feature from: docs/implementation-plan.md · Epic: EPIC-F — Search, Filter & Smart Views (`search` module)
> Implements: FR-SRCH-007, FR-SRCH-008, FR-SRCH-006 (partial) · also realizes
> FR-SRCH-009 for task views · binds NFR-PERF-001, NFR-SCAL-002, NFR-USE-003
> (partial) · also FR-AUTHZ-001/002/003 · **consumes** FEAT-008's stored timezone
> (FR-PROF-003) and FEAT-015's search repository, cursor and overdue definition
> Realizes: UC-014 (main 1–3 + alt 2a) · Screens: SCR-WEB-009 — designed by ui-design
> Status: Draft · Date: 2026-07-31

## 1. Intent

Every read the product offers today is anchored to a *place*: open a list, see
its tasks; type a keyword, see matches. This slice adds the first **time-anchored**
read — "what is due today", "what is coming", "what did I miss" — aggregated
across every list the user owns. It is the last Must/Should slice of Phase 3 and
it completes the `search` module the architecture reserved.

It is cheap to build because FEAT-015 paid for it deliberately: the repository
there takes criteria **as data** rather than exposing four methods, precisely so
the smart views would be the same statement with fixed criteria (FEAT-015 §8).
This design spends its effort on the two things that are genuinely new — the
**ordering** a due-date view needs (and the keyset cursor that follows from it),
and the **index** the architecture has been holding for this feature since
FEAT-011 deferred it.

## 2. Codebase context

Surveyed live (last migration `1721570000000_profile-preferences.js`; API modules
= `auth`, `profile`, `lists`, `tasks`, `search`). The design conforms to and
reuses:

- **`modules/search` as FEAT-015 left it** — `search.criteria.ts` (validation,
  the LIKE escape, the opaque cursor codec), `search.repository.ts` (one
  owner-scoped statement assembled from the criteria supplied, joined to `lists`
  for `listName`, `LIMIT n+1` to detect a next page), `search.service.ts` (zone
  resolution + row→wire mapping), `search.controller.ts`. `src/modules/README.md`
  names FEAT-016 as this module's second and final builder. Smart views land
  **here**, not in a new module: they are the same query (D1).
- **The `tasks` table as it now stands** — `id, owner_id, list_id, title,
  completed_at, deleted_at, created_at, updated_at, due_at, priority`, with
  `tasks_owner_list_idx (owner_id, list_id)` and the partial
  `tasks_active_by_list_idx (list_id) WHERE completed_at IS NULL AND deleted_at
  IS NULL`. §4 adds the architecture's `(owner_id, due_at)` index — the one
  FEAT-011 D7 explicitly deferred to "FEAT-015/016" and FEAT-015 D3 correctly
  declined for keyword search. D3 below is the measurement that spends it here.
- **`common/preferences/UserTimeZoneService.effectiveFor(userId)`** (FEAT-015 D1)
  — `COALESCE(timezone,'UTC')`. This feature is its second consumer, exactly as
  D1 predicted. Today and Upcoming are calendar-day questions and need it.
- **The single overdue derivation** — `isTaskOverdue` in `@todo/shared` and the
  `OVERDUE` SQL constant in `search.repository.ts` (FEAT-011 D3, FEAT-015 D5).
  The Overdue view adds **no** third opinion; it reuses the predicate, which is
  what makes AC-4's cross-surface agreement hold by construction.
- **The pagination convention** — keyset over the `ORDER BY` tuple, base64url
  opaque cursor, `limit` out of range is a `400` and never a silent clamp,
  `SEARCH_PAGE_SIZE` 25 / `SEARCH_PAGE_SIZE_MAX` 50 (FEAT-015 D4). Views inherit
  it, constants included (D2's note).
- **Contract/error conventions.** `ApiError` (`statusCode/code/message/fields[]`)
  via the global `HttpExceptionFilter`; `validation_failed` + `fields[]`; a
  domain-specific `*_not_found` code for a resource that is not there
  (`list_not_found`, `task_not_found`); shared path constants and DTOs behind the
  global `ValidationPipe` (`whitelist: true, transform: true`). Data endpoints
  are not rate-limited. Read-only controllers carry **no** `ChangeSignalInterceptor`.
- **Web tier.** Server-component screens that fetch through a cookie-forwarding
  helper (`lib/tasks.ts`, `lib/lists.ts`) and render with the first paint;
  `app/api/**/route.ts` BFF proxies for anything the browser calls later;
  `components/task-meta.tsx` (`DueChip`, `PriorityDot`, zone-aware via
  `useTimeZone()`), `components/task-checkbox.tsx`, `components/list-view.tsx`'s
  row treatment, `components/list-view-failure.tsx`'s error state,
  `components/shell-frame.tsx` — whose smart-view nav is **three placeholder
  `<span>`s** carrying the comment "placeholders until FEAT-016 makes them real".
  `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.
- **Divergence found:** none. FEAT-015 recorded one (architecture §8's
  anticipated *title* index, declined with measurements); this feature's index
  question resolves the *other* half of that §8 sentence in the architecture's
  favour, and D3 carries the numbers.

## 3. API contracts

One endpoint, read-only, authenticated by the existing `SessionGuard`, scoped to
the session user. No id of any kind is accepted — the corpus is always the
caller's own (FR-AUTHZ-002).

```
GET /views/{view}?cursor=&limit=   → 200 SmartViewResponse
```

### 3.1 `GET /views/{view}` — one aggregated view, paginated (FR-SRCH-007/008/006/009; UC-014)

- **Path parameter**

  | Param | Type | Meaning |
  | :-- | :-- | :-- |
  | `view` | `today \| upcoming \| overdue \| all` | Which membership rule to apply (FR-SRCH-008). A value outside the set is `404 view_not_found` (D6) |

- **Query parameters** — both optional:

  | Param | Type | Meaning | Validation |
  | :-- | :-- | :-- | :-- |
  | `cursor` | `string` | Opaque keyset cursor from a previous page's `nextCursor` | decodes to a valid `(sortKey, id)` pair |
  | `limit` | `number` | Page size (FR-SRCH-009) | integer `1..SEARCH_PAGE_SIZE_MAX` (50); default `SEARCH_PAGE_SIZE` (25) |

  There is no `q`, no `status` and no `due`: a smart view **is** a fixed set of
  criteria (D1). Combining a view with a keyword is search's job, and FEAT-015
  already answers it.

- **Membership** (FR-SRCH-008), all four excluding completed and soft-deleted
  tasks unconditionally:

  | `view` | Members |
  | :-- | :-- |
  | `today` | active tasks whose due date falls on the **current day in the caller's timezone** |
  | `upcoming` | active tasks whose due date falls **after** the current day in the caller's timezone |
  | `overdue` | active tasks whose `dueAt` **instant has passed** (the one definition — FEAT-011 D3) |
  | `all` | all active tasks, due date or not |

  `today` and `overdue` **overlap by definition** — a task due at 09:00 today,
  read at 14:00, is a member of both (D5).

- **Success `200`** `SmartViewResponse`:

  ```ts
  interface SmartViewResponse {
    view: SmartView;
    results: SearchResult[];   // FEAT-015's shape: TaskSummary + listName
    /** The cursor for the next page, or null when this page is the last. */
    nextCursor: string | null;
  }
  ```

  Each result carries the full `TaskSummary` — `completedAt`, `dueAt`,
  `priority`, the server-derived `isOverdue` — plus `listName`, which is UC-014
  step 3's "with their originating list". Ordering is **by due date ascending**
  for `today`/`upcoming`/`overdue` and **newest-created first** for `all` (D2).
  An empty `results` with `nextCursor: null` is the "nothing here" answer
  SCR-WEB-009's empty state renders — a `200`, never a `404` (FEAT-015 D7).

  `view` is echoed so a client that fired two view requests cannot render the
  slower one's answer under the other one's heading.

- **Errors:**

  | Status | code | When | Trace |
  | :-- | :-- | :-- | :-- |
  | `401` | `unauthenticated` | No/expired/revoked session | FR-AUTHZ-001 |
  | `404` | `view_not_found` | `view` outside the four (D6) | FR-SRCH-007 |
  | `400` | `validation_failed` (field `limit`) | Not an integer in `1..50` | FR-SRCH-009 |
  | `400` | `validation_failed` (field `cursor`) | Not a cursor this API issued | FEAT-015 D4 |

- Read-only, idempotent, **two statements** (the caller's effective timezone,
  then the view). Not cacheable: every answer depends on `now()`.

## 4. Schema changes

One migration — `migrations/1721580000000_smart-view-index.js` — adding **one
index** and no columns, tables or constraints. It is the architecture's own
`(owner_id, due_at)` index (arch §8 Performance), deferred by FEAT-011 D7 to
"FEAT-015/016" and spent here, in its partial form:

```js
pgm.createIndex("tasks", ["owner_id", "due_at"], {
  name: "tasks_owner_due_idx",
  where: "completed_at IS NULL AND deleted_at IS NULL",
});
```

- **Entity:** `Task` — an index on columns the conceptual model already owns. No
  new entity, no ownership change, no boundary crossed. No escalation.
- **Partial, matching `tasks_active_by_list_idx`'s existing convention in this
  schema**: every smart view is active-only by FR-SRCH-008, so the predicate is
  implied by every query the index exists to serve, and completed or deleted rows
  buy nothing by sitting in it. Measured at 2,264 kB partial vs 2,816 kB plain on
  the probe fixture, with identical timings (D3).
- **Down:** drops the index. Nothing depends on it for correctness — only for
  the plan shape, which is exactly why dropping it is safe.

## 5. Component design

### 5.1 API — inside `src/modules/search/`

| File | Responsibility |
| :-- | :-- |
| `views.controller.ts` | **New.** `@Controller('views')`, class-level `@UseGuards(SessionGuard)`; one `@Get(':view')`; validates the view name (404) and maps domain errors through `toHttp`. No `ChangeSignalInterceptor` — nothing is written |
| `views.service.ts` | **New.** Turns a view name into fixed `SearchCriteria` (D1), parses `limit`/`cursor` with FEAT-015's existing rules, resolves the caller's zone through `UserTimeZoneService`, calls the repository, maps rows to `SearchResult` — reusing `search.service.ts`'s existing `toResult`, which is exported for this purpose rather than copied |
| `views.errors.ts` | **New.** `SmartViewNotFoundError` — framework-free, the established shape |
| `dto/smart-view-query.dto.ts` | **New.** `@IsOptional()` `cursor`/`limit`, `@Type(() => Number)` on `limit` (query strings arrive as text) — the same DTO shape as `search-query.dto.ts` |
| `search.criteria.ts` | **Extended.** `SearchCriteria` gains `sort: 'newest' \| 'due'`; the cursor's timestamp field is renamed `createdAt` → `sortKey` (D2). `parseCriteria` sets `sort: 'newest'`; `parseLimit`/`decodeCursor` are exported for the views service to reuse rather than re-implement |
| `search.repository.ts` | **Extended.** The `ORDER BY`, the keyset comparison and the exact-precision sort key are chosen by `criteria.sort` (D2). Predicates — including the single `OVERDUE` constant — are untouched |
| `search.module.ts` | Registers the new controller and service beside the existing ones |

### 5.2 The view → criteria mapping (D1)

| `view` | `status` | `due` | `sort` |
| :-- | :-- | :-- | :-- |
| `today` | `active` | `today` | `due` |
| `upcoming` | `active` | `upcoming` | `due` |
| `overdue` | `active` | `overdue` | `due` |
| `all` | `active` | — | `newest` |

Every predicate on the right already exists in `search.repository.ts` and is
already covered by FEAT-015's tests. `status: 'active'` is what FR-SRCH-008's
"completed and soft-deleted tasks are excluded" compiles to (the `deleted_at IS
NULL` half is unconditional in the repository and reachable by no parameter).

### 5.3 Ordering and the cursor (D2)

```sql
-- today / upcoming / overdue          -- all
ORDER BY t.due_at ASC, t.id ASC        ORDER BY t.created_at DESC, t.id DESC
WHERE (t.due_at, t.id) > ($k, $i)      WHERE (t.created_at, t.id) < ($k, $i)
```

The three due views all carry `due_at IS NOT NULL` in their predicate, so the
sort key is never null and the order is total with `id` breaking ties — no
`NULLS FIRST/LAST` reasoning enters anywhere. `all` includes tasks with no due
date, which is exactly why it sorts by creation instead.

The cursor stays FEAT-015's opaque base64url `"<timestamp>|<uuid>"`; only the
*meaning* of the timestamp half changes with the sort, which is why the field is
renamed `sortKey`. Wire format unchanged, so the codec, its round-trip tests and
its `400 validation_failed` on a cursor this API did not issue all carry over.

### 5.4 Web

| File | Responsibility |
| :-- | :-- |
| `app/views/[view]/page.tsx` | **New.** SCR-WEB-009. Server component (`dynamic = "force-dynamic"`), `requireSession()`, fetches page 1 server-side so it arrives with the first paint — the shape `app/lists/[id]/page.tsx` uses |
| `app/views/[view]/loading.tsx` | **New.** SCR-WEB-009's `loading` state, as the route's streaming fallback |
| `lib/views.ts` | **New.** `fetchSmartView(view)` — server-side, cookie-forwarding, returning the same discriminated result shape as `lib/tasks.ts` (`ok` / `not-found` / `unauthenticated` / `error`) — plus the client-side `loadMoreView(view, cursor)` |
| `app/api/views/[view]/route.ts` | **New.** BFF proxy for the client's "Load more"; query string forwarded whole (the cursor is opaque), cookie forwarded, status + JSON relayed verbatim |
| `components/smart-view.tsx` | **New.** SCR-WEB-009's rows, per-view heading and empty copy, and the "Load more" control seeded with the server's first page. Screens are ui-design's manifest; this is the contract wiring |
| `components/shell-frame.tsx` | The three placeholder `<span>`s become real `sidebar-nav-item` links — plus **All**, the fourth view FR-SRCH-007 names — with design.md's selected state |
| `components/app-shell.tsx` | Threads `activeView` through to the frame, the way `activeListId` already is |

Rows reuse `DueChip`, `PriorityDot`, `TaskCheckbox` and the row anchor to
SCR-WEB-010 — one `task-row` treatment across list view and smart view (D8) —
and add the originating list's name (UC-014 step 3). Cross-device refresh comes
free: `SyncProvider` calls `router.refresh()`, which re-renders these server
components (FEAT-019).

### 5.5 Skeleton stubs replaced

`src/modules/README.md`'s `search` row (FR-SRCH-*, "FEAT-015 ✅ built, FEAT-016
(smart views)") becomes fully built. `shell-frame.tsx`'s placeholder smart-view
nav — carried since FEAT-009 — becomes real.

## 6. Acceptance criteria

- **AC-1 (FR-SRCH-007; UC-014 main 1–3).** `GET /views/today` returns the
  caller's matching tasks drawn from **every list they own** — verified with
  members seeded in two different lists, both present in one response — and each
  result carries `listName` equal to its list's name plus its full task payload
  (`dueAt`, `priority`, `completedAt`, `isOverdue`).
- **AC-2 (FR-SRCH-008 · Today; FR-PROF-003).** With the account's timezone set
  to `America/New_York`, a task due `2026-07-30T18:45:00Z` is a member of
  `today` on that date and **not** of `upcoming`; with the same account switched
  to `Asia/Calcutta` — where that instant is 00:15 on the 31st — the same task is
  a member of `upcoming` and **not** of `today`. The stored zone is the only
  thing that changes.
- **AC-3 (FR-SRCH-008 · Upcoming).** `upcoming` returns exactly the active tasks
  due **after** the current day in the caller's zone: a task due later today is
  absent, a task due tomorrow is present, a task with no due date is absent.
- **AC-4 (FR-SRCH-008 · Overdue; FEAT-011 D3, FEAT-015 D5).** `overdue` returns
  exactly the active tasks whose due instant has passed, every one of them
  carrying `isOverdue: true`, and the set is **identical** to
  `GET /search?status=overdue` and to `GET /search?due=overdue` over the same
  fixture — one definition of overdue across all four surfaces that express it.
- **AC-5 (FR-SRCH-008 · All).** `all` returns every active task including those
  with **no due date**, and is a superset of `today ∪ upcoming ∪ overdue`.
- **AC-6 (FR-SRCH-008 exclusions).** A **completed** task and a **soft-deleted**
  task appear in **no** view, under any `limit`/`cursor` combination — asserted
  for all four views, including ones whose due date would otherwise place them
  in `today` and `overdue`.
- **AC-7 (FR-SRCH-008 overlap; D5).** An active task due earlier **today** is
  returned by **both** `today` and `overdue`, with `isOverdue: true` in both.
  The overlap is the requirement's own semantics, asserted so it cannot be
  "fixed" into a silent exclusion later.
- **AC-8 (FR-SRCH-006; UC-014 alt 2a).** A view with no members returns
  `200 { view, results: [], nextCursor: null }`, and SCR-WEB-009 renders an
  empty state whose copy names the view (an empty `today` does not say the same
  thing as an empty `all`).
- **AC-9 (FR-SRCH-009).** With 60 members of a view and `limit=25`: the first
  page returns 25 results and a non-null `nextCursor`; following the cursor
  twice more yields 25 then 10, with `nextCursor: null` on the last; the 60 ids
  across the three pages are **distinct and complete**. `limit=51` is a `400`,
  not a silently clamped page. Asserted on a due-sorted view **and** on `all`,
  because the two sort keys page through different code.
- **AC-10 (ordering; D2).** `today`, `upcoming` and `overdue` are ordered by due
  date **ascending** (soonest first); `all` is ordered newest-created first.
  Tasks sharing a due instant appear in a stable, total order (id breaks the
  tie) — asserted with two tasks due at the same instant.
- **AC-11 (keyset stability; FEAT-015 D4).** A task inserted **between** two page
  requests neither causes an already-returned task to reappear on the next page
  nor pushes an unseen one past the boundary — asserted on a due-sorted view,
  where the inserted task's due date falls inside the range already read.
- **AC-12 (FR-AUTHZ-001/002/003).** Without a session, both the endpoint and the
  BFF route return `401 unauthenticated`. Another user's task that would qualify
  for a view never appears in any of the four. An unknown view name returns
  `404 view_not_found`.
- **AC-13 (validation).** `limit` non-integer or out of range and a `cursor`
  this API did not issue each return `400 validation_failed` naming that field.
- **AC-14 (NFR-PERF-001, NFR-SCAL-002).** Against a user holding **5,000 tasks**,
  the p95 of `GET /views/{view}` stays under **300 ms** for all four views plus a
  deep cursor page, measured through the HTTP endpoint against the local stack
  and recorded with its environment caveat.
- **AC-15 (NFR-USE-003).** SCR-WEB-009 presents **loading, empty, populated and
  error** distinctly; the sidebar marks the open view with design.md's selected
  state; every control is keyboard-operable; the error state offers a retry and
  leaves the shell navigable.
- **AC-16 (D8, row parity).** A smart-view row carries the same treatment as a
  list-view row — complete checkbox, title, due chip, priority dot — plus its
  list name, and navigates to SCR-WEB-010. Completing a task from a smart view
  removes it from that (active-only) view on refresh.

## 7. Decisions

- **D1 — Smart views are the existing search repository with fixed criteria, not
  a second query builder.** Driver: FEAT-015 §8 wrote this feature's plan down —
  "its smart views are the same query with fixed criteria, which is why the
  repository takes criteria as data rather than exposing four methods" — and
  §5.2's mapping table shows every predicate a view needs already exists and is
  already tested. The alternative is not merely duplication: it would spell the
  overdue rule a **fourth** time, and FEAT-011 D3's single definition survives
  only because nobody re-implements it. Rejected: a `views` module (the boundary
  rule would then forbid it from importing the repository it is a caller of,
  forcing either a copy of the SQL or a shared-contract detour for an internal
  read — cost with no isolation gained, since `search` and `views` answer the
  same question); four repository methods (FEAT-015 explicitly designed against
  this). Consequence: `modules/search` now serves two controllers, and the
  module's name is narrower than its job — recorded in `README.md` rather than
  renamed, because a rename would touch every import for a word.
- **D2 — Due views sort by due date ascending; `all` sorts newest-first; the
  cursor generalizes to `(sortKey, id)`.** Driver: a view of *when things are
  due* whose first page is not the soonest thing due answers the wrong question,
  and FR-SRCH-008 defines three of the four views entirely in terms of `due_at`.
  `all` has no such key — it deliberately includes tasks with no due date — so it
  keeps FEAT-015 D2's newest-first order, and neither view ever needs
  `NULLS FIRST/LAST` reasoning because the due views' own predicates guarantee
  `due_at IS NOT NULL`. The keyset cursor must be the `ORDER BY` tuple, so it
  becomes `(sortKey, id)` with the direction following the sort; the wire format
  (base64url `"<timestamp>|<uuid>"`) is unchanged, so FEAT-015's codec and its
  tests carry over. Rejected: sorting `all` by `due_at NULLS LAST` (the keyset
  comparison then needs a case split on null, for a view whose members mostly may
  have no due date); sorting every view newest-first (simplest code, wrong
  product); a `sort` query parameter (no FR asks for it, and each view has
  exactly one order that makes sense). **Note:** views reuse `SEARCH_PAGE_SIZE` /
  `SEARCH_PAGE_SIZE_MAX` rather than minting a second pair — FR-SRCH-009 speaks
  of task views and search results in one sentence, and two knobs would drift.
- **D3 — The architecture's `(owner_id, due_at)` index is built here, partial,
  and the numbers are recorded.** Driver: arch §8 names it; FEAT-011 D7 deferred
  it to "FEAT-015/016" as serving "due-date FILTERING and bucketing"; FEAT-015 D3
  correctly declined it for *keyword* search, whose `ILIKE`-on-title,
  order-by-created shape the index cannot serve. This feature is the shape it was
  named for. Measured on the local stack with the probe user at NFR-SCAL-002's
  ceiling — **5,000 tasks inside a 106,651-row table** so the owner index is
  selective the way it is in production — `EXPLAIN (ANALYZE)`, warm, second run:

  | View / shape | No index | With partial index |
  | :-- | --: | --: |
  | `today` (first page) | 1.07 ms | 0.83 ms |
  | `upcoming` (first page) | 1.46 ms | 0.53 ms |
  | `overdue` (first page) | 0.81 ms | **0.046 ms** |
  | `all` (first page) | 0.91 ms | 0.89 ms |
  | `upcoming`, deep keyset page | 0.71 ms | **0.056 ms** |
  | `all`, deep keyset page | 0.80 ms | 0.74 ms |

  Without it, every view bitmap-scans the owner's whole active set (5,000 rows)
  and top-N sorts — work that grows with the user's corpus on every request.
  With it, the due views become an index scan that reads one page's worth of rows
  — work that grows with the *page*. Both are inside NFR-PERF-001's 300 ms at
  today's ceiling; the index is bought for the **shape** of the curve, not for
  the current number, which is the honest reason and is why the numbers are here
  rather than a claim. **`today` and `all` do not use it**, and that is expected
  rather than a defect: `today`'s predicate is an expression over `due_at`
  (`AT TIME ZONE ... ::date`) and therefore not sargable (D4), and `all` has no
  due predicate and sorts by `created_at`. Nobody should later "fix" the plan for
  those two. Rejected: **no index** (FEAT-015 D3's answer, right for its query,
  wrong here — it would leave an index the architecture named unbuilt by any
  feature, on the strength of a millisecond measured on an idle laptop); the
  **plain** (non-partial) index (identical timings, 2,816 kB vs 2,264 kB, and it
  would carry completed and deleted rows that no view can ever return); a
  `(owner_id, completed_at, due_at)` composite (the partial predicate expresses
  the same selectivity without spending a column on a boolean-ish value).
- **D4 — `today`/`upcoming` keep FEAT-015's calendar-day cast rather than
  becoming a sargable instant range.** Driver: the rewrite —
  `due_at >= <local midnight> AND due_at < <next local midnight>` — would let
  those two views use D3's index, but it computes day boundaries as instants,
  which is exactly where DST bites: in zones whose transition lands at midnight,
  local midnight is ambiguous or does not exist, while `(due_at AT TIME ZONE
  tz)::date` is immune. It would also fork the definition of "today" away from
  `GET /search?due=today`, which compiles the same sentence today. Measured cost
  of not doing it: 0.83 ms (D3). Rejected: the range form (correctness risk at a
  boundary nobody tests, for microseconds); changing both surfaces together (same
  risk, plus a cross-feature change to a shipped, accepted contract).
- **D5 — `today` and `overdue` overlap, and that is the requirement.** Driver:
  FR-SRCH-008 defines Today as "active tasks due **within the current day**" and
  Overdue as "active tasks **past due**"; a task due at 09:00 today, read at
  14:00, satisfies both sentences. Excluding it from Today would be this design
  inventing a rule the SRS does not state — and would make a task vanish from
  Today the moment its own deadline passed, which is when a user most wants to
  see it. AC-7 pins the overlap so it survives a future reader's tidying instinct.
  Rejected: `today` meaning "due today and not yet past" (invented, and hides
  work); `overdue` excluding today's misses (same, from the other side).
- **D6 — An unknown view name is `404 view_not_found`, not `400`.** Driver: the
  view is a **path segment naming a resource**, not a filter value in a query
  string — `/views/bogus` is a URL that does not exist, and the codebase already
  answers that with a domain-specific `*_not_found` code (`list_not_found`,
  `task_not_found`). The four names are a closed, public set, so unlike an id
  there is nothing to disclose and no enumeration concern (FR-AUTHZ-003's uniform
  404 rule is about ownership, and no ownership question arises here). Rejected:
  `400 validation_failed` on a synthetic field (it would be the only place in the
  API where a path segment reports as a field); redirecting to `all` (guessing at
  intent, and it would mask a client bug forever).
- **D7 — Smart views are routes, not an overlay.** Driver: ux-foundations' IA puts
  Smart Views directly under the app alongside Lists, and SCR-WEB-009 has
  loading/empty/populated states of a destination screen, not of a transient
  panel. This is the deliberate opposite of FEAT-015 D1's overlay decision, for
  the deliberate opposite reason: search is something you *do* from wherever you
  are and dismiss; a smart view is somewhere you *go*, and it should be
  linkable, bookmarkable and in the back history. Consequence: `/views/{view}`
  server-renders its first page, and only "Load more" talks to the BFF.
- **D8 — A smart-view row is the same `task-row`, checkbox included.** Driver:
  design.md §4 specifies one `task-row` (complete checkbox, title, due chip,
  priority dot) and the product has exactly one; rendering a stripped copy here
  would fork the spec and make the same task look different depending on the
  route it was reached from. The checkbox is FEAT-012's existing component and
  costs this feature nothing but an assertion (AC-16). Consequence: completing a
  task from Today removes it from Today on the next refresh — correct for a view
  defined as *active* tasks, and worth stating because it looks like a
  disappearance if you have not read FR-SRCH-008.

## 8. Escalations & open items

- **No architecture amendment.** No new entity, no ownership change, no boundary
  crossed: the feature reads `tasks`, `lists` and (through `common/preferences`)
  one column of `users`, all inside the `search` building block the architecture
  already names. The one schema change is an index the architecture itself
  specified.
- **Plan correction suggested (not applied — the plan is implementation-planning's
  document).** The plan's FEAT-016 row traces FR-SRCH-007, FR-SRCH-008 and
  FR-SRCH-006 (partial), but the endpoint also realizes **FR-SRCH-009** for the
  "task views" half of its sentence (search results were FEAT-015's half). This
  design appends its Design ref to FR-SRCH-009's RTM row accordingly; the Plan
  ref column, which planning owns, still reads FEAT-015 only.
- **Cursors are opaque and scoped to the request that produced them.** A cursor
  minted by one view (or by search) decodes on another — both halves are a
  timestamp and a uuid — and would simply start that view at an uninteresting
  place. It is not a data-exposure path (ownership is enforced in the statement,
  unconditionally, and AC-12 asserts it), and no client the product ships can
  produce the situation. Tagging the sort into the cursor was rejected: it would
  change a wire format already issued, for a case only a hand-written request can
  reach.
- **DEF-002 is open.** The api suite must be run **serially**
  (`npm test -w @todo/api -- --runInBand`); a red parallel run is re-checked
  serially before it is attributed to this feature.
- **DEF-006 and DEF-009 are open** and touch any new screen: SCR-WEB-009's error
  state must use `--color-danger-text` on the danger tint (never `--color-danger`
  — the 3.95:1 pairing), and the missing product-wide focus ring (DEF-009) is
  **not** this feature's to fix, though its controls inherit the browser default
  like every other screen.
- **Not in this feature:** per-view counts in the sidebar (no FR asks for them,
  and each would be a second aggregate query per page load); combining a keyword
  with a view (that is search, which already has both filters); a custom or
  saved view; sort options (D2 fixes one order per view); "This week" or any
  bucket FR-SRCH-008 does not name.
