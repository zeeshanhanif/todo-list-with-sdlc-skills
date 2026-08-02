# Acceptance Report: FEAT-020 — Soft-deleted task purge job

> Verdict: **Accepted** · Date: 2026-08-02 (re-verification after rework round 1)
> Prior verdict: **Rework** 2026-08-02 — preserved below.

# Re-verification — 2026-08-02 · Verdict: **Accepted**

> Standard: technical-design.md §6 @ `3155cad` — **byte-identical to the standard
> the first pass audited** (diffed; §6 was not touched by the rework, only §5's
> descriptive component text). Sources: docs/srs.md, docs/use-cases.md
> Repo state audited: `3155cad`

## Verdict summary

**Accepted.** The single rework finding is closed: `runPass` now returns
`PassOutcome<T>` (`{ summary, error }`), and the job's completion line carries
both passes' summaries — observed directly this run as
`{"msg":"worker run complete","envFile":"…","drain":{"sent":58,"retried":0,"deadLettered":0},"purge":{"purged":2},"failed":0}`.
The criterion's failure mode was checked too: with the drain forced to throw, the
line reads `"drain":null,"purge":{"purged":0},"failed":1` and the process exits
`1` — the surviving pass keeps its summary, exactly as AC-8 and AC-9 together
require. All eleven criteria hold, every suite was observed green in this run,
and the standard itself was confirmed unchanged across the rework: **the code
moved to meet the criterion, not the other way round.** One test correction was
made during this pass (an invisible control byte — below). FR-TASK-015's Test ref
is appended, closing the last open row in the plan.

## What changed since the Rework verdict

| Finding | Status |
| :-- | :-- |
| **R1** — AC-8 clause 2: completion line reported neither summary | **Closed.** `run-pass.ts` returns `{summary, error}`; `main.ts` logs `drain` and `purge` summaries plus `failed`. Commit `ff115c2`. |
| **Minor 3** — design §5 placed the pass guard in `main.ts` | **Closed.** §5 now describes `run-pass.ts` and the completion line. Descriptive text only; §6 untouched (verified by diff). |
| Minors 1, 2, 4 | Still open, still non-blocking — carried forward below. |

## Audit table (re-derived, not carried over)

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-015 cl.1; UC-012 alt-3a | `purge.repository.spec` AC-1 | faithful | green |
| AC-2 | FR-TASK-015 cl.2; FR-TASK-014 | `purge.repository.spec` AC-2 + edge | faithful (minor 2) | green |
| AC-3 | FR-TASK-013 boundary | `purge.repository.spec` AC-3 | faithful | green |
| AC-4 | FR-TASK-015 cl.3; "irreversible" | `tasks-lists-integration.spec` FEAT-020 AC-4 | faithful | green |
| AC-5 | FR-TASK-015 cl.1 (completed rows) | `purge.repository.spec` AC-5 | faithful | green |
| AC-6 | SRS §3.4 "30 days *(confirm)*" | `config.spec` ×4, `task-purge.service.spec` AC-6, `purge.repository.spec` AC-6 | faithful (corrected in pass 1) | green |
| AC-7 | design D2/D3 | `task-purge.service.spec` ×4 incl. cap | faithful (corrected in pass 1) | green |
| AC-8 | NFR-OBS-001 | `task-purge.service.spec` AC-8 **+ `worker-run.spec` ×2 (new)** | **now faithful on both clauses** | **green** |
| AC-9 | ADR-007, D4 | `run-pass.spec` ×6 (strengthened); exit codes observed | faithful | green |
| AC-10 | design D5 | `purge-plan.spec` ×2 | faithful | green |
| AC-11 | FR-AUTHZ blast radius | `purge.repository.spec` AC-11 | faithful (corrected in pass 1) | green |

## Corrected tests (this pass)

