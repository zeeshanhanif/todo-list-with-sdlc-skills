# Acceptance Report: FEAT-009 — List management

# Re-verification — 2026-08-01 · Verdict: Accepted (unchanged) · after the DEF-011 fix

**One line of FEAT-009 code changed:** `lists-nav.tsx`'s shared `iconButton`
style now sizes on `--size-touch-target` (44px) instead of `--size-control-md`
(40px), affecting the list-row menu trigger and the "New list" button.
design.md §4 specifies `icon-button` as "40px (**44px touch**)" and §5 requires
≥ 44×44 on touch viewports, but no coarse-pointer rule exists anywhere in
`apps/web`, so the touch size had never been implemented — the controls were
40px on every viewport since this feature shipped. Found by FEAT-014's
acceptance run, whose AC-12 names the 44px target explicitly.

**Verdict unchanged: Accepted.** No FEAT-009 acceptance criterion is affected —
the controls' behaviour, labels, states and contrast are untouched; only their
minimum box grew by 4px. Nothing else in the sidebar moved: the rows already
had `--size-touch-target` minimum height.

**Re-executed (2026-08-01, from `3fd7619`):** api **442/442**, web 76/76,
worker 24/24, e2e **48/48** including `lists.spec`, lint · boundaries · build
clean. The fix is now guarded permanently by `e2e/tests/touch-target.spec.ts`,
which measures rendered bounding boxes at a phone viewport. See docs/defects.md
DEF-011.

> Verdict: **Accepted** · Date: 2026-07-27
> Standard: technical-design.md §6 (AC-1..AC-13) · Sources: docs/srs.md (FR-LIST-001/002/004..009, FR-AUTHZ-001..005, NFR-USE-002, NFR-PERF-001), docs/use-cases.md (UC-008)
> Repo state audited: `2d7dac1` (feature range `cc7e1bc`..`2d7dac1`)

## Verdict summary

FEAT-009 is **accepted**. The standard was re-derived from the SRS statements and
UC-008's flows before any test was read: all eight FR-LIST requirements in the
feature's trace carry at least one criterion, every UC-008 path — main 1–5,
alt 3a, alt 4a, exc-4b — is represented, and the criteria encode their sources
faithfully. Every criterion is covered by a test that asserts what the criterion
actually claims; two mutation checks confirmed the subtlest assertions (the
no-N+1 guarantee and the uniform-404 ownership property) genuinely fail when the
behavior breaks. One test was **rejected and corrected**: AC-12's E2E asserted
only half of a two-part criterion (see below). All suites were run fresh from the
audited commit and observed green, migrations were applied to a **fresh
database**, and the contracts, the FR-LIST-007 cascade and NFR-PERF-001 were
verified directly against a running stack rather than through test reports.
Four minor findings are recorded; none blocks acceptance.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-LIST-005, FR-LIST-008; UC-008 main 1 | `lists.service.spec` ×2, `lists.controller.spec` | faithful — counts asserted at 3 active / 6 total over active+completed+soft-deleted fixtures, order by position, cross-owner isolation | green |
| AC-2 | FR-LIST-001, FR-AUTHZ-004; UC-008 main 2–3 | `lists.service.spec`, `lists.controller.spec`, `lists.spec.ts` (E2E) | faithful — trim, append-last, `owner_id` read back from the row | green |
| AC-3 | FR-LIST-002; UC-008 alt 3a | `lists.service.spec`, `lists.controller.spec`, E2E | faithful — empty / whitespace / 101 chars rejected, **100 accepted at the boundary**, duplicates accepted, nothing created | green |
| AC-4 | FR-LIST-006, FR-LIST-004 (rename clause); UC-008 main 4 | `lists.service.spec` ×2, `lists.controller.spec`, E2E | faithful — default list renameable with `isDefault` preserved; rejected rename changes nothing | green |
| AC-5 | FR-LIST-007, FR-LIST-009; UC-008 alt 4a | `lists.service.spec`, `lists.controller.spec`, E2E | faithful — completed **and soft-deleted** tasks confirmed gone, other lists and other users untouched | green |
| AC-6 | FR-LIST-004; UC-008 exc-4b | `lists.service.spec`, `lists.controller.spec`, E2E | faithful — 409 and both list and tasks still present afterwards | green |
| AC-7 | FR-LIST-008; UC-008 main 4–5 | `lists.service.spec` ×2, `lists.controller.spec` ×2, E2E | faithful — dense 0..n-1, idempotent, persisted across a fresh read and a browser reload; missing/duplicate/foreign/unknown ids all rejected with the order unchanged | green |
| AC-8 | FR-AUTHZ-002/003/005 | `lists.service.spec`, `lists.controller.spec` | faithful — envelopes compared with `toEqual` (byte-identical), incl. a foreign **default** list answering 404 not 409; **mutation-checked** | green |
| AC-9 | FR-AUTHZ-001 | `lists.controller.spec`, E2E | faithful — all five endpoints, no cookie and revoked cookie, plus a read-back proving nothing was written | green |
| AC-10 | FR-LIST-009 (partial) | `lists.service.spec` | faithful — NOT NULL and FK violations asserted by constraint message | green |
| AC-11 | NFR-PERF-001 | `lists.controller.spec` | faithful — query count filtered to the collection statement; **mutation-checked** (an injected N+1 produced 21 queries, test red) | green |
| AC-12 | NFR-USE-002, FR-LIST-007; UC-008 alt 4a | E2E `AC-12/AC-13` | **was weak → corrected** (below) | green after correction |
| AC-13 | FR-LIST-005 end-to-end; UC-008 main 1–3 | E2E ×2 | faithful — Inbox with its count on a fresh account, badge text asserted, create appears with no reload | green |

