# Acceptance Report: FEAT-013 — Delete / restore task (soft-delete + undo)

> Verdict: **Accepted** · Date: 2026-07-29
> Standard: technical-design.md §6 (AC-1..AC-12, incl. AC-9b) · Sources:
> docs/srs.md, docs/use-cases.md, docs/design.md, docs/ux-foundations.md,
> docs/features/FEAT-013-delete-restore/ui-design.md, docs/design-manifest.json
> Repo state audited: `54a409b` (implementation head `418b6e0` + this skill's
> two test corrections)

## Verdict summary

FEAT-013 is **accepted**. All thirteen criteria hold under observation, every
suite was re-run fresh from the repo state (api 209 serially **and** in
parallel, worker 20, e2e 24, lint, boundaries, build), migrations apply clean
into an empty database and add nothing — confirming D8's claim that
`tasks.deleted_at` and its partial index have belonged to migration 007 since
FEAT-009. Two criteria were **claiming coverage they did not have** and were
corrected before execution (§Corrected tests); both passed on the first run
afterwards, which is the right shape — the code was already right, the
measurement was not.

Three behaviours that looked like defects during the audit were chased to
ground and are **not** defects: a "stuck" detail after a rapid second click is
the deleted row being clicked before the list re-renders, answered by the
uniform not-found (FR-AUTHZ-003, exactly as designed); a snackbar naming the
previous deletion was the previous snackbar element read before React
re-rendered; and `isOverdue: true` inside a delete response is the single
derivation behaving correctly on a row whose due date has passed. Each is
recorded under Findings → minor so the next auditor does not re-derive them.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-013; UC-012 main 1/2 | `tasks.repository.spec` FEAT-013 AC-1; `tasks.service.spec`; `task-item.controller.spec` FEAT-013 AC-1/AC-2 | faithful | green |
| AC-2 | FR-TASK-013 ("removed from normal views"), FR-AUTHZ-005 | `task-item.controller.spec` (4 sibling routes → byte-identical 404, row present); `tasks-lists-integration.spec` | faithful | green |
| AC-3 | FR-TASK-014; UC-012 main 3/4 | repository (completed restores completed), service (overdue re-derives), controller, integration (original section + created_at position), `delete-restore.spec` | faithful | green |
| AC-4 | idempotency, D3 (FR-TASK-015's clock) | repository (asserted **at the row**), service, controller (byte-identical `deletedAt`) | faithful | green |
| AC-5 | FR-LIST-005 (must not regress) | `tasks-lists-integration.spec` FEAT-013 AC-5 (both count surfaces; completed-delete moves neither) | faithful | green |
| AC-6 | FR-AUTHZ-002/003/005 | repository, service, controller — incl. **another owner's already-deleted task**, the case restore could have leaked | faithful | green |
| AC-7 | FR-AUTHZ-001 | `task-item.controller.spec` FEAT-013 AC-7 (both routes, nothing written) | faithful | green |
| AC-8 | NFR-PERF-001 | `task-item.controller.spec` FEAT-013 AC-8 (exactly one query per route, < 300 ms) | faithful | green |
| AC-9 | FR-TASK-013 through the UI; SCR-WEB-010 | `delete-restore.spec` (button-danger colours, last in DOM, panel closes, no navigation) | faithful | green |
| **AC-9b** | **NFR-USE-002** (the literal reading, D2) | `delete-restore.spec` — **corrected**: the focus **trap** was unasserted | was weak → corrected | green |
| AC-10 | FR-TASK-014 through the UI; NFR-USE-003; SCR-WEB-008 | `delete-restore.spec` (aria-live, no focus steal, Tab reaches Undo, restore + counts, ~7 s dismissal, survives the panel closing) | faithful | green |
| AC-11 | NFR-USE-003, NFR-REL-004 | `delete-restore.spec` (500 on DELETE keeps dialog + task; 500 on restore keeps snackbar + action) | faithful | green |
| AC-12 | FR-TASK-013 vs FR-TASK-015 | `delete-restore.spec` — **corrected**: only the row's survival was asserted, not that restore still succeeds | was weak → corrected | green |

Criteria-vs-source check (Phase 2): FR-TASK-013 and FR-TASK-014 are each
covered by several criteria and encoded faithfully, including FR-TASK-014's
two distinct clauses ("undo affordance provided immediately after deletion" →
AC-10; "restore available until purge" → AC-12). UC-012's main 1–4 map to
§3's behaviours; alternate 3a's purge half is correctly out of scope
(FEAT-020). **NFR-USE-002 is now satisfied literally** — the fork the design
recorded in D2 was resolved by the product owner on 2026-07-29 toward the
SRS's own text, and AC-9b encodes it.

## Corrected tests

Two, committed as `54a409b` — both toward the criterion, never toward the code:

1. **AC-9b — the focus trap was not asserted.** The spec checked that the
   confirm button *receives* focus and stopped there, so a dialog whose trap
   was broken would still have passed while the criterion says focus is "moved
   into it **and trapped**". The spec now tabs past the last control and
   asserts focus stays inside the dialog.
2. **AC-12 — the weaker half was the only half asserted.** The spec proved the
   row survives the snackbar's expiry but not the criterion's second clause,
   that `POST /tasks/{id}/restore` **still succeeds** afterwards — which is the
   entire point: expiring the affordance must not end the recoverability. The
   spec now restores through the contract after the window closed and sees the
   task return to the list.

Anti-fake-green review of the feature's whole test diff (`507df27..HEAD`,
1197 insertions across 7 spec files): **no** skipped, `.only`, `todo`,
deleted or loosened assertions. The single removed line is a helper's `SELECT`
that was **widened** to project `deleted_at`, `list_id` and `created_at` — a
strengthening, and the assertions built on it are new.

