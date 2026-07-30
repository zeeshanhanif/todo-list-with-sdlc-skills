# Acceptance Report: FEAT-010 — Create task + list view

> Verdict: **Accepted** · Date: 2026-07-27
> Standard: technical-design.md §6 (AC-1..AC-12) · Sources: docs/srs.md (FR-TASK-001/002/003, FR-LIST-009, FR-AUTHZ-001..005, NFR-USE-001/003, NFR-PERF-001, NFR-LOC-001), docs/use-cases.md (UC-009)
> Repo state audited: `381bf24` (feature range `2c36bfa`..`381bf24`)

## Verdict summary

FEAT-010 is **accepted**. The standard was re-derived from the SRS statements and
UC-009's flows before any test was read: every FR in the feature's trace carries
at least one criterion, UC-009's realized paths (main 1/3/4 and alt 3a) are
represented, and the criteria encode their sources faithfully — including the
deliberate partial realization of UC-009 step 2, which the plan assigns to
FEAT-011. Three mutation checks confirmed the subtlest assertions genuinely fail
when the behavior breaks, including the completed-section ordering, whose naive
form is a bug the implementation fixed mid-task. One test was **rejected and
corrected**: AC-11's autofocus clause had no rerunnable assertion. All suites
were run fresh from the audited commit, migrations applied to a **fresh
database**, and the contracts, the FR-TASK-001 side effect and NFR-PERF-001 were
verified directly against a running stack. Five minor findings are recorded; the
first is a **suite-integrity defect that should be routed to the maintenance
route before it erodes later gates**, but it is not FEAT-010's code and does not
block this verdict.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-001, FR-LIST-009, FR-AUTHZ-004; UC-009 main 1/3 | `tasks.repository.spec`, `tasks.service.spec`, `tasks.controller.spec`, E2E | faithful — trimmed title, `completedAt: null`, `listId` = path list, `owner_id` read back from the row | green |
| AC-2 | FR-TASK-002; UC-009 alt 3a | `tasks.service.spec` ×2, `tasks.controller.spec`, E2E | faithful — empty / whitespace / 501 rejected, **500 accepted at the boundary**, duplicates accepted, nothing created, and the requirement messages asserted | green |
| AC-3 | FR-TASK-003 (partial); UC-009 main 4 | `tasks.repository.spec`, `tasks.service.spec` ×2, `tasks.controller.spec` | faithful — the AC's exact 2-active/3-completed/1-soft-deleted fixture is exercised at the repository level; `list` carries the `ListSummary` shape | green |
| AC-4 | ordering (FR-TASK-012 note) | `tasks.repository.spec` ×2, `tasks.service.spec`, `tasks.controller.spec` | faithful — completions seeded **out of order** to prove the sort rather than the insert order; stability across reads asserted; **mutation-checked** | green |
| AC-5 | FR-AUTHZ-002/003/005 | `tasks.repository.spec`, `tasks.service.spec` ×2, `tasks.controller.spec`, E2E | faithful — envelopes compared with `toEqual` (byte-identical) on **both** endpoints, malformed ids take the same path, and no row is written for either user; **mutation-checked** | green |
| AC-6 | FR-AUTHZ-001 | `tasks.controller.spec` | faithful — no cookie and revoked cookie, both endpoints, plus a read-back proving nothing was written | green |
| AC-7 | FR-LIST-009 | `tasks.repository.spec`, `tasks-lists-integration.spec`, E2E | faithful — the task is returned by that list only, and the FEAT-009 cascade is re-exercised against **contract-created** rows (`deletedTaskCount` 3, zero survivors) | green |
| AC-8 | NFR-PERF-001 | `tasks.controller.spec` | faithful — query count filtered to the view's two statements; 500 tasks served inside the bound | green |
| AC-9 | NFR-LOC-001 | `tasks.repository.spec`, `tasks.service.spec` ×2 | faithful — ISO-8601 UTC pattern asserted on both `createdAt` and `completedAt`, `null` for an active task, `timestamptz` round-trip | green |
| AC-10 | NFR-USE-003; UC-009 main 4 | E2E ×3 | **partially faithful** — populated, both empty variants and not-found observed; the generic **error** state is inspection-verified only (minor 2) | green |
| AC-11 | NFR-USE-001 (partial); UC-009 main 1–4 | E2E | **was weak → corrected** (below) | green after correction |
| AC-12 | FR-TASK-003 (partial), navigation | E2E ×2, `tasks-lists-integration.spec` | faithful — row click navigates, `data-selected` asserted on the open list, and the count badge increments against contract-created tasks | green |

