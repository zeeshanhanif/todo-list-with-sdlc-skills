# Tasks: FEAT-015 — Keyword search + status/due filters + pagination

> Executes: docs/features/FEAT-015-search/technical-design.md
> Status: pending · Last updated: 2026-07-31
> Notes: **This feature mints the `search` module** and one piece of
> cross-cutting code (`common/preferences`). `apps/api/src/modules/profile/` is
> the freshest structural model; `modules/lists` is the model for a repository
> that builds SQL from arguments.
> **NO MIGRATION and NO INDEX** (design §4/D3) — measured at NFR-PERF-003's own
> ceiling: 2.6 ms for a keyword search over 5,000 tasks, 8.4 ms for a deep
> cursor page. If you find yourself adding an index, stop and re-read D3.
> **The four design subtleties to hold onto:** (1) `today`/`upcoming` are
> **calendar-day** questions and therefore zone-dependent, while `overdue` is an
> **instant** question and therefore zone-invariant — both in one table in §5.2,
> and the inconsistency is the point (D5); (2) the search term must be escaped
> for `LIKE` metacharacters or `%` matches everything (D8, AC-14); (3)
> pagination is **keyset**, not offset, because offset silently re-reads and
> skips rows under concurrent inserts (D4, AC-13); (4) a request with no
> criteria is a **400**, not "everything" (D6).
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T9 exists for the same reason FEAT-010..013's did — UC-013 is a whole
> user-visible flow this feature completes end to end.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/profile/profile.controller.spec.ts` is the closest model for T6,
> `modules/tasks/tasks.repository.spec.ts` for T4).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`.
> **DEF-006/DEF-009 are open**: SCR-WEB-012's error state uses
> `--color-danger-text` on the danger tint, never `--color-danger`.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3): a FEAT-015 block adding
      `SEARCH_PATH`, `SEARCH_STATUSES` / `SearchStatus`, `SEARCH_DUE_BUCKETS` /
      `SearchDueBucket`, `SEARCH_QUERY_MAX_LENGTH` (200), `SEARCH_PAGE_SIZE`
      (25), `SEARCH_PAGE_SIZE_MAX` (50), `SearchResult` (extends `TaskSummary`
      with `listName`), `SearchResponse`, and `SEARCH_ERROR_CODES` if any code
      beyond `validation_failed` proves necessary.
      Done when: `npm run build:shared` succeeds, api + web typecheck against the
      new symbols, and **no existing exported shape changes** — `TaskSummary` in
      particular is extended by `SearchResult`, never edited.

- [x] T2 — Cross-cutting: `src/common/preferences/` (design §5.1, D1) —
      `UserTimeZoneService.effectiveFor(userId)` returning
      `COALESCE(timezone, 'UTC')` in one statement, plus `preferences.module.ts`.
      This is the cross-module read interface FEAT-010 D8 said the third case
      should mint; keep it to **one read, no writes, no cache**.
      Done when: integration tests pass for a user with a stored zone (returned
      verbatim), a user with `NULL` (returns `'UTC'`), and an unknown id
      (returns `'UTC'` rather than throwing — a search must not 500 because a
      preference is missing).

