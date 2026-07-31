# Tasks: FEAT-016 — Smart views (Today / Upcoming / Overdue / All)

> Executes: docs/features/FEAT-016-smart-views/technical-design.md
> Status: all tasks done · Last updated: 2026-07-31
> Notes: **This feature completes the `search` module** — smart views land inside
> `apps/api/src/modules/search/`, not in a module of their own (design D1). The
> existing `search.repository.ts` already contains every predicate the four views
> need; the only genuinely new API work is the **sort** (design D2) and the
> **index** (design §4/D3).
> **The four design subtleties to hold onto:** (1) the due views sort **due_at
> ASC** and `all` sorts **created_at DESC** — the keyset cursor is the ORDER BY
> tuple, so its direction follows the sort (D2); (2) `today` and `overdue`
> **overlap by definition** and AC-7 asserts it — do not "fix" it (D5); (3)
> `today`'s predicate stays the calendar-day cast and therefore does **not** use
> the new index, deliberately (D4); (4) an unknown view name is `404
> view_not_found`, not a `400` (D6).
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/search/search.controller.spec.ts` is the closest model for T5,
> `modules/search/search.repository.spec.ts` for T3/T4).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`.
> **DEF-006/DEF-009 are open**: SCR-WEB-009's error state uses
> `--color-danger-text` on the danger tint, never `--color-danger`.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3): a FEAT-016 block adding
      `SMART_VIEWS` (`today`/`upcoming`/`overdue`/`all`) + `SmartView`,
      `smartViewPath(view)`, `SmartViewResponse` (`view`, `results:
      SearchResult[]`, `nextCursor`), and `SMART_VIEW_ERROR_CODES.viewNotFound`
      (`view_not_found`). Page-size constants are **reused** from FEAT-015, not
      re-minted (D2's note).
      Done when: `npm run build:shared` succeeds, api + web typecheck against the
      new symbols, and **no existing exported shape changes** — `SearchResult`
      and `SearchResponse` in particular are reused, never edited.

- [x] T2 — Migration `1721580000000_smart-view-index.js` (design §4): the partial
      index `tasks_owner_due_idx (owner_id, due_at) WHERE completed_at IS NULL
      AND deleted_at IS NULL`. No columns, no tables, no constraints.
      Done when: `npm run db:migrate` applies clean and the down migration drops
      it clean against the current schema, and `\d tasks` shows the index with
      its predicate.

- [x] T3 — Domain: generalize the sort in `search.criteria.ts` +
      `search.repository.ts` (design §5.1, §5.3, D2). `SearchCriteria` gains
      `sort: 'newest' | 'due'`; the cursor's timestamp field is renamed
      `createdAt` → `sortKey`; the repository picks its `ORDER BY`, its keyset
      comparison direction and the exact-precision sort key from `criteria.sort`.
      Export `parseLimit`/`decodeCursor` for T4 to reuse. **Predicates are not
      touched** — the `OVERDUE` constant especially.
      Done when: the **existing** search unit + integration suites are green
      unchanged in behaviour (`sort: 'newest'` is what `parseCriteria` sets), and
      new tests pin AC-10's due-ascending order with an id tie-break and AC-11's
      keyset stability on a due-sorted result set.

- [x] T4 — Domain: `views.service.ts` + `views.errors.ts` (design §5.1, §5.2;
      FR-SRCH-007, FR-SRCH-008). Maps a view name to fixed criteria per §5.2's
      table, resolves the caller's zone through `UserTimeZoneService`, calls the
      repository, and maps rows with `search.service.ts`'s **existing**
      `toResult` (export it; do not copy it — D1).
      Done when: integration tests pass for AC-2 (the same task bucketed `today`
      under `America/New_York` and `upcoming` under `Asia/Calcutta` — the stored
      zone is the only thing that changes), AC-3, AC-4 (the `overdue` set is
      identical to `GET /search?status=overdue` and `?due=overdue` over one
      fixture, every member carrying `isOverdue: true`), AC-5, AC-6 (a completed
      and a soft-deleted task appear in **no** view) and AC-7 (a task due earlier
      today is in **both** `today` and `overdue`).

- [x] T5 — Contract: `views.controller.ts` + `dto/smart-view-query.dto.ts`,
      registered in `search.module.ts` (design §3, §5.1). `@Get(':view')` with
      class-level `@UseGuards(SessionGuard)`; **no `ChangeSignalInterceptor`**
      (nothing is written); `@Type(() => Number)` on `limit`.
      Done when: supertest contract tests pass for AC-1 (`200` shape, `view`
      echoed, `listName` present, members drawn from two lists), AC-8
      (`200 { results: [], nextCursor: null }` for an empty view), AC-9
      (60 members at `limit=25` → 25/25/10 with distinct, complete ids —
      asserted on a due-sorted view **and** on `all`; `limit=51` is a `400`),
      AC-12 (`401` without a session; another user's qualifying task never
      appears; an unknown view name is `404 view_not_found`) and AC-13 — each
      rendering the `ApiError` envelope.

- [x] T6 — Verify NFR-PERF-001 empirically (design D3; AC-14). Seed a user with
      **5,000 tasks**, then time all four views plus a deep cursor page through
      the **HTTP endpoint**, not just the SQL.
      Done when: p95 for each shape is recorded and under 300 ms, with the
      environment stated (local stack, single user) so the number is read as
      indicative rather than as a production guarantee. A shape that misses the
      bound is a design escalation (D3's threshold reasoning), not a task to
      grind on.

- [x] T7 — UI integration point (design §5.4): `app/api/views/[view]/route.ts`
      (BFF GET, query string + cookie forwarded, envelope relayed verbatim),
      `lib/views.ts`, `app/views/[view]/page.tsx` + `loading.tsx`,
      `components/smart-view.tsx` consuming the contract, and the sidebar in
      `shell-frame.tsx` — the three placeholder `<span>`s become real links plus
      **All**, with `activeView` threaded through `app-shell.tsx`. Rows reuse
      `DueChip`/`PriorityDot`/`TaskCheckbox` from the list view (D8).
      Screens are ui-design's manifest; this task is the contract wiring.
      Done when: AC-15 holds — SCR-WEB-009 presents **loading, empty, populated
      and error** distinctly, the sidebar marks the open view, every control is
      keyboard-operable — and AC-16 holds (row parity plus list name; completing
      from a view removes the task on refresh), with AC-8's per-view empty copy
      reachable.

- [x] T8 — E2E: extend `e2e/tests/` with the path this feature completes — sign
      in → open Today from the sidebar → see tasks due today from more than one
      list with their list names → switch to Upcoming, Overdue and All and see
      the membership change → open an empty view and see its empty state → page
      through a view with more members than one page. [UC-014]
      Done when: `npm run test:e2e` passes against the local stack, with the
      FEAT-008..013, FEAT-015 and FEAT-019 specs still green.

- [x] T9 — Verify: acceptance criteria AC-1..AC-16 (design §6) demonstrably pass;
      `src/modules/README.md` updated to show `search` fully built (FEAT-015 +
      FEAT-016); `npm run boundaries`, `npm run lint`, `npm run build`, and the
      api + shared + web + e2e suites green — the api suite **serially** while
      DEF-002 is open.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
