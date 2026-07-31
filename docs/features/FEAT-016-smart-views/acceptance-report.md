# Acceptance Report: FEAT-016 — Smart views (Today / Upcoming / Overdue / All)

# Re-verification — 2026-08-01 · Verdict: Accepted (unchanged) · after the DEF-010 fix

**No FEAT-016 code changed.** DEF-010 was a defect in this feature's own *test
fixtures*, not in its behaviour: `views.service.spec` AC-2 assumed New York and
Calcutta share a calendar date (false after ~14:30 New York), and
`smart-views.spec` UC-014 seeded tasks at `now() + 3h/+5h` and expected them in
Today (false after 19:00 UTC). Both were failing when FEAT-014's acceptance run
found them; the product was correct in both cases, which is why the fixtures
were re-premised rather than the assertions weakened — every expectation,
including Today's exact due-ascending order and the Overdue set of one, is
unchanged.

**Verdict unchanged: Accepted.** No acceptance criterion's outcome moves. What
changes is that the evidence is now trustworthy at every hour instead of for
part of the day: the fixtures derive their zone from the current instant
(`Etc/GMT±N`, fixed offset, no DST), verified across all 24 UTC hours.

**Re-executed (2026-08-01, from `3fd7619`):** api **442/442** (46 suites),
web 76/76, worker 24/24, e2e **48/48**, lint · boundaries · build clean. The
previously failing `views.service.spec` AC-2 and `smart-views.spec` UC-014 are
green. See docs/defects.md DEF-010.

> Verdict: **Accepted** · Date: 2026-07-31
> Standard: technical-design.md §6 @ `77255fa` · Sources: docs/srs.md (FR-SRCH-006/007/008/009,
> NFR-PERF-001, NFR-SCAL-002, NFR-USE-003, FR-AUTHZ-001/002/003), docs/use-cases.md (UC-014)
> Repo state audited: `6ee2280`

## Verdict summary

Accepted. All sixteen criteria hold, every suite was observed green in this run
(api 422 serial, worker 24, web 64, e2e 46, plus build/lint/boundaries and the
migration reversed and reapplied), and the contract, the four views' membership
and the binding performance bound were verified directly rather than taken from
the implementation's report. The audit did find and fix a real hole in the
measurement: **AC-10's "All is newest-created first" test was unfalsifiable** —
its fixture made due-ascending and newest-first produce the identical sequence,
so the exact mistake it names would have passed it — and two criterion clauses
(AC-12's BFF door, AC-15's keyboard operability) had no automated check at all.
All three were corrected as test artifacts and pass against unchanged production
code, which is why this is an acceptance rather than rework: the code was right;
the measurement was not yet.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-SRCH-007; UC-014 main 1–3 | `views.controller.spec` (aggregates across two lists, view echoed, listName), `views.service.spec`, `smart-views.spec.ts` | faithful | green |
| AC-2 | FR-SRCH-008 (Today), FR-PROF-003 | `views.service.spec` (zone flip NY↔Calcutta) | faithful — generalizes the criterion's fixed instant into a date-independent boundary asserting the same property (a fixed 2026-07-30 instant would only be meaningful on that date) | green |
| AC-3 | FR-SRCH-008 (Upcoming) | `views.service.spec` (exact set: tomorrow + next week; today, overdue, undated all absent) | faithful | green |
| AC-4 | FR-SRCH-008 (Overdue), FEAT-011 D3, FEAT-015 D5 | `views.service.spec` (id-set identical to `?status=overdue` and `?due=overdue`; every member `isOverdue`) | faithful | green |
| AC-5 | FR-SRCH-008 (All) | `views.service.spec` (undated included; superset of the other three) | faithful | green |
| AC-6 | FR-SRCH-008 exclusions | `views.service.spec` (all four views), `smart-views.spec.ts` | faithful; the criterion's "any limit/cursor combination" is exercised only at defaults — minor, below | green |
| AC-7 | FR-SRCH-008 overlap; D5 | `views.service.spec` (start-of-day task in Today **and** Overdue), `smart-views.spec.ts` | faithful | green |
| AC-8 | FR-SRCH-006; UC-014 alt 2a | `views.controller.spec` (200 + empty array), `smart-view.spec.tsx` (per-view copy, Overdue without an action), `smart-views.spec.ts` | faithful | green |
| AC-9 | FR-SRCH-009 | `views.controller.spec` (60 members at limit 25 → 25/25/10, distinct and complete, on **both** sorts; `limit=51` → 400), `smart-views.spec.ts` | faithful | green |
| AC-10 | D2 (ordering) | `search.repository.spec` (due-ascending + id tie-break), `views.service.spec` (All newest-first) | **was unfalsifiable → corrected** (below) | green |
| AC-11 | FEAT-015 D4 (keyset) | `search.repository.spec` (insert inside the read range; cursor carries due, not created), `views.controller.spec` | faithful | green |
| AC-12 | FR-AUTHZ-001/002/003; D6 | `views.controller.spec` (401, cross-user, 404 view_not_found), `views.service.spec`, **`smart-views.spec.ts` (BFF 401 — added by this audit)** | was incomplete → covered | green |
| AC-13 | validation | `views.controller.spec` (limit/cursor each naming their field) | faithful | green |
| AC-14 | NFR-PERF-001, NFR-SCAL-002 | T6 measurement + **re-measured independently in this audit** | faithful | green — worst p95 **10 ms** vs 300 ms |
| AC-15 | NFR-USE-003 | `smart-view.spec.tsx` (skeleton/error/not-found), `smart-views.spec.ts` (empty, populated, aria-current, **keyboard — added by this audit**) | was incomplete → covered | green |
| AC-16 | D8 (row parity) | `smart-view.spec.tsx` (checkbox, badge, due chip, priority dot, detail link), `smart-views.spec.ts` (completing removes the row) | faithful | green |