- **AC-8 — `worker-run.spec.ts`'s extraction carried a literal ESC byte.** The
  regex ended `(?=\s*$|\s*<ESC>|\n)` with an actual control character embedded in
  the source. It *worked* — the ESC anchored the lazy match on Nest's colour-reset
  code, so the whole JSON was captured — but the test's correctness depended on a
  character invisible to editors, grep and code review. This audit found it by
  retyping the line to check it and getting a different result: without the byte,
  `.*?\}` truncates at the first nested brace and the test dies on a JSON parse
  error rather than on the behaviour it guards. Replaced with an explicit ANSI
  strip (escape written as `\u001b`), a line lookup, and a slice from the first
  brace. **Verified still green, still red when the summaries are removed, and the
  file now contains no control characters at all.** Commit `3155cad`.

## Independent execution (re-run, from `3155cad`)

| Check | Observed |
| :-- | :-- |
| `npm test` | api **527**, worker **51**, web **96** — all passed |
| `npm run test:e2e` | **69 passed** (32.9s) |
| `npm run boundaries` | no violations (210 modules) |
| `npm run lint` | clean |
| Migrations, fresh DB | all 13 up clean; `tasks_purge_due_idx` present with the expected partial predicate; down removes it |

No flakiness observed. DEF-002 did not reproduce in this run (not evidence it is
fixed).

**Anti-fake-green review of the rework round (`7d76e66..3155cad`):** 149
insertions, 20 replaced lines, no test deleted and none skipped. Every replaced
line in `run-pass.spec.ts` is a consequence of the return type changing from
`Error | null` to `PassOutcome<T>`, and each replacement is **equivalent or
stronger** — the success case now asserts the summary as well as the absence of
error, and both single-failure cases now assert that the surviving pass kept its
summary. That is the criterion gaining teeth, not losing them.

## Direct verification (this run)

- **AC-8, observed at the process level** — the completion line from a real
  `node apps/worker/dist/main.js` run carried both summaries (values above), and
  the injected-failure run carried `"drain":null,"purge":{"purged":0},"failed":1`.
- **FR-TASK-015, effect observed** — four rows seeded (expired-active,
  expired-completed 60d, in-window 29d, never-deleted). After one real run the two
  expired rows are gone; the other two remain.
- **AC-9, exit code observed** — injected drain failure → exit `1`, purge still
  ran.
- **Contracts (§3)** — unchanged by the rework: still no HTTP endpoint, no shared
  contract touched. `TaskPurgeService.purge()` still returns `{ purged }`; the
  new `PassOutcome<T>` is internal to the worker's entrypoint seam.
- **Screens:** none (no SCR IDs, no manifest entries; `apps/web` untouched).
- **Pending environment:** none for this feature. The Cloud Scheduler cadence
  that triggers the job remains deployment configuration
  (`deploy/cloudrun-worker-job.yaml`, written not applied) and belongs to
  first-deploy.

## Findings (re-verification)

**Rework: none. Design defect: none.**

### Minor (3) — carried forward, non-blocking

1. **AC-10 cites NFR-PERF-001 loosely** — that NFR bounds user-facing request
   latency, not a batch job. The criterion is sound on D5's own terms; only the ID
   citation overreaches.
2. **AC-2's "still restorable" clause is verified by composition** — row survival
   is asserted in AC-2's test, restorability in AC-4's control. Sound (FEAT-013
   establishes that restore is legal exactly as long as the row exists), but the
   link is implicit.
3. **`AC-1`'s `toBeGreaterThanOrEqual(1)`** is loose because `purgeExpired` is
   global over a shared test database. The `exists(id) === false` assertion is
   what carries the criterion.

*(Minor 3 of the first pass — the design §5 drift — is closed and removed from
this list.)*

## RTM (re-verification)