- [x] T3 — Domain: `search.errors.ts` + the cursor codec and criteria rules in
      `search.service.ts` (design §5.1, D4, D6, D8). Encode/decode the opaque
      `(createdAt, id)` cursor; trim and length-check `q`; **escape `%`, `_` and
      `\`** in the term; reject a body with no criteria.
      Done when: unit tests pass for AC-9 (each invalid parameter names its own
      field), AC-14 (a term of `%` is escaped to a literal), the round trip
      `encode(decode(c)) === c`, and a tampered/foreign cursor rejected rather
      than silently treated as page one.

- [ ] T4 — Domain: `search.repository.ts` (design §5.1, §5.2; FR-SRCH-001..005,
      009). ONE owner-scoped statement assembling only the supplied clauses,
      joined to `lists` for `listName`, `ORDER BY created_at DESC, id DESC`,
      `LIMIT n+1` to detect the next page.
      Done when: integration tests pass for AC-1 (case-insensitive substring
      across two lists), AC-2 (`listName` present; a soft-deleted match absent
      under **every** parameter combination), AC-3 (the three status sets),
      AC-4 (the same task bucketed `today` under `America/New_York` and
      `upcoming` under `Asia/Calcutta` — the zone is the only thing that
      changes), AC-5 (conjunctive; a contradictory pair returns empty), and
      AC-12 (`status=overdue` and `due=overdue` return identical sets).

- [ ] T5 — Domain: `SearchService.search(userId, criteria)` (design §5.1) —
      resolves the zone through `UserTimeZoneService`, applies T3's rules, calls
      T4, and maps rows to `SearchResult` reusing the **existing** `isOverdue`
      derivation rather than adding a second one (D5).
      Done when: unit/integration tests pass for AC-7 (60 matching tasks at
      `limit=25` → 25/25/10 with `nextCursor` non-null, non-null, null, and the
      60 ids distinct and complete) and AC-12 (every task returned by
      `status=overdue` carries `isOverdue: true` in its own payload).

- [ ] T6 — Contract: `SearchController` + `dto/search-query.dto.ts` +
      `search.module.ts`, registered in `app.module.ts` (design §3, §5.1).
      Class-level `@UseGuards(SessionGuard)`; **no `ChangeSignalInterceptor`**
      (nothing is written); `@Type(() => Number)` on `limit` because query
      strings arrive as text.
      Done when: supertest contract tests pass for AC-1/AC-2 (`200` shape with
      `listName` and `nextCursor`), AC-6 (`200 { results: [], nextCursor: null }`
      for no matches — **not** a 404, D7), AC-8 (`401` without a session; another
      user's matching task never appears under any parameter combination), AC-9
      (each `400 validation_failed` naming the right field, including `_` for no
      criteria), and AC-13 (a task created **between** two page requests neither
      duplicates a returned row nor hides an unseen one) — each rendering the
      `ApiError` envelope.

- [ ] T7 — Verify NFR-PERF-003 empirically (design D3; AC-10). Seed a user with
      **5,000 tasks**, then time the four shapes D3 measured — keyword matching
      few rows, keyword matching most rows, filter-only, and a deep cursor page —
      through the **HTTP endpoint**, not just the SQL.
      Done when: p95 for each shape is recorded and under 500 ms, with the
      environment stated (local stack, single user) so the number is read as
      indicative rather than as a production guarantee. A shape that misses the
      bound is a design escalation (D3's threshold), not a task to grind on.

- [ ] T8 — UI integration point (design §5.3): `app/api/search/route.ts` (BFF
      GET, query string + cookie forwarded, envelope relayed verbatim),
      `lib/search.ts`, `components/search-overlay.tsx` consuming it, and the
      trigger in `shell-frame.tsx`. Result rows reuse `DueChip`/`PriorityDot`
      from `task-meta.tsx` so a due date reads the same here as in the list view.
      Screens are ui-design's manifest; this task is the contract wiring.
      Done when: AC-11 holds — SCR-WEB-012 presents **idle, loading, results and
      empty** distinctly plus an error state, every control is keyboard-operable,
      and the empty state is reachable and distinguishable from idle (AC-6).

- [ ] T9 — E2E: extend `e2e/tests/` with the path this feature completes — sign
      in → open search → type a keyword → see matches from more than one list
      with their list names → narrow by status and by due bucket → clear to an
      empty result and see the empty state → page through a result set larger
      than one page. [UC-013]
      Done when: `npm run test:e2e` passes against the local stack, with the
      FEAT-008..013 and FEAT-019 specs still green.

- [ ] T10 — Verify: acceptance criteria AC-1..AC-14 (design §6) demonstrably
      pass; **no migration was added** (D3 — the check is that `migrations/` is
      unchanged and `npm run db:migrate` is a no-op at head);
      `src/modules/README.md` updated to show `search` half-built (FEAT-016 adds
      the smart views); `npm run boundaries`, `npm run lint`, `npm run build`,
      and the api + shared + web + e2e suites green — the api suite **serially**
      while DEF-002 is open.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