## Independent execution

Every result below was produced in this run; nothing was taken from tasks.md,
the implementation's summary, or its commit messages.

| Suite | Command | Result |
| :-- | :-- | :-- |
| api | `npm test -w @todo/api -- --runInBand` | **209 passed**, 31 suites |
| api (parallel) | `npm test` | **209 passed** — a green parallel run, DEF-002 notwithstanding |
| worker | `npm test -w @todo/worker` | **20 passed**, 6 suites |
| e2e | `npm run test:e2e` | **24 passed** (21 inherited + 3 new), exit 0 |
| boundaries | `npm run boundaries` | clean, 128 modules |
| lint | `npm run lint` | clean (web + api) |
| build | `npm run build` | clean (shared, tokens, api, worker, web) |

**Migration check.** `migrations/` is byte-identical to FEAT-012's head
(`git diff 507df27..HEAD -- migrations/` → 0 files) and `npm run db:migrate` is
a no-op at head. Applied from scratch into a **fresh database** (`todo_audit`):
all 9 migrations ran clean and `\d tasks` shows `deleted_at timestamptz` plus
`tasks_active_by_list_idx … WHERE completed_at IS NULL AND deleted_at IS NULL`.
D8's "no migration, and that is the design" is confirmed independently.

**No hard delete.** `DELETE FROM tasks` appears nowhere in `apps/api/src` or
`apps/worker/src` — the row survives its own deletion, which is what separates
FR-TASK-013 from FR-TASK-015.

**Harness note (not a regression).** The first full E2E attempt failed 22 of 24
with `Expected: 201, Received: 429` — the per-IP register limiter exhausted by
the session's manual runs from `::1`, the standing trap FEAT-009's acceptance
recorded. Cleared `auth_rate_buckets` for localhost and re-ran; green. The
specs' own fixture assertions named the cause immediately, which is DEF-002's
prescribed practice paying for itself.

## Direct verification

Observed against the live stack, outside the test suites:

- **FR-TASK-013** — `DELETE /tasks/{id}` on a high-priority, past-due task
  returned `200` with `deletedAt: 2026-07-29T13:04:41.406Z`; the list view then
  reported `active 0, completed 0, activeTaskCount 0, **taskCount 1**`; the row
  was still in Postgres with `deleted_at` set. Removed from view, retained
  recoverable — both halves of the FR observed, not inferred.
- **Idempotency / the retention clock (D3)** — a second `DELETE` a second later
  returned the **byte-identical** instant (`…41.406Z`), so a double-tap cannot
  extend the 30-day window FEAT-020 will read.
- **FR-TASK-014** — `POST …/restore` returned the task with `listId` unchanged,
  `completedAt: null`, `priority: high`, `dueAt` intact and `isOverdue: true`
  (correctly re-derived); the list view showed it back with
  `activeTaskCount 1`. "Original list **and** status" observed.