**Standard audit (Phase 2).** No design-defect findings. Coverage is complete and
faithful. Three interpretations were checked closely and accepted:
- **UC-009 step 2 is deliberately absent.** "Optionally sets a due date/time and
  priority" traces to FR-TASK-006/008, which the plan assigns to FEAT-011.
  Implementing it here would take FEAT-011's requirements without its criteria.
  The design says so (D6) and the feature's UC realization is partial by
  construction — correct, not a gap.
- **FR-TASK-001's "list defaults to Inbox if unspecified"** is realized by the
  *caller*, not the contract: the endpoint always carries a list, and the app
  home renders the default one, so the quick-add there creates in the Inbox
  without the user choosing. AC-11 covers exactly that. The design argued this
  openly (§3) rather than quietly dropping the note — a faithful realization
  given the plan's endpoint shape.
- **FR-TASK-003 partial** scopes to the active/completed split; FR-TASK-011's
  collapsed presentation is FEAT-012's, and so is the only way to *make* a task
  completed. The completed section is therefore specified, implemented, and
  exercised only by seeded fixtures in this slice — which is what AC-3 tests.

## Corrected tests

**AC-11 — `e2e/tests/tasks.spec.ts` (commit `381bf24`).** The criterion states
that creating the first task takes "one field and one action with no
navigation", and names the quick-add being *focusable immediately* as part of
it. The E2E asserted the home renders the default list, that Enter creates, and
that the task appears without a reload — but never that the composer is
**focused**. Without the focus the user owes a click first and the criterion is
simply false, so the untested clause was the load-bearing one. The
implementation had demonstrated autofocus in a throwaway script, which is
precisely the "unverified verification" this audit exists to catch. The test now
asserts `toBeFocused()` on arrival. Also added the AC references the three E2E
test names lacked. Passes against unchanged production code.

## Independent execution

All run from `381bf24` with the harness's own commands:

| Run | Command | Observed |
| :-- | :------ | :------- |
| Feature suite | `npx jest src/modules/tasks` (in `apps/api`) | **24 passed** / 4 files |
| Whole repo (serial) | `npm test -w @todo/api -- --runInBand` | **140 passed** / 29 files |
| Worker | `npm test -w @todo/worker` | **20 passed** / 6 files |
| E2E | `npm run test:e2e` | **9 passed** (3 tasks + 3 lists + 3 signup) |
| Boundaries | `npm run boundaries` | no violations (111 modules) |
| Build | `npm run build` | 0 errors |
| Lint | `npm run lint` | clean |
| Migrations | `node-pg-migrate up` against a **freshly created database** | 8 applied clean; `tasks` matches §4; no migration owed by this feature |

**Mutation checks** (Phase 3, restored afterwards — `git diff` clean):
- Dropped `owner_id` from `findOwnedList`'s WHERE → **4 AC-5 tests failed**
  across repository, service and contract layers. The ownership property is real.
- Reverted the completed-section `ORDER BY` to its naive form (`created_at ASC`
  before `completed_at DESC` — the bug the implementation fixed during T2) →
  **AC-4's repository test failed**. Worth noting: only the repository-level
  AC-4 test caught it; the service and contract AC-4 tests assert the active
  append order but seed completions in order, so they would not have. One
  faithful test is coverage, but the strength is concentrated in one place.

**Whole-repo suite under parallel workers is flaky — see finding 1.** Measured
independently in this run: **2/8 parallel runs failed**, always on FEAT-005's
`reset-password` AC-7 rate-limit test, never on a FEAT-010 test. Serial execution
is deterministic green (140/140, twice). Recorded, not laundered.

