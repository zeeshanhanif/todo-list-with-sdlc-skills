# Acceptance Report: FEAT-011 — Task detail (title, due date, priority, overdue)

> Verdict: **Accepted** · Date: 2026-07-29 (re-verification after the DEF-004 fix)
> Prior verdicts: **Accepted** 2026-07-28 (after rework) · **Rework** 2026-07-28 · both preserved below
> Standard: technical-design.md §6 (AC-1..AC-14) · Sources: docs/srs.md,
> docs/use-cases.md, docs/design.md, docs/features/FEAT-011-task-detail/ui-design.md,
> docs/design-manifest.json
> Repo state audited: `1294811` (prior: `d19d45a`; first pass: `db94955`)

---

# Re-verification — 2026-07-29 · Verdict: Accepted (unchanged)

Triggered by the **DEF-004** fix (`1294811`), which changed one token reference
in this feature's `task-meta.tsx`: the ordinary due-date chip's text moved from
`--color-text-muted` to `--color-text`. Re-verification is scoped to what a
colour change can affect — the rendered result and the suites — not a
re-derivation of contracts that no commit touched.

**What the defect was.** `--color-text-muted` on `--color-surface-sunken`
measures **4.34:1** at `caption` (12px), below the **4.5:1** design.md §5
requires. This feature's acceptance on 2026-07-28 measured the *overdue* chip
(AC-14's subject, and DEF-003's fix) and never measured the ordinary one, which
is the variant on screen for every task with a due date that has not yet passed.
It was found on 2026-07-29 by FEAT-012's ui-design while measuring an unrelated
pairing.

**The fix applies this system's own rule** — design.md §2, as amended
2026-07-29: text on the sunken tint takes `--color-text`. No new token, no
further amendment.

| Pairing | Before | After | |
| :-- | --: | --: | :-- |
| due chip (upcoming), light | 4.34:1 ❌ | **16.30:1** ✅ | `--color-text-muted` → `--color-text` |
| due chip (upcoming), dark | 7.05:1 ✅ | 15.49:1 ✅ | dark was already passing — this was a light-theme-only defect |
| due chip (overdue) | 6.80:1 ✅ | 6.80:1 ✅ | unchanged; DEF-003's pairing, now guarded |

**A second instance was found and fixed with it.** Grepping the *pairing* rather
than the reported component turned up `lists-nav.tsx`'s sidebar count badge —
identical colours, identical size, on screen constantly. It belongs to FEAT-009,
not this feature, but it is the same defect, and DEF-003 already recorded what
happens when a fix stops at the reported symptom. FEAT-009's own suites (`lists`
unit specs and `lists.spec.ts` e2e) are green at this commit; its badge is now
covered by the contrast guard below.

## Re-executed (2026-07-29, from `1294811`)

| Suite | Observed |
| :-- | :-- |
| api, serial (`--runInBand`) | **191 passed**, 31 suites |
| e2e (`npm run test:e2e`) | **19 passed** — 18 prior + the new DEF-004 guard |
| boundaries / lint / build | clean |

**The new test is the durable guard both contrast defects wanted.** It asserts a
**computed contrast ratio** read off the rendered element, not expected hex
values — so a future token change that keeps the rule stays green while one that
breaks it goes red, which a hardcoded-colour assertion could not tell apart. It
covers three surfaces: the upcoming chip (DEF-004), the overdue chip (DEF-003's
fix, guarded against regression while its neighbour was being edited), and the
sidebar badge (the second instance). It was **observed red at 4.34:1 before the
fix and green after** — the failing-test-first step the maintenance route
requires, which DEF-003 could not take because no harness for it existed.

Both themes were rendered and inspected: the upcoming chip reads clearly without
overpowering the row, and the overdue chip remains visibly more urgent through
its red tint and the word "Overdue". The hierarchy that the muted grey had been
carrying is now carried by size and tint instead of by low contrast — which is
the correct place for it.

## Findings (2026-07-29 re-verification)

- **Rework: none.** **Design defect: none.**
- **Minor, carried forward unchanged:** `apps/web` still has no unit-test runner.
  This fix narrows the gap's consequences — contrast is now assertable in
  Playwright, which is how the guard exists at all — but component state and
  failure modes still have no cheap home. Recorded against DEF-003/DEF-004 and
  FEAT-012's report.