**Written.** `FR-TASK-015`'s Test ref ← `features/FEAT-020-purge-job/acceptance-report.md`,
**no `(partial)` marker**: the plan's touchpoint claims the whole FR and FEAT-020
is the only feature in its Plan ref. That append completes the requirement's
Plan → Design → Test lifecycle, and it was **the last FR row without a Test
ref**: all 68 `FR-*` rows in the matrix now carry one.

**Not** the last `_TBD_` overall, though — **28 `NFR-*` rows remain open**. Every
one is assigned to *Foundations* rather than to a feature, and they are the
infrastructure-level qualities no feature-scoped audit can close: uptime
(NFR-REL-001), RPO/RTO (NFR-REL-002/003), the scale targets (NFR-SCAL-001..003),
front-end timing (NFR-PERF-002), search latency at 5k tasks (NFR-PERF-003), and
similar. They need a deployed environment and a load harness, and they belong to
first-deploy and whatever verification follows it — recorded here so the
completed FR set is not mistaken for a completed matrix.

---

# First pass — 2026-08-02 · Verdict: Rework *(superseded, preserved)*

> Standard: technical-design.md §6 @ `28016d7` · Sources: docs/srs.md, docs/use-cases.md
> Repo state audited: `28016d7`

## Verdict summary

The feature's substance is sound: FR-TASK-015's three clauses — permanently
purge, after a defined retention period, after which restore is impossible — all
hold under direct observation, and every suite ran green in this session. The
verdict is **Rework** on a single finding: **AC-8's second clause is not
implemented.** The criterion requires the job's completion line to report both
passes' summaries; it reports `{msg, envFile, failed}` and neither summary,
because `runPass` discards each pass's return value. The gap survived the
feature's own gate because AC-8's test asserts only the criterion's *first*
clause — the per-pass log line — so nothing in the suite ever looked at the
completion line. One narrow code change in `apps/worker/src/main.ts` (plus
`run-pass.ts`) closes it; no design change is needed, and no other criterion is
affected.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-015 cl.1 "permanently purge"; UC-012 alt-3a | `purge.repository.spec` AC-1 | faithful (row-gone assertion carries it) | green |
| AC-2 | FR-TASK-015 cl.2 "after a defined retention period"; FR-TASK-014 | `purge.repository.spec` AC-2 + edge case | faithful; "still restorable" by composition (minor 2) | green |
| AC-3 | FR-TASK-013 boundary | `purge.repository.spec` AC-3 | faithful (active *and* completed, 400 days old) | green |
| AC-4 | FR-TASK-015 cl.3 "cannot be restored"; SRS note "irreversible" | `tasks-lists-integration.spec` FEAT-020 AC-4 | faithful — control proves restore works pre-purge, then 404 + byte-identical + second attempt | green |
| AC-5 | FR-TASK-015 cl.1 (completed rows) | `purge.repository.spec` AC-5 | faithful | green |
| AC-6 | SRS §3.4 "30 days *(confirm)*" | `config.spec` ×4 **(corrected)**, `task-purge.service.spec` AC-6 **(corrected)**, `purge.repository.spec` AC-6 | clause 1 was untested → corrected | green |
| AC-7 | design D2/D3 (batching, overlap safety) | `task-purge.service.spec` ×3 + cap **(corrected)** | cap clause was untested → corrected | green |
| AC-8 | NFR-OBS-001 | `task-purge.service.spec` AC-8 | **clause 1 faithful; clause 2 unimplemented and unchecked** | **clause 2 FAILS** |
| AC-9 | ADR-007, design D4 | `run-pass.spec` ×6; exit code by direct observation | faithful | green |
| AC-10 | design D5 (NFR citation loose — minor 1) | `purge-plan.spec` ×2 | faithful, with its own discrimination case | green |
| AC-11 | FR-AUTHZ blast radius | `purge.repository.spec` AC-11 **(corrected)** | `users` clause was unasserted → corrected | green |

