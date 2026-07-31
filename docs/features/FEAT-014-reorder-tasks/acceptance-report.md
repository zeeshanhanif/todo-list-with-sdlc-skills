# Acceptance Report: FEAT-014 — Reorder active tasks within a list

> Verdict: **Rework** · Date: 2026-08-01
> Standard: technical-design.md §6 @ `83b2ea9` · Sources: docs/srs.md (FR-TASK-012,
> NFR-PERF-001, NFR-USE-003, NFR-USE-004), docs/use-cases.md (UC-010),
> docs/design.md §4/§5, docs/design-manifest.json (SCR-WEB-008)
> Repo state audited: `f544412` (feature head `968f8b7` + this audit's test corrections)

## Verdict summary

The feature's substance holds up: the manual order persists, it is genuinely
server-side (a second, independently issued session reads it cold), the
migration reproduces today's order exactly, and the endpoint is far inside its
performance budget. Three mutation checks confirmed the tests fail when the
behaviour breaks, so the greens are real greens. **Two rework findings block
acceptance, both on the presentation half and both small and specific:** the
reorder controls are 40px where AC-12 explicitly requires the 44px touch
target, and a no-op drag spends a write and announces a move that never
happened. Neither touches the API, the schema or the data — this is a
finish-the-affordance verdict, not a redesign one. Three test defects found and
corrected by this audit (AC-5 weakened, the drag path uncovered, AC-14
uncovered); the fourth new drag test is left **red on purpose** as the
executable work order for finding 2.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-012 (reorder + persist); UC-010 main 2–3 | `tasks.service.spec` AC-1, `tasks.controller.spec` AC-1, `e2e/reorder-tasks` | faithful — asserts a **fresh read**, not the echo | green |
| AC-2 | FR-TASK-012 ("across devices") | `tasks.controller.spec` AC-2, `e2e/reorder-tasks` | faithful — second session issued independently; E2E reload | green |
| AC-3 | FR-TASK-012 note (new tasks appended) | `tasks.repository.spec` AC-3, `tasks-lists-integration` AC-3/AC-8, `e2e` | faithful | green |
| AC-4 | FR-TASK-012 (idempotent, dense) | `tasks.service.spec` AC-4 | faithful — asserts stored positions, not just the body | green |
| AC-5 | FR-AUTHZ-002/003 (uniform refusal) | `tasks.service.spec` AC-5, `tasks.controller.spec` AC-5 | **was weak → corrected** (see below) | green |
| AC-6 | FR-AUTHZ-002/003 (uniform 404) | `tasks.service.spec` AC-6, `tasks.controller.spec` AC-6 | faithful — compares **serialized bodies**, not just codes | green |
| AC-7 | FR-AUTHZ-001 | `tasks.controller.spec` AC-7 | faithful — asserts nothing written | green |
| AC-8 | FR-TASK-003/009/011, FR-LIST-005 (no regression) | `tasks.repository.spec` AC-8, `tasks-lists-integration` AC-3/AC-8, `e2e` | faithful | green |
| AC-9 | FR-TASK-010 (no regression) | `tasks.repository.spec` AC-9, `tasks-lists-integration` AC-9 | faithful — tie constructed so the reopened task lands **first**, which no append rule could produce | green |
| AC-10 | FR-TASK-014 (no regression) | `tasks.repository.spec` D5, `tasks-lists-integration` AC-10 | faithful | green |
| AC-11 | NFR-PERF-001 | `tasks.controller.spec` AC-11 + direct measurement | faithful | green — measured below |
| AC-12 | NFR-USE-004; design.md §5 | `active-tasks.spec` ×5 + drag ×4 | keyboard clauses faithful and green; **the 44px-target clause fails** | **RED (finding 1)**; drag no-op **RED (finding 2)** |
| AC-13 | FR-TASK-012 (migration) | direct SQL verification | faithful | green — 3,809 rows / 799 lists, 0 mismatches |
| AC-14 | FR-SRCH-001..008 (no regression) | `tasks-lists-integration` AC-14 | **was uncovered → added** | green |
| AC-15 | NFR-USE-003 | `active-tasks.spec` AC-15 ×3 | faithful — rollback asserted on 400, network error, and drag | green |

**Standard audit (the criteria themselves).** FR-TASK-012's two clauses and its
"new tasks appended" note are each covered (AC-1/AC-2/AC-3); UC-010's organize
path is represented; the binding NFRs appear as AC-11/AC-12/AC-15. No missing
or misencoded criterion — **no design-defect finding.** One observation: AC-12
bundles four distinct obligations (keyboard, names, target size, focus ring)
into one criterion, which is why a build could satisfy three and still fail it.
Not a defect, but future criteria of this shape are easier to audit split.

## Corrected tests

1. **AC-5 (`tasks.controller.spec`) — weakened assertion.** Asserted
   `messages.size <= 2` over a mixed set of service and DTO failures. AC-5
   requires a *single, identical* message across its seven enumerated vectors;
   `<= 2` would pass a build that distinguished "completed task" from "unknown
   id" — the existence oracle the uniform message prevents. Corrected to
   exactly one message across all seven (adding the four absent fixtures:
   completed, soft-deleted, other-list, other-user), with the DTO's shape
   message asserted separately. Commit `f544412`.
2. **The drag path — no coverage at all.** ui-design D1 specifies three
   affordances; only two were tested. Four tests added covering the drop
   semantics in both directions and the no-op cases. Commit `f544412`.
3. **AC-14 — no coverage.** The implementation's evidence was "the search and
   views suites are green", which does not test the criterion: those suites
   never reorder anything. Added a test that reverses a list's order and
   re-reads `/search` and `/views/all`. Commit `f544412`.

**Anti-fake-green review of the feature's test diff (`a678001`…`968f8b7`):** no
skips, no `todo`s, no deleted cases, no behaviour-under-test mocked. Two
declared test edits, both examined and both sound: the AC-9 expectation
corrected toward the design (the tie-break direction, with the shape sharpened
so an append could not satisfy it), and `search.service.spec`'s exhaustive
key-set assertion extended with `position` — which is D8 landing as designed
and is that assertion's purpose. **Both declared in their commit messages
before this audit looked**, which is the behaviour the rule wants.

## Independent execution

All from `f544412`, with the harness's own commands.

| Run | Command | Observed |
| :-- | :------ | :------- |
| Migrations | `node-pg-migrate down` + `npm run db:migrate` | clean both ways, twice |
| api | `npm test -w @todo/api -- --runInBand` | **441 passed, 1 failed** / 442 |
| web | `npm test -w @todo/web` | **75 passed, 1 failed** / 76 |
| worker | `npm test -w @todo/worker` | 24 passed |
| e2e | `npm run test:e2e` | **46 passed, 1 failed** / 47 |
| lint / boundaries / build | `npm run lint` · `boundaries` · `build` | clean · clean (190 modules) · clean |

**Mutation checks** (a test never seen to fail is unverified verification):
removing `position` from the active `ORDER BY` → 10 failures; accepting a
subset vector (dropping the set-size check) → 2 failures; filtering the append's
`MAX(position)` to active rows → 2 failures. All restored. The suite has real
teeth.

**The three failures, classified:**
- `active-tasks.spec` drag no-op — **this feature's defect**, finding 2 below.
- `views.service.spec` timezone AC-2 and `smart-views.spec` UC-014 — **not this
  feature's, and pre-existing.** The first was reproduced at `cf89857` in a
  clean worktree before FEAT-014 existed. The second is diagnosed to the data:
  its fixture seeds a task at `now() + 5 hours`, which at 20:34 UTC lands
  tomorrow, so FR-SRCH-008's Today view correctly excludes it — the product is
  right and the fixture assumes ≥5 hours remain in the UTC day. One root cause,
  two symptoms, both wall-clock dependent. Independently confirmed by this
  audit; routed to the maintenance path, and **not** counted against FEAT-014.

## Direct verification

- **FR-TASK-012, "persist across devices"** — observed, not inferred: a second
  session issued by a separate `POST /auth/login`, never party to the write,
  read the new order on its first `GET`. The E2E's reload proves the order is
  not in React state; this proves it is not in the session either.
- **AC-13 / the migration** — verified against real data through a full
  down/up cycle: for every list, the backfilled position order is identical to
  the pre-migration `created_at ASC, id ASC` order. **3,809 rows across 799
  lists, 0 mismatches.**
- **NFR-PERF-001 (AC-11), measured** — 50-task list, 40 samples each, against
  the local stack: `POST …/tasks/reorder` **p95 5.9 ms** (max 8.1),
  `GET …/tasks` **p95 2.4 ms** (max 2.7), against a 300 ms bound. `EXPLAIN
  ANALYZE` shows an index scan on `tasks_owner_list_idx` feeding a 50-row
  quicksort, 0.117 ms execution — exactly D9's prediction, so **D9's "no index"
  decision is confirmed by measurement rather than assumption.** *Environment
  caveat: a local Docker Postgres on a developer machine; indicative of the
  query shape, not of production latency under load.*
- **Contracts vs technical-design §3** — `POST /lists/{listId}/tasks/reorder`
  matches as designed: 200 carrying the full `ListTasksResponse`, 400
  `validation_failed` on `taskIds`, 404 `list_not_found`, 401. `HttpCode(200)`,
  route on the collection sub-path, `ChangeSignalInterceptor` inherited from the
  class so a successful reorder publishes and a rejected one does not.
- **Screens vs the manifest** — SCR-WEB-008's entry claims the handle composes
  design.md §4's `icon-button` with existing tokens and no new component.
  Verified by inspection: **no raw values** in `active-tasks.tsx` or
  `task-row.tsx`; the dragged row uses `--color-surface-sunken` and the drop
  edge the `--color-primary` accent bar, both existing treatments. The `moving`
  state the entry newly claims does render (test-verified). The filed §4 prose
  amendment (handle at `≥lg`) remains open with ux-foundations and blocks
  nothing.

## Findings

### Rework (2)

**R1 — AC-12: the reorder controls are 40px, not the 44px touch target the
criterion requires.**
*Where:* `apps/web/src/components/active-tasks.tsx:316-317` (`iconButton`), used
by the handle and both move buttons.
*The criterion:* "…and its controls carry accessible names, **meet the 44px
touch target**, and show the focus ring." design.md §5 Targets: "≥ 44×44px on
touch viewports"; §4 `icon-button`: "40px (44px touch) square".
*Observed:* `minWidth`/`minHeight: var(--size-control-md)` = **40px**, with no
coarse-pointer rule anywhere in the app, so the control is 40×40 on every
viewport including touch. The accessible names and the focus ring (observed
rendered) are fine — this clause alone fails.
*Corroboration:* `task-row.tsx`'s own comment already claims "the checkbox's and
the handle's own **44px** targets", so the code contradicts its own
documentation.
*The codebase's answer:* `detail-panel.tsx:126-127` sizes its icon-button with
`var(--size-touch-target)`. One token swap, scoped to this feature's controls.
*Not asked for here:* `lists-nav.tsx:385-386` has the same 40px icon-button and
is out of this feature's scope — recorded as minor M1 for the product-wide pass.

**R2 — a no-op drag spends a write and announces a move that never happened.**
*Where:* `apps/web/src/components/active-tasks.tsx:120-131` (`dropOn`).
*The spec:* ui-design's populated state — "**Every completed move** is
announced… reads *'Moved 'Buy milk' to 2 of 5.'*" — and AC-12, for which that
announcement is "the only feedback a keyboard or screen-reader user gets".
*Observed:* dropping a row onto the row immediately after it produces the
correct unchanged order, but `fromIndex === targetIndex` is the only guard, so
`fromIndex=0, targetIndex=1` proceeds: it POSTs the unchanged vector **and**
announces "Moved alpha to 1 of 3." to the `aria-live` region. A screen-reader
user is told a move happened when nothing moved — a false statement to exactly
the users who cannot see that nothing changed. (Server-side it is harmless: the
rewrite is idempotent.)
*Failing test, already written:* `active-tasks.spec.tsx` — "UC-010 main 2:
dropping a row on itself, or on the row just after it, changes nothing".
*Faithful expectation:* a drop whose resulting order equals the current order is
a no-op — no request, no announcement. A guard comparing the computed `next`
against `rows` covers both this case and any future equivalent.

### Design defect (0)

None. The criteria cover their sources faithfully; the schema stayed inside the
Task entity; §8's escalations were filed rather than worked around.

### Minor (3) — not blocking

- **M1 — the 40px icon-button is product-wide.** `lists-nav.tsx`'s row menu
  trigger and "New list" button have the same shortfall R1 names, shipped since
  FEAT-009. This is the DEF-005 shape: an accessibility pass across the web
  tier, not per-feature rework. Recommend a defect-ledger row rather than
  reopening FEAT-009.
- **M2 — two pre-existing time-dependent test failures** (`views.service.spec`
  AC-2, `smart-views.spec` UC-014), one root cause, diagnosed above. They will
  fail in CI for part of every day. Recommend one defect-ledger row and a fix
  that pins the clock or seeds relative to the *end* of the UTC day.
- **M3 — AC-12 bundles four obligations into one criterion.** It was satisfiable
  in three of four respects while failing, which made the failure easy to miss
  (the implementation's own gate did). Splitting target-size and focus-ring
  clauses out in future features would make this class of gap visible at a
  glance.

## RTM

**Not written — verdict Rework.** `FR-TASK-012`'s Test ref stays `_TBD_`;
Design ref (both design documents) already landed at `83b2ea9`.