- **Minor, new:** this feature's AC-14 names the overdue chip's colour treatment
  but no criterion ever covered the **ordinary** chip's presentation, which is
  why the audit that accepted this feature could not have caught DEF-004. Not
  worth a design amendment on a shipped feature; recorded so future ui-facing
  criteria name *every* variant of a component they constrain, not just the
  notable one.

## RTM (2026-07-29 re-verification)

No change. The Test ref already points at this report, and this dated section is
the record — the computed-verification rule the pipeline uses throughout.

---

# Re-verification — 2026-07-28 · Verdict: Accepted *(superseded, preserved)*

Both rework findings are resolved, verified against the specs that raised them
rather than against the rework's own description, and the full standard was
re-executed from the repo at `d19d45a`.

**R1 — resolved.** `task-detail-failure.tsx` now splits its states the way
ui-design.md §SCR-WEB-010 specifies and FEAT-010's accepted `list-view-failure`
demonstrates: `not-found` keeps a way-out link, `error` renders a **"Retry"
`button-tertiary`** (`data-testid="task-retry"`, transparent, `--color-primary`
text, no border) wired to `router.refresh()`. The manifest's entry for that
state — covered, 0 gaps, conformance `pass` — is now **true**, which was the
compounding half of the finding.

**R2 — resolved.** `detail-panel.tsx` now implements the modality it declares.
Tab and Shift+Tab wrap within the panel, with the tabbable set recomputed per
keypress (fields disable while saving and errors appear, so a cached list would
go stale), and focus is restored on unmount to the element that opened it,
guarded by `document.contains` for the case where the underlying row
re-rendered away.

**Re-audit of the new tests.** The focus-trap e2e is faithful and was
**mutation-checked independently**: neutering the trap while leaving Esc intact
fails exactly that test and nothing else (14 passed, 1 failed). R1's load-error
state remains without an automated test, and the rework says so plainly rather
than claiming coverage — it needs session-up-plus-task-fetch-failing, which
Playwright cannot reach because `fetchTask` runs server-side, and `apps/web`
has no unit-test runner. It was demonstrated through a throwaway fault-injecting
proxy (500 on `GET /tasks/:id`, session passed through): `task-error`,
`task-retry`, the copy, and a still-operable sidebar all render. That is an
honest demonstration of a state no current harness can automate, and the gap is
now carried as minor #1 below rather than silently closed.

**Anti-fake-green on the rework diff:** **0** deleted test lines, 0 skips, 0
`.only`s. Nothing was loosened to make this pass.

**Independent execution at `d19d45a`** — every result observed in this run:
`npm run db:migrate` at head · api **176 passed / 31 suites** (serial) · worker
**20 passed** · e2e **15 passed** · boundaries clean (122 modules) · lint clean ·
build clean.

Everything in the first pass's audit table, mutation matrix, and direct
verification still holds — the rework touched only two web components and one
spec file, and no API, schema, contract or criterion changed.

## Findings (re-verification)

**Rework: none. Design defect: none.**