**Standard audited against its sources first.** FR-TASK-015 is covered by AC-1/
AC-2/AC-4/AC-5/AC-6 with no clause left unencoded; UC-012 alternate 3a (both
halves — purged, and not restorable thereafter) is represented by AC-1 + AC-4;
the SRS note "purge is irreversible" is represented by AC-4's repeat attempt. The
plan's touchpoint carries **no `(partial)` marker** and FEAT-020 is the only
feature in FR-TASK-015's Plan ref, so accepting this feature would complete that
requirement's lifecycle outright. No criterion misencodes its source; no
tombstoned IDs are referenced.

## Corrected tests

Three criterion clauses had no check behind them. All three pass — the **code was
right, the measurement was incomplete** — so none of these became rework.
Committed as `28016d7`.

1. **AC-6, clause 1** ("the window is read from `TASK_RETENTION_DAYS` and
   defaults to 30"). Only ever hand-demonstrated during implementation. New
   `apps/worker/src/config.spec.ts` pins both defaults and both env mappings; a
   typo'd key or a changed default would previously have shipped green.
2. **AC-6, through the service.** Every pre-existing test ran at
   `retentionDays: 30` against rows aged 31 days, so a service that ignored
   config and hard-coded 30 would have passed all of them. The window is now
   varied through `TaskPurgeService` and the config→repository link is pinned.
3. **AC-7's safety-cap clause.** Never exercised — the real repository cannot
   trigger it, since rows run out. A stub repository that never reports empty
   observes the 1000-iteration bound.
4. **AC-11's `users` clause.** The criterion names `lists` *and* `users` among
   what a purge must not touch; only `lists` was asserted. Both are now.

## Independent execution

All from repo head `28016d7`, using the project's own commands.

| Check | Command | Observed |
| :-- | :-- | :-- |
| Whole-repo suites | `npm test` | api **527**, worker **49**, web **96** — all passed |
| E2E | `npm run test:e2e` | **69 passed** (32.8s) |
| Boundaries | `npm run boundaries` | no violations (210 modules) |
| Lint | `npm run lint` | clean |
| Migrations, fresh store | fresh DB `feat020_audit`, `node-pg-migrate up` → `down` | all 13 applied; `tasks_purge_due_idx` created with the expected partial predicate; down dropped it; scratch DB removed |

No flakiness observed in this run; no test passed only on retry. (The standing
**DEF-002** api-suite flakiness did not reproduce here, which is not evidence it
is fixed.)

**Anti-fake-green review (independent).** The feature's complete test-file diff
across `aee4f82..28016d7` is **692 insertions, zero deletions** — not one removed
or modified line in any spec. No `.skip`/`.only`/`.todo`/`xit` anywhere in the
feature's tests. The two pre-existing fixtures touched (`email.provider.spec`,
`outbox-drain.service.spec`) gained three lines each — the two new required
`WorkerConfig` fields — with no assertion altered. The implementation's claim
that it strengthened rather than weakened the T4 concurrency test is confirmed by
the diff: the racing version never landed.

## Direct verification

- **FR-TASK-015, effect observed** (not inferred from a 200). Four rows seeded
  against the built job: `expired-active` (deleted 31d), `expired-completed`
  (deleted 45d, completed 50d), `in-window` (deleted 29d), `never-deleted`.
  After one real `node apps/worker/dist/main.js`: the two expired rows are gone
  from `tasks`, the other two remain. Logged `{"msg":"task purge
  complete","purged":2}`.
- **AC-9, observed at the process level.** Injecting a throw into the drain →
  exit **1**, purge still ran. Injecting a throw into the purge → exit **1**,
  drain still ran. Both directions confirmed against the built job, independent
  of `run-pass.spec`.
- **AC-8, observed at the process level.** The completion line from that same run
  was `{"msg":"worker run complete","envFile":"…/.env","failed":0}` — see
  Findings.
- **Contract conformance (§3).** No HTTP endpoint added (confirmed: no route
  registered, no shared contract touched). `TaskPurgeService.purge()` returns
  `{ purged }` as specified. The one API-observable consequence — restore
  answering `404 task_not_found` after purge — holds, byte-identical to an
  unknown id.