**The standard itself was audited before auditing against it.** Every FR in the
feature's trace has ≥1 criterion, both UC-014 paths are represented, and the
binding NFRs appear as criteria. One fidelity question was checked rather than
assumed: FR-SRCH-008's note says membership is "computed in the user's
timezone", while the design makes `overdue` zone-**invariant** (D5). This is not
a misencoding — "past due" is an instant comparison whose answer is the same in
every zone, and FR-TASK-007 owns that definition product-wide (AC-4 asserts the
three surfaces agree). No design-defect finding.

## Corrected tests

1. **AC-10 — `views.service.spec`, "All is ordered newest-created first"**
   (commit `6ee2280`). *Weak:* the fixture gave the three tasks due dates
   **inverse** to their creation order, so `due_at ASC` and `created_at DESC`
   return the same sequence — mutating `criteriaFor('all')` to `sort: 'due'`,
   the exact error the test names, left all 11 tests green. *Faithful now:* due
   dates run in the same direction as creation, making the two orders exact
   reverses; the mutation is red against the corrected test and the corrected
   test is green against unchanged code.
2. **AC-12 — `smart-views.spec.ts`, BFF 401** (same commit). The criterion names
   both doors; only the API's was covered. A BFF that answered without
   forwarding a cookie would serve one user's views to an anonymous caller, and
   no API-side test can see that. Now asserted at `/api/views/today`.
3. **AC-15 — `smart-views.spec.ts`, keyboard operability** (same commit). The
   clause was demonstrated in a browser during T7 but never committed. Now Enter
   on a sidebar view link, Enter on Load more, and Space on a row checkbox, each
   asserted by its effect rather than by focus alone.

*(2 and 3 are added coverage for uncovered clauses rather than rewrites of weak
tests; recorded here because the audit table must show where each check came
from.)*

## Independent execution

Everything re-run from `6ee2280` with the harness's own commands — no reported
green was carried over:

| Run | Command | Result |
| :-- | :-- | :-- |
| api | `npm test -w @todo/api -- --runInBand` (serial, DEF-002) | **422 passed**, 46 suites |
| worker | `npm test -w @todo/worker` | **24 passed** |
| web | `npm test -w @todo/web` | **64 passed** |
| e2e | `npm run test:e2e` | **46 passed** — including every prior feature's specs |
| boundaries | `npm run boundaries` | clean (185 modules, 223 deps) |
| lint | `npm run lint` | clean |
| build | `npm run build` | clean |
| migration | `node-pg-migrate down` then `npm run db:migrate` | index dropped and reapplied clean; `\d tasks` shows `tasks_owner_due_idx` with its partial predicate |

No flakiness observed in this run. **Mutation checks** (break the behaviour,
confirm red, restore) were run on four load-bearing behaviours rather than
trusting green: `all` given the due sort (**initially passed — the AC-10 hole
above**; red after correction), views no longer filtering to active (red, AC-6),
the caller's timezone ignored (red, AC-2), and the due-sorted keyset comparing
the wrong way (red — 4 tests across the repository and controller suites).

## Direct verification