## Direct verification

Observed against a running local stack, not inferred from tests:

- **Contract shapes (§3).** `POST /lists/{listId}/tasks` → `201 { task: { id,
  listId, title, completedAt: null, createdAt } }` with the title trimmed;
  `GET` → `200 { list: ListSummary, active[], completed[] }`. Errors:
  `400 validation_failed` with `fields[{field: "title"}]`,
  `404 {"code":"list_not_found"}`, `401 {"code":"unauthenticated"}`. Every shape
  matches technical-design §3; no undeclared divergence.
- **FR-TASK-001's "created as active", inspected at the row level.** A task
  created through the endpoint has `completed_at IS NULL`, `deleted_at IS NULL`
  and `list_id` equal to the path's list — the requirement's own words, checked
  in the database rather than through the API's echo.
- **NFR-PERF-001, measured (indicative).** With **501 tasks** in the list,
  `GET /lists/{id}/tasks` served in **3–11 ms** over 10 samples; `POST` in
  **2–3 ms** over 5. The SRS names both "create a task" and "load a list" in this
  bound; both are orders of magnitude inside 300 ms. *Environment caveat:* local
  Docker Postgres, not Supabase over the pooler — the two-statement shape (AC-8)
  is what makes it hold at scale.
- **Screens (manifest spot-check).** Both locators resolve. SCR-WEB-008's
  `populated`, `empty`, `not-found` and SCR-WEB-018's `default (empty)` were
  observed rendering; at a **390px viewport the main column measures 390px**, so
  FEAT-009's drawer fix holds under this feature's content. The recorded
  responsive gap is exactly as the manifest describes it — the composer sits under
  the header rather than bottom-anchored — and is not worse than declared.
  Conformance claim holds: **zero raw hex, zero raw px/rem** outside comments
  across the four new UI files, 29 distinct tokens referenced. The new components
  use `var(--size-touch-target)` rather than the hard-coded `44` FEAT-009's
  acceptance flagged — that minor is partially retired.
- **Boundary claim (D8) verified independently.** `depcruise` on
  `apps/api/src/modules/tasks` reports no violations, and the four textual matches
  for `modules/lists` in that directory are all comments. The tasks module reads
  the `lists` table without importing the module, as designed.

## Findings

**Rework: none.**

**Design defect: none.**

**Minor (recorded, non-blocking):**