**Minor (3), unchanged and non-blocking** — carried forward from the first pass:
`apps/web` has no test runner (which is what leaves R1's state demonstrated
rather than tested); the local-midnight due date that reads as a whole day but
behaves as an instant; and the carried repo-level debt (spec typing, Lucide,
`44` literals, FEAT-010's mobile composer gap).

**One new minor, recorded not acted on.** The rework noted that FEAT-010's
`list-view-failure.tsx` pairs `--color-danger` text on `--color-danger-subtle` —
the **3.95:1** combination this feature's design-system amendment was filed to
fix, now sitting in *accepted* code. Correctly left untouched under scope
discipline. It is a live AA contrast failure against design.md §5 on verified
behaviour, so it belongs on the **maintenance route as a defect row**, not in
this feature.

## RTM (re-verification)

**Written.** `features/FEAT-011-task-detail/acceptance-report.md` appended to the
**Test ref** of FR-TASK-004, FR-TASK-005, FR-TASK-006, FR-TASK-007 and
FR-TASK-008 — each fully implemented by this feature, so no `(partial)` marker.

---

# First pass — 2026-07-28 · Verdict: Rework *(superseded, preserved)*

## Verdict summary

The backend half of this feature is the strongest work in the repo so far: every
FR was observed behaving correctly against a running stack, all fourteen criteria
have tests, and independent mutation testing confirms those tests actually bite —
including the byte-identical-404 assertion that a naive test would have missed.
The suites are green in this run (api 176, worker 20, e2e 14), boundaries, lint
and build are clean, and NFR-PERF-001 measures two orders of magnitude inside its
bound.

The verdict is **Rework** on two **UI** findings, both of which are the code
failing to match its own registered screen spec rather than anything wrong with
the design. **R1**: SCR-WEB-010's `error` state is specified with a "Retry"
`button-tertiary` — the affordance FEAT-010's accepted `list-view-failure`
already implements — and ships with only a "Back to your tasks" link, while the
manifest records that state as covered with **0 gaps** and conformance **pass**.
**R2**: the detail panel declares `role="dialog" aria-modal="true"` but
implements neither the focus trap nor the focus restoration design.md §5 requires
of dialogs, and which ui-design.md itself claims it does — declaring modality
without implementing it actively misinforms assistive technology.

Both are small, specific and local to two web components. Nothing in the API, the
schema, the contracts or the criteria needs to change.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-004; UC-010 main 1 | `task-item.controller.spec` AC-1; `tasks.service.spec` AC-1 | faithful — all five details incl. `list.id === task.listId` | green |
| AC-2 | FR-TASK-005 → FR-TASK-002; UC-010 alt 3a | `tasks.service.spec` AC-2; `task-item.controller.spec` AC-2/AC-6, boundary | faithful — asserts the **stored** title unchanged after each rejection | green |
| AC-3 | FR-TASK-006 (set/change) | `tasks.repository.spec` AC-3; `tasks.service.spec` AC-1/AC-11 | faithful | green |
| AC-4 | FR-TASK-006 (clear); UC-010 alt 2a | `tasks.repository.spec` AC-4; `tasks.service.spec` AC-4; `task-item.controller.spec` AC-4 ×2; e2e UC-010 | faithful — absent-vs-null asserted at the row **and** over HTTP | green |
| AC-5 | FR-TASK-007 | `tasks.service.spec` AC-5 ×2, AC-14; `tasks.controller.spec` AC-10/AC-5; e2e UC-010 | faithful — full truth table incl. completed-past-due = **not** overdue | green |
| AC-6 | FR-TASK-008 | `tasks.repository.spec` AC-6 ×2; `tasks.service.spec` AC-6; `task-item.controller.spec` AC-2/AC-6 | faithful — default asserted **at the column**, CHECK asserted directly | green |
| AC-7 | technical-design D4 | `tasks.repository.spec` AC-7 ×2; `tasks.service.spec` AC-7 + materialized-DTO regression; `task-item.controller.spec` AC-7 | faithful — empty patch and unknown-key-only patch both 400, `updated_at` unmoved | green |
| AC-8 | FR-AUTHZ-002/003/005 | `tasks.repository.spec` AC-8; `tasks.service.spec` AC-8; `task-item.controller.spec` AC-8 | faithful — **byte-identical** via a one-element `Set` of serialized bodies, not merely same-shaped | green |
| AC-9 | FR-AUTHZ-001 | `task-item.controller.spec` AC-9 | faithful — missing **and** revoked cookie, both routes, nothing written | green |
| AC-10 | FR-TASK-006/008 at creation; UC-009 step 2 | `tasks.controller.spec` AC-10 ×5; e2e UC-009 step 2 | faithful — additivity verified as **95 insertions / 0 deletions** in FEAT-010's spec | green |
| AC-11 | NFR-LOC-001 | `tasks.repository.spec` AC-11; `tasks.service.spec` AC-11 | faithful — `+05:00` stored as the same instant, read back UTC | green |
| AC-12 | NFR-PERF-001 | `task-item.controller.spec` AC-12 | faithful — GET 2 / PATCH 1 statement, guard's own two filtered out by table | green |
| AC-13 | NFR-USE-003; UC-010 main 1 | e2e AC-13 (save error), e2e not-found, e2e UC-010 (viewing/editing) | **partially faithful** — `viewing`, `editing`, save-`error` and `not-found` are covered; the **load-error** state is neither tested nor implemented to spec → **R1** | 4 of 5 green |
| AC-14 | list-view integration | `tasks.service.spec` AC-14; e2e UC-010 | faithful — chip carries the **word** "Overdue"; regression-guards the `.map` index bug | green |

## Corrected tests

**None.** No test was found weak enough to require correction. The anti-fake-green
review found **zero** skips, `.only`s, stubbed behaviour, or loosened assertions
across 1,274 added test lines; the single deleted line in the whole test diff is
an `import` widened to a multi-symbol import. The two `jest.spyOn` uses observe
and call through (no `mockImplementation`/`mockReturnValue`) and are restored.

Test strength was verified by **independent mutation testing** rather than by
reading, since a test that never fails proves nothing:

| # | Mutation to production code | Expected to break | Result |
| :- | :-- | :-- | :-- |
| M1 | `isOverdue` drops the `completedAt === null` clause | AC-5 | ✅ 1 failed |
| M2 | `update` skips `normalizeTitle` | AC-2 | ✅ 1 failed |
| M3 | service priority validation disabled | AC-6 | ⚠️ contract spec **survived** — the DTO's `@IsIn` catches it one layer earlier, so the criterion still holds at the contract; the service spec **does** catch it (M3b, 1 failed). Defence-in-depth, both layers covered. |
| M4 | empty patch accepted instead of 400 | AC-7 | ✅ 1 failed |
| M5 | not-found message varies per path | AC-8 | ✅ 1 failed — the byte-identical assertion earns its keep |
| M6 | repository always writes `due_at` | AC-4/AC-7 | ✅ 3 + 1 failed |

## Independent execution

Everything below was run in this audit from the repo at `db94955`; no reported
green was carried over.

- `npm run db:migrate` — at head, migration 009 applied, no pending work.
- `npm test -w @todo/api -- --runInBand` — **176 passed / 31 suites** (serial, per
  the DEF-002 workaround).
- `npm run test -w @todo/worker` — **20 passed / 6 suites**.
- `npm run test:e2e` — **14 passed**, including FEAT-009's and FEAT-010's specs
  unchanged, and the intercepted-panel-vs-full-page check.
- `npm run boundaries` — clean, 122 modules; no `modules/tasks → modules/lists`
  import.
- `npm run lint`, `npm run build` — clean.
- Flakiness: no failures observed in this audit's runs. **DEF-002 remains open**
  and is not affected either way by this feature; the implementation's own three
  green parallel runs are correctly recorded there as statistically unremarkable.

## Direct verification

Observed against a live API + Postgres, beyond what the suites assert:

- **FR-TASK-008 default** — a task created with no priority stores `none` and
  `due_at IS NULL`, read straight from the table.
- **FR-TASK-006 set → change → clear** — three PATCHes, each result read from the
  column: `2026-12-25 09:00:00+00` → `2027-01-05 18:30:00+00` → `NULL`.
- **FR-TASK-007 truth table** — past+active → `isOverdue true`; the same row
  completed → `false` **with its due date intact** (the indication goes, not the
  data); future+active → `false`.
- **NFR-PERF-001** (Must; 300 ms server-side) — 20 samples each against a list of
  **501** tasks: `GET /tasks/{id}` mean **2 ms** / max 10 ms; `PATCH /tasks/{id}`
  mean **4 ms** / max 8 ms; `GET /lists/{id}/tasks` mean **4 ms** / max 8 ms.
  *Indicative only* — local Docker Postgres on a developer machine, not the Cloud
  Run + Supabase target.
- **NFR-LOC-001** — verified by AC-11's tests plus the column type (`timestamptz`).
- **Screen spot-check against the manifest** — SCR-WEB-010's `viewing`, `editing`
  and `not-found` render as registered; SCR-WEB-008's row cluster renders the chip
  with `var(--color-danger-subtle)` / `var(--color-danger-text)` and the priority
  dot with `var(--priority-high)` — tokens, not raw values, and the amended
  danger pairing is in use. The `error` state is **R1**.

**Pending environment:** NFR-PERF-001's real-infrastructure figure (Cloud Run +
Supabase, p95 at load) — the local measurement above is not a substitute; it would
be verified by the first deploy plus load sampling.