**Standard audit (Phase 2).** No design-defect findings. Coverage is complete and
the criteria are faithful to their sources. Two interpretations were checked
closely and accepted:
- FR-LIST-005 says "active (incomplete)"; AC-1 additionally excludes
  soft-deleted tasks. That narrows nothing the user can see — a soft-deleted task
  is invisible to them (FR-TASK-013) — and D1 states the reasoning. Accepted.
- FR-LIST-009 is implemented partially by design (the plan's touchpoint says so):
  FEAT-009 owns the "exactly one list" constraint, FEAT-010 owns "assigned at
  task creation". AC-10 scopes to the former; the RTM append carries `(partial)`.

## Corrected tests

**AC-12 — `e2e/tests/lists.spec.ts` (commit `2d7dac1`).** The criterion has two
conjuncts: dismissing the confirmation "issues no request **and** deletes
nothing". The test asserted only the second (rows survive a reload). A client
that fired the DELETE and then restored the list would have passed it while
violating exactly the confirmation guarantee NFR-USE-002 exists for. The test now
attaches a request watcher **before** the row menu opens, asserts no DELETE
reaches `/api/lists/` when the warning is merely displayed, and asserts it again
after Cancel — alongside the existing survival check. The correction moves toward
the criterion and passes against unchanged production code. The same commit adds
the AC references the three E2E test names lacked.

## Independent execution

All run from `2d7dac1` with the harness's own commands:

| Run | Command | Observed |
| :-- | :------ | :------- |
| Feature suite | `npx jest src/modules/lists` (in `apps/api`) | **23 passed** / 2 files |
| Whole repo | `npm test` | **116 passed** (api, 25 files) + **20 passed** (worker, 6 files) |
| E2E | `npm run test:e2e` | **6 passed** (3 lists + 3 signup) |
| Boundaries | `npm run boundaries` | no violations (99 modules) |
| Build | `npm run build` | 0 errors (shared + api + worker + web) |
| Lint | `npm run lint` | clean |
| Migrations | `node-pg-migrate up` against a **freshly created database** | 8 migrations applied clean; `tasks` and `lists.position` match §4 exactly; `skeleton_ping` absent |
| Migrations (reverse) | `node-pg-migrate down` ×2 then up | 007 and 008 both reverse and re-apply |

**Mutation checks** (Phase 3, restored afterwards — `git status` clean):
- Injected an N+1 into `findAllWithCounts` → AC-11 failed (`Expected length: 1,
  Received length: 21`). The no-N+1 assertion is real.
- Removed the `owner_id` scoping from `findOwned` → both AC-8 tests failed. The
  uniform-404 ownership property is real, not incidentally passing.

**Flakiness / environment note (not a product finding).** One E2E run failed
wholesale — including the pre-existing signup specs — because the per-IP register
limiter (FR-AUTH-018, FEAT-003's verified behavior) had been exhausted by
repeated local runs: `auth_rate_buckets` showed `::1` at **39** hits against a
max of 30 per 900 s. Clearing the localhost buckets restored a clean run, twice
over. No FEAT-009 behavior was involved; recorded as minor finding 2 because the
harness will keep tripping it.

## Direct verification

Observed against a running local stack, not inferred from tests:

- **Contract shapes (§3).** `GET /lists` → `{ lists: [{ id, name, isDefault,
  position, activeTaskCount, taskCount }] }`; `POST /lists` → `201 { list }` with
  the trimmed name at `position 1`; `DELETE` on the default list →
  `409 {"code":"list_not_deletable"}`; `DELETE` on a non-default list →
  `200 {"status":"list_deleted","deletedTaskCount":3}`; unknown id →
  `404 {"code":"list_not_found"}`; no cookie → `401 {"code":"unauthenticated"}`.
  Every shape matches technical-design §3. No undeclared divergence.
- **FR-LIST-007 side effect, inspected at the row level.** A list holding one
  active, one completed and one soft-deleted task was deleted; a direct
  `SELECT count(*) FROM tasks WHERE list_id = …` returned **0**. The requirement's
  word is "permanently", and the rows are in fact gone — not soft-deleted.
- **NFR-PERF-001, measured (indicative).** With **20 lists / 2 000 tasks** seeded,
  `GET /lists` served in **2–3 ms** server-side over 10 samples — far inside the
  300 ms bound the SRS sets for "load a list". *Environment caveat:* local Docker
  Postgres on the dev machine, not Supabase over the pooler; the ordering of
  magnitude is what this establishes, and the single-statement shape (AC-11) is
  what makes it hold at scale. The query plan at this size prefers a
  sort+GroupAggregate over `tasks_active_by_list_idx`, which is expected — the
  partial index earns its keep at larger cardinalities.
- **Screens (manifest spot-check).** Both locators resolve to real headings in
  `ui-design.md`. SCR-WEB-011's three claimed states (`default`,
  `validation-error`, `delete-confirm`) were all observed rendering; SCR-WEB-007's
  `ready` state and the `< md` drawer were observed at 1280px and 390px — the main
  column measures **390px** at a 390px viewport, closing the ~115px regression
  FEAT-006 §8 recorded. Conformance claim holds: **zero raw hex colours** across
  the four new/changed UI files and 37 distinct design tokens referenced.
- **Contract bindings** in both manifest entries point only at endpoints this
  feature defines plus the pre-existing `POST /auth/logout`. No forward
  dependencies.

## Findings

**Rework: none.**

**Design defect: none.**

**Minor (recorded, non-blocking):**

1. **Touch-target literal instead of its token.** `--size-touch-target: 44px`
   exists, but `minHeight: 44` is hard-coded at three FEAT-009 sites
   (`lists-nav.tsx` ×2, `shell-frame.tsx`) — and at two pre-existing ones
   (`sign-out-button.tsx` from FEAT-004, the nav item carried from FEAT-006). The
   rendered value is correct, so nothing behaves wrongly; this is drift risk
   against the "tokens, never raw values" rule. Worth a sweep when the icon
   library lands.
2. **The E2E harness has no rate-limit override.** `apps/api`'s contract tests set
   `AUTH_RATELIMIT_MAX = 1000`; `e2e/playwright.config.ts`'s `webServer` env does
   not, so every E2E run spends real register-limiter budget on `::1` and repeated
   runs fail the *whole* suite with an unrelated-looking error. This will worsen
   as more specs register users. A one-line env addition to the E2E webServer
   config would fix it — flagged as test infrastructure, out of this feature's
   scope to change.
3. **SCR-WEB-007's `error` state is inspection-verified, not render-verified.**
   The branch exists and is token-conformant (`inline-alert` + Retry), but
   reaching it requires `/auth/session` to succeed while `GET /lists` fails, and
   the harness has no seam to inject that partial outage. Recorded rather than
   claimed as observed. The manifest's `covered` claim is accurate in substance;
   the evidence behind it is weaker than for the other states.
4. **Pre-existing, surfaced during this feature (not FEAT-009's).**
   `apps/api/tsconfig.json` (which includes `*.spec.ts`) fails `tsc --noEmit` on
   an `unknown`-typed `.send(body)` in FEAT-006's `change-password.controller.spec.ts`.
   No project command runs that config, so it is invisible to the build. Candidate
   for the defect ledger or a foundations task.

## RTM

Test ref appended (`features/FEAT-009-lists/acceptance-report.md`):

- **Full** — FR-LIST-001, FR-LIST-002, FR-LIST-004, FR-LIST-005, FR-LIST-006,
  FR-LIST-007, FR-LIST-008 (FEAT-009 is the sole Plan ref for each; their
  lifecycle Plan → Design → Test is now closed).
- **Partial** — FR-LIST-009 (Plan ref is FEAT-009 + FEAT-010; this feature
  delivers the one-list-per-task constraint, FEAT-010 delivers assignment at
  creation), and FR-AUTHZ-001/002/003/004/005 (Plan ref "Foundations"; ownership
  scoping and the authenticated-endpoint rule are verified here on the first
  owned-data module, and extend to `tasks`, `search` and `account-data` as those
  are built).