1. **The whole-repo suite is flaky under parallel workers — route to
   maintenance.** FEAT-005's `reset-password` AC-7 (per-IP rate limiting) fails
   in ~2/8 parallel runs, returning `200` where it expects `429`. It is **not**
   FEAT-010's test and **not** FEAT-010's code, and it is pre-existing: with all
   FEAT-010 specs excluded it still fires (1/8 in this audit's run). It never
   fails serially or in isolation, so the mechanism is contention between suites
   sharing the `auth_rate_buckets` table and the `192.0.2.x` address space (three
   auth specs share that range) while each worker holds its own
   `AUTH_RATELIMIT_MAX`. The implementation reduced FEAT-010's contribution —
   restoring the env var in the three specs it owns and moving its cross-feature
   spec to a dedicated range — but the defect itself remains. **This deserves a
   defect-ledger entry**: a suite that fails a quarter of the time makes every
   future feature's gate unreliable, and the honest workaround (running serially)
   hides it rather than fixing it.
2. **AC-10's generic `error` state is inspection-verified, not render-verified** —
   reaching it needs `GET /lists/{id}/tasks` to fail while `GET /auth/session`
   succeeds, and the harness has no seam to inject that. This is the **second
   consecutive feature** with this gap (FEAT-009's sidebar error state was minor
   3 there). Two in a row makes it a pattern rather than an accident: a small
   fault-injection seam in the BFF layer would close both and every future
   data-view's error state.
3. **Focus rings do not use the design system's token.** design.md §5 requires a
   visible 2px `--color-focus-ring` ring on every interactive element; the app's
   inputs — including this feature's quick-add, the most-used input in the
   product — fall back to the browser default because inline styles cannot
   express `:focus-visible`. Accessibility is satisfied in substance (a visible
   ring exists); the design system is not. Pre-existing since FEAT-001, but this
   feature makes it most visible.
4. **Carried, partially retired:** the hard-coded `44` touch-target literals
   (FEAT-009 minor 1) remain in `shell-frame.tsx` and `sign-out-button.tsx`, but
   FEAT-010's new components correctly use `var(--size-touch-target)`.
5. **Carried, unaddressed:** the E2E harness still sets no `AUTH_RATELIMIT_MAX`
   (FEAT-009 minor 2). This audit hit it again — the localhost register bucket had
   to be cleared before the E2E suite would run. Related to finding 1 but
   distinct: that one is jest, this one is Playwright's webServer config.

## RTM

Test ref appended (`features/FEAT-010-create-task/acceptance-report.md`):

- **Full** — FR-TASK-001, FR-TASK-002 (FEAT-010 is the sole Plan ref for each;
  their lifecycle Plan → Design → Test is now closed).
- **Partial** — FR-TASK-003 (Plan ref FEAT-010 + FEAT-012; this feature delivers
  the active/completed split, FEAT-012 the collapsed presentation and the ability
  to complete), FR-LIST-009 (Plan ref FEAT-009 + FEAT-010 — **this append
  completes the set**, so the requirement is now fully verified by computation
  while each report keeps its own accurate scope), NFR-USE-001 (Plan ref FEAT-001
  + FEAT-010), NFR-USE-003 and NFR-PERF-001 and NFR-LOC-001 (Plan ref
  "Foundations"; each is concretely exercised here — the first list view's states,
  the 300 ms bound on both named operations, and UTC timestamps on the wire), and
  FR-AUTHZ-001/002/003/004/005 (Plan ref "Foundations"; the ownership convention
  is now verified on its **second** data module).

---

## Re-verification — 2026-07-28 · Verdict: **Accepted** (unchanged)

Triggered by the maintenance route: **DEF-003** fixed a presentation defect in
this feature's `list-view-failure.tsx` (SCR-WEB-008's `error` and `not-found`
states). Re-verified per the maintenance protocol — a defect fix on verified
behaviour re-opens its owning feature's report.

**What changed:** four token references, no behaviour. Text on the danger tint
moved from `--color-danger` (3.95:1) to `--color-danger-text` (6.80:1), and the
alert's action from `--color-primary` (4.48:1 — a second failure found by
measuring rather than by the original report) to `--color-primary-hover`
(6.21:1). Both now satisfy design.md §5's 4.5:1 rule. See `docs/defects.md`
DEF-003 for the measurements and why `--color-primary-hover` needed no
design-system amendment.

**Why the verdict is unchanged:** none of FEAT-010's acceptance criteria are
touched. AC-10 requires the list view to render its `error` state with a retry
affordance — it still does, in the same layout, with the same `data-testid`s
(`list-error`, `list-not-found`, `list-retry`, `back-home`); only the colour
tokens differ. No contract, schema, endpoint or behaviour changed.

**Observed in this run** (repo at `bd200ec`): api **176 passed / 31 suites**
(serial), worker **20 passed**, e2e **15 passed** — including
`tasks.spec.ts` "AC-5/AC-10: an unknown or unowned list renders one uniform
not-found", which drives the changed component directly — boundaries clean
(122 modules), lint clean, build clean. The rendered markup was checked to carry
`var(--color-danger-text)` and `var(--color-primary-hover)`, not raw hex.

**Coverage note, unchanged and honest:** the e2e proves the alert *appears*; it
asserts nothing about its colour, because `apps/web` has no unit-test runner and
these states render from server components Playwright cannot fault-inject. That
gap is recorded in FEAT-011's report (minor #1) and in DEF-003, which is now its
second concrete motivating case.

**RTM:** no change — FR-TASK-001/002/003's Test refs already point at this report,
and this section extends it rather than superseding it.