## Findings

### Rework (2)

**R1 — SCR-WEB-010's load-`error` state is missing its specified Retry
affordance, and the manifest claims otherwise.**
- *Where:* `apps/web/src/components/task-detail-failure.tsx`.
- *Faithful expectation:* `ui-design.md` §SCR-WEB-010 `error` — *"A failed load
  renders an `inline-alert` (`--color-danger-subtle`) in the panel — 'Couldn't
  load this task.' — with a **'Retry' `button-tertiary`**"*. The convention is
  established and accepted: FEAT-010's `list-view-failure.tsx` ships exactly this
  as `data-testid="list-retry"`.
- *Observed:* the component renders the alert and a `Link` to `/` labelled "Back
  to your tasks". There is no retry control, so recovering from a transient fetch
  failure requires navigating away and back.
- *Compounding:* `docs/design-manifest.json` records SCR-WEB-010 `states.covered`
  including `error`, `states.gaps: []`, and `conformance.result: "pass"`. That is
  a false entry in the registry other features are told to trust. Either the code
  gains the Retry (preferred — it matches the accepted precedent) or ui-design
  amends the spec and the manifest records a gap; it may not stay as-is.
- *Also uncovered:* no test exercises this state. A test should accompany the fix.

**R2 — the detail panel declares modality it does not implement.**
- *Where:* `apps/web/src/components/detail-panel.tsx`.
- *Faithful expectation:* design.md §5 — *"Focus is trapped in dialogs and
  restored on close"* — and §4 `dialog`/`modal` — *"focus-trapped"*.
  `ui-design.md` §SCR-WEB-007 repeats the claim: *"Esc closes it from anywhere in
  the shell, and focus returns to the row that opened it"*.