- **Contract vs technical-design §3.1** — observed over HTTP against a real
  session: the success body carries exactly `{ view, results, nextCursor }`; each
  result carries exactly the `SearchResult` shape (`TaskSummary` + `listName`)
  with `listName` equal to the owning list; `view` is echoed; `nextCursor` is
  null on a single page. Errors match the designed table: `404 view_not_found`
  in the `ApiError` envelope for `/views/yesterday`, `400 validation_failed`
  naming `limit` (51 and 0) and `cursor` (undecodable), `401 unauthenticated`
  with no session. A view given search's parameters (`?status=&q=`) ignores them
  — the global pipe strips rather than honours them, so a view cannot be widened
  through its query string.
- **NFR-PERF-001 / NFR-SCAL-002 (AC-14), re-measured** against a user holding
  **5,000 tasks**, 30 calls per view after warm-up, through the endpoint:
  `today` p50 4 ms / p95 5 ms · `upcoming` 4 / 7 · `overdue` 4 / 5 · `all` 8 / 10.
  Worst p95 **10 ms against a 300 ms bound**; consistent with T6's independent
  run (worst 7 ms) and with the design's SQL-level probe. `all` is the slowest,
  as D3 predicted for the one view the index does not serve. **Environment
  caveat:** local stack — Docker Postgres, single API instance, one user, no
  concurrent load — so these are indicative, not a production guarantee.
- **Screens vs the manifest** — SCR-WEB-009's entry claims `loading, populated,
  empty, error` plus a `not-found` supplement, strategy code-native, conformance
  pass. All five render (skeleton and error/not-found in `smart-view.spec.tsx`,
  the rest in the E2E and in browser capture); both source locators resolve to
  headings that exist in ui-design.md, as does SCR-WEB-007's delta anchor. The
  conformance claim holds on inspection: no hex, `rgb()` or `px` literal appears
  in any of this feature's web files — colour, spacing and type are all token
  references. The error state's computed colour is `rgb(153, 27, 27)` =
  `--color-danger-text`, i.e. the DEF-006 pairing is **not** reintroduced.
- **Schema** — `tasks_owner_due_idx` exists with the designed partial predicate;
  no other schema object changed.

**Pending environment:** none. NFR-PERF-001 is measurable locally and was
measured; nothing in this feature's trace requires infrastructure this repo
cannot stand up.

## Findings

**Rework:** none.

**Design defect:** none.

**Minor** (recorded, non-blocking):
1. **The paging trade is asserted but undocumented in the design record.**
   Completing a task refreshes the server component, which drops the appended
   pages back to a fresh first page of 25 rather than keeping rows the server may
   no longer place in the view. This is correct and deliberate (the T8 commit
   argues it, and the audit's keyboard spec now pins it), but ui-design.md and
   the manifest entry record only the *navigation* case. Owner: ui-design, when
   the entry is next touched.
2. **AC-6's "under any limit/cursor combination" is exercised at defaults only.**
   The exclusion is unconditional in the repository's SQL (`deleted_at IS NULL`
   is not parameterized), so the risk is low, but the criterion is broader than
   its test.
3. **ui-design's recommendation to extend `control-contrast.spec.ts` to
   `/views/today` was not taken.** Consistent with the codebase — that sweep
   covers the form-control screens DEF-005 scoped it to, and SCR-WEB-008/012 are
   not in it either — and this screen introduces no new colour pairing, every one
   of its pairings having been measured in the FEAT-008 sweep. Recorded so the
   gap is a decision rather than an omission.
4. **DEF-002 remains open**; the api suite was run serially per its standing
   instruction. DEF-006 and DEF-009 are untouched by this feature, which adds no
   new instance of either.

## RTM

Test ref appended for the FRs this feature implements:

- **FR-SRCH-007**, **FR-SRCH-008** → `features/FEAT-016-smart-views/acceptance-report.md`
  (whole FR — FEAT-016 is their only Plan ref, so both are now fully verified)
- **FR-SRCH-006** → `…/acceptance-report.md (partial)` — the plan splits it
  across FEAT-015 (search's empty state) and FEAT-016 (the views'); with
  FEAT-015's partial already present, the FR is now fully covered by the
  computation
- **FR-SRCH-009** → `…/acceptance-report.md (partial)` — this feature realizes
  the "task views" half of the requirement's sentence; the plan's Plan ref column
  still names FEAT-015 only, which is the plan correction technical-design §8
  raised and which remains implementation-planning's to make