- **Screens:** none. The feature has no SCR IDs and no manifest entries; nothing
  to spot-check. `apps/web` is untouched by the feature's diff.
- **NFRs.** NFR-OBS-001 (structured logs) — per-pass lines verified, completion
  line deficient (finding). AC-10's plan claim re-observed in this run via
  `purge-plan.spec`. **Pending environment:** nothing for this feature — the
  retention behavior is fully observable locally. The Cloud Scheduler trigger
  that invokes the job on a cadence is deployment configuration
  (`deploy/cloudrun-worker-job.yaml`, written and not applied) and is
  first-deploy's to verify, not this feature's.

## Findings

### Rework (1)

- **R1 — AC-8, second clause: the job's completion line reports neither pass's
  summary.**
  *The criterion says:* "Each purge pass emits one structured JSON log line
  carrying the `purged` count, **and the job's completion line reports both
  passes' summaries**."
  *Observed:* the completion line is
  `{"msg":"worker run complete","envFile":"…","failed":0}`. The drain's
  `{sent, retried, deadLettered}` and the purge's `{purged}` appear only on the
  passes' own lines; the completion line carries a failure *count* instead.
  *Cause:* `runPass(name, pass)` in `apps/worker/src/run-pass.ts` returns
  `Error | null`, discarding each pass's return value, so `main.ts` has no
  summaries available at the point it logs (`apps/worker/src/main.ts:37-43`).
  *Why the suite missed it:* `task-purge.service.spec`'s AC-8 test asserts the
  per-pass line only — the criterion's first clause. Nothing anywhere asserts the
  completion line's content, so the second clause was neither implemented nor
  checked.
  *Faithful expectation:* one `worker run complete` line carrying both summaries
  (e.g. `{msg, envFile, drain: {sent, retried, deadLettered}, purge: {purged}}`),
  and a test asserting it — including that a failed pass still leaves the other
  pass's summary present, since AC-9 guarantees the other pass ran.
  *Satisfiable as designed:* yes — `runPass` returning the result alongside the
  error is a local change. **No design amendment is needed.**

### Design defect (0)

None. The standard is complete against FR-TASK-015 and UC-012 alt-3a, and every
criterion is satisfiable as written — R1 is a code gap, not a broken criterion.

### Minor (4) — recorded, non-blocking

1. **AC-10 cites NFR-PERF-001 loosely.** That NFR bounds p95 for
   create/complete/load-list — user-facing request latency — and does not
   literally govern a batch job. The criterion (index scan, not seq scan) is
   sound engineering and D5 justifies it on its own terms; only the ID citation
   overreaches.
2. **AC-2's "still restorable" clause is verified by composition.** The AC-2 test
   asserts row survival; restorability is proven by the AC-4 test's control. Sound
   — FEAT-013 D-note establishes that restore is legal for exactly as long as the
   row exists — but the link is implicit rather than asserted in one place.
3. **Design §5 places the pass guard in `main.ts`; the code has it in
   `run-pass.ts`.** A declared, design-consistent extraction (T8's commit explains
   it: `main.ts` runs the job on import and offered no seam for AC-9). The design
   document was not updated to match. Worth folding into the R1 fix.
4. **`AC-1`'s `expect(purged).toBeGreaterThanOrEqual(1)`** is loose because
   `purgeExpired` is global and the test DB is shared. Defensible, and the
   `exists(id) === false` assertion is what actually carries the criterion.

## RTM

**Not written — verdict Rework.** `FR-TASK-015`'s Test ref stays `_TBD_`. On
acceptance it takes `features/FEAT-020-purge-job/acceptance-report.md` with **no
`(partial)` marker**, which will complete that requirement's Plan → Design → Test
lifecycle and, with it, the plan's last open row.