- *Observed:* the element sets `role="dialog"` and `aria-modal="true"`, moves
  focus into the panel on mount, and closes on Esc/scrim — but there is **no focus
  trap** (Tab walks out into the list behind the scrim) and **no focus
  restoration**; the source comment asserts *"the browser does the restoring,
  because closing is a router.back()"*, which is an assumption, not a mechanism,
  and is not what browsers guarantee.
- *Why it matters beyond pedantry:* `aria-modal="true"` tells a screen reader the
  rest of the page is inert. It isn't. A control that misreports itself to
  assistive technology is worse than one that makes no claim — the same principle
  FEAT-010 D2 applied when it refused to render a checkbox that completes nothing.
- *Either* implement the trap and restoration, *or* drop `aria-modal`/`role`
  down to a non-modal complementary region and reconcile ui-design.md. The first
  is what the spec asks for.

### Design defect (0)

**None.** The criteria were cross-checked against their verbatim FR statements and
UC-010's flows and were found faithful. Two corrections the implementation made to
the design during the build (AC-12's statement count, and D4's `in` →
`!== undefined` encoding) were re-derived here from the sources and are **correct**
— both are recorded in technical-design §8 with their reasoning, which is the
right handling.

The design's central claim — D1, that overdue is timezone-invariant because
`due_at` is an absolute instant — was audited against FR-TASK-006/007's
"in the user's timezone" wording and **holds**: comparing two instants gives the
same answer in every zone, and the SRS's own FR-PROF-003 note makes
browser-detected the user's timezone until FEAT-008 stores one. The e2e exercises
the round trip (local wall-clock in → correct overdue out) in both directions.

### Minor (3) — not blocking

1. **`apps/web/src/lib/due-date.ts` has no unit tests.** It carries real logic —
   calendar-day arithmetic (deliberately not millisecond division), local-midnight
   time suppression, and both directions of the `datetime-local` ↔ ISO conversion.
   No acceptance criterion depends on the *formatting* (only on the word
   "Overdue", which e2e covers), so this does not block; but `apps/web` has no
   test script at all, and this is the first web module with logic worth testing.
   Worth raising as engineering-foundations work rather than a feature fix.
2. **A due date set to local midnight reads as a whole day but behaves as an
   instant.** `formatDueDate` deliberately hides a 00:00 time ("Today", not "Today
   at 12:00 AM"), so such a task displays "Today" while already being overdue.
   Not an FR violation — FR-TASK-006 specifies a date *and time*, and the user set
   midnight — but it is the seam where a future date-only due date would land.
   Recorded for FEAT-016's date bucketing, which will meet the same question.
3. **Carried, unchanged, not this feature's:** the `apps/api/tsconfig.json`
   spec-typing debt (one pre-existing error in `change-password.controller.spec`,
   confirmed present before this feature), the unwired Lucide icon library, the
   hard-coded `44` touch-target literals, and FEAT-010's recorded mobile
   bottom-anchored composer gap — which this feature correctly left open rather
   than half-closing.

## RTM

**Not written — verdict Rework.** Test ref stays `_TBD_` for FR-TASK-004..008
until a re-verification accepts the feature.