- **NFR-PERF-001 (indicative, local stack)** — 40 calls (20 delete + 20
  restore): min 1.7 ms, p50 3.9 ms, **p95 5.3 ms**, max 6.0 ms against the
  300 ms bound. Environment caveat: local Docker Postgres, no network, no load.
  The production-representative measurement remains **pending environment**, as
  for every prior feature.
- **NFR-USE-002** — the confirm dialog was exercised by hand and by spec: Esc,
  Cancel and scrim each close it with **no request sent** and the row untouched.
- **Screen conformance spot-check** (the manifest's claims, re-measured in the
  browser rather than trusted): the dialog's error slot renders
  `rgb(153,27,27)` on `rgb(254,226,226)` = **6.80:1** (needs 4.5:1) — it did
  **not** inherit the DEF-006 pairing it was specified against; the Cancel
  button's boundary renders `rgb(100,116,139)` on white = **4.76:1** (needs
  3:1), conforming to the DEF-005 control-boundary rule. The manifest's
  `confirming` state and both new contract bindings resolve.

## Findings

**Rework: none.**

**Design defect: none.**

**Minor** (recorded, none blocking acceptance):

1. **Two documentation escalations remain open**, both filed by ui-design and
   neither affecting built behaviour: design.md §4's `button-danger` still says
   "white text" (2.77:1 on the dark theme's `--color-danger`; the code correctly
   uses `--color-on-primary`, measured 6.12:1), and ux-foundations §A5 + Flow 3
   still draw the snackbar-only delete flow that the D2 ruling superseded.
   Owner: ux-foundations' amendment path. Recommended before the next feature
   reads either document as authority.
2. **ui-design's `### empty` is factually wrong about inherited behaviour.** It
   says SCR-WEB-018's first-run copy is *not* shown when the last task of a
   single-list account is deleted; it **is**, because FEAT-010's `isFirstRun`
   tests the account's shape rather than its history. The behaviour is
   FEAT-010's and unchanged here; the sentence is the error. Owner: ui-design,
   a one-line correction.
3. **Only one undo is held at a time.** A second deletion inside the ~7 s window
   replaces the first snackbar; Undo then acts on the most recent deletion
   (verified: deleting "First" then "Second" and pressing Undo restored
   "Second"). The earlier deletion stays recoverable in the API for 30 days but
   has no UI path — the same gap ui-design D7 already records for the expired
   snackbar. No criterion requires a queue; recorded as a candidate post-MVP
   requirement rather than a defect.
4. **A deleted row stays clickable for the moment before the list re-renders**,
   and clicking it lands on the uniform not-found panel ("That task doesn't
   exist."). Correct per FR-AUTHZ-003 and arguably the best available answer —
   noted because it looks like a bug under automation and cost this audit a
   detour.
5. **`isOverdue` is `true` inside the delete response** for a past-due task,
   since the single derivation asks about completion and due date and a delete
   changes neither. Harmless — no surface renders a deleted task — and correct
   on restore. Noted, not changed.
6. **`apps/web` still has no unit-test runner.** FEAT-012 predicted this feature
   would be the fourth case, and it was: the undo host is a stateful island with
   a timer whose only harness is Playwright, which is why AC-10's timing and
   AC-11's failure paths cost E2E rather than unit tests. Engineering-foundations
   item; recommended before FEAT-015's search overlay makes it a fifth.
7. **DEF-002 and DEF-006 remain open** in `docs/defects.md`. DEF-002 shaped how
   these suites were run (serially, with a parallel confirmation); DEF-006 is
   pre-existing and belongs to four other features — FEAT-013's own dialog was
   specified and verified against the correct token, as measured above.

## RTM

Test ref appended for both implemented FRs:

- **FR-TASK-013** → `features/FEAT-013-delete-restore/acceptance-report.md`
- **FR-TASK-014** → `features/FEAT-013-delete-restore/acceptance-report.md`

Neither is partial: the plan's FEAT-013 row carries both FRs whole, so these
two rows now read Plan ref → Design ref → Test ref end to end. FR-TASK-015
(purge) stays `_TBD_` and belongs to FEAT-020, exactly as the plan says.
