# Acceptance Report: FEAT-012 — Complete / reopen task

> Verdict: **Accepted** · Date: 2026-07-29
> Standard: technical-design.md §6 (AC-1..AC-12) @ `fd877be` · Sources: docs/srs.md,
> docs/use-cases.md (UC-011), docs/design.md, docs/design-manifest.json
> Repo state audited: `8f0bf99` (implementation head `0ad7ed8` + one corrected test)

## Verdict summary

**Accepted.** All twelve criteria hold, and the standard itself audits clean — every
FR in the feature's trace (FR-TASK-003 partial, FR-TASK-009, FR-TASK-010,
FR-TASK-011) has at least one criterion, each faithful to its SRS statement, and
UC-011's four main steps are all represented. Suites were re-run fresh from the
repo state — api **191** serially *and* in parallel, worker **20**, e2e **18**,
migrations a no-op at head with `migrations/` untouched, exactly as design D3
claimed. One measurement gap was found and corrected by this audit (AC-11's
strikethrough clause had no rerunnable test); the code passed once the assertion
was faithful. Four minor findings are recorded, none blocking, three of them
pre-existing and carried.

The decisive evidence is not the suite count: it is that the two claims most
likely to be wrong were checked **directly against the running system** rather
than through the implementation's own tests — idempotency preserved the original
instant across a real one-second gap, and a forged `{"completedAt":"1999-…"}`
body was ignored while the server stamped its own time.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-TASK-009; UC-011 main 1/2 | repository, service, contract specs | faithful — window-bounded instant asserted at the **row**, not just the response | green + observed live |
| AC-2 | FR-TASK-010; UC-011 main 3/4 | repository, service, contract specs | faithful — other fields byte-identical across both transitions | green + observed live |
| AC-3 | FR-TASK-003, FR-TASK-011; UC-011 main 2/4 | `tasks-lists-integration.spec` | faithful — membership **and** both orderings | green |
| AC-4 | FR-TASK-009 note; FR-TASK-007 | service spec; `complete-reopen.spec` | faithful — asserts the completing response itself, not a later read | green + observed live |
| AC-5 | idempotency (D2) | repository, service, contract specs | faithful — original instant asserted at the row, so an echoed response cannot pass it | green + observed live |
| AC-6 | FR-LIST-005 (FEAT-009, no-regress) | `tasks-lists-integration.spec` | faithful — both count surfaces | green |
| AC-7 | FR-AUTHZ-002/003/005 | repository, service, contract specs | faithful — byte-identical bodies across all four cases, on both routes, row unmodified | green |
| AC-8 | FR-AUTHZ-001 | contract spec | faithful — nothing written, verified at the row | green + observed live (401) |
| AC-9 | NFR-PERF-001 | contract spec | faithful — query count filtered by table, guard counted separately | green; measured 3.0–5.5 ms |
| AC-10 | FR-TASK-011; NFR-USE-003/004 | `complete-reopen.spec` | faithful — collapsed-by-default via the `open` property, count visible, **keyboard-only** expansion, absent when empty | green |
| AC-11 | FR-TASK-009/010 via UI; SCR-WEB-008/010 | `complete-reopen.spec` (**corrected**), `task-detail.spec` | presentation clause was **uncovered** → corrected; rest faithful | green after correction |
| AC-12 | NFR-USE-003 | `complete-reopen.spec` | faithful — route forced to 500; asserts the box is *not* left reading completed | green |

## Corrected tests

**One.** AC-11 requires a completed title to render "strikethrough +
`--color-text-muted`". No test asserted it — the build demonstrated it by
screenshot, which is real evidence but not a rerunnable one, so the criterion had
no standing measurement. Added computed-style assertions to the UC-011 e2e:
`text-decoration-line: line-through` and `color: rgb(100, 116, 139)` (#64748B,
`--color-text-muted`'s actual value).

The first attempt targeted the row **link** and read `none`; the strikethrough
belongs to the title span (the right cluster is deliberately not struck out), so
the *locator* was wrong, not the code. Corrected toward the criterion, and the
code passed. Commit `8f0bf99`.

## Independent execution

Run from the repo head with the harness's own commands, in the order that
localizes failures.

| Suite | Command | Observed |
| :-- | :-- | :-- |
| Feature (tasks module) | `npm test -w @todo/api -- --runInBand src/modules/tasks` | **73 passed**, 5 suites |
| Whole api, serial | `npm test -w @todo/api -- --runInBand` | **191 passed**, 31 suites |
| Whole api, **parallel** | `npm test -w @todo/api` | **191 passed** — DEF-002 did not reproduce this run |
| Worker | `npm test -w @todo/worker` | **20 passed** (one failure observed across 9 runs — see minor 2) |
| E2E | `npm run test:e2e` | **18 passed** (15 inherited + 3 this feature) |
| Migrations | `npm run db:migrate` | "No migrations to run" — no-op at head |

**Migration check, against design D3's claim.** `migrations/` is untouched by the
feature's entire commit range, and the schema the design says it relies on was
verified in the live database rather than assumed: `completed_at` is
`timestamp with time zone`, nullable, and `tasks_active_by_list_idx` exists as
`(list_id) WHERE completed_at IS NULL AND deleted_at IS NULL` — the partial
predicate the active counts ride on. A feature with an empty §4 is the case where
"no schema change" most deserves checking; it holds.

**Anti-fake-green review.** The test-file diff across `fd877be..HEAD` is +719/−5.
All five deleted lines were inspected: two widen a `SELECT` and an import
(additive), and one replaced `detail-status` assertion. That one is a declared
fix-toward-the-design with a sound rationale — FEAT-011 shipped the status as
read-only text and recorded that the *control* was FEAT-012's — and the
replacement is **strictly stronger** (the control's state *and* its label, versus
the old text alone). No skips, no `.only`, no `.todo`, no deleted cases, nothing
newly mocked.

## Direct verification

Driven against a live API, not through the feature's own tests:

- **AC-5 idempotency, the claim most likely to be wrong.** Completed, waited one
  real second, completed again: `2026-07-29T07:54:37.690Z` both times —
  **identical, not re-stamped**. This is what `COALESCE(completed_at, now())`
  buys, observed rather than inferred.
- **FR-AUTHZ-004 / D8, probed adversarially.** `POST …/complete` with a body of
  `{"completedAt":"1999-01-01T00:00:00.000Z"}` returned `200` and stored
  `2026-07-29T07:54:38.805Z` — the client's forged instant was ignored and the
  server stamped its own. Accept-and-ignore is precisely what D8 specifies (no
  DTO, no 400; only 401 and 404 fail), so this is conformance, not laxity.
- **AC-4 end to end.** A task due 2020 reported `isOverdue: true`, `false` in the
  completing response itself, and `true` again on reopen — from the server's
  single derivation, with `dueAt` unchanged.
- **NFR-PERF-001 (indicative, local environment).** 20 consecutive transitions
  measured **3.0–5.5 ms** server-side round trip against the 300 ms bound —
  roughly two orders of magnitude of headroom. Local Docker Postgres on a
  developer machine; not a substitute for a load-tested environment (below).
- **Rendered output, not just source** (the DEF-003 lesson). Computed styles read
  off the live checkbox: unchecked ring `rgb(100, 116, 139)` = `--color-text-muted`
  (**4.76:1**), checked fill `rgb(5, 150, 105)` = `--color-success`. The amended
  tokens are what actually ship, and the custom properties resolve — a `var()`
  that silently failed would have rendered a default.
- **Screens vs. the manifest.** Both entries are `designed` / conformance `pass`;
  all four source locators resolve to real headings; `contract_bindings` match
  technical-design §3 exactly. The new UI contains **no raw values** — every hit
  for a hex or a bare pixel is inside a comment, never a style.
- **AC-11's "one component, both presentations"** holds structurally: both
  `app/tasks/[id]/page.tsx` and `app/@detail/(.)tasks/[id]/page.tsx` render the
  same `TaskDetail`, so the control cannot exist in one and not the other.

**Pending environment:** NFR-PERF-001's "95% … at expected load" cannot be
verified locally — what would verify it is a load run against deployed
infrastructure at the stated concurrency. The local measurement above is
indicative only, and the margin is wide enough that this is recorded rather than
flagged as risk.

## Findings

### Rework
**None.**

### Design defect
**None.** The standard covers every FR in the trace and every UC-011 step, and
each criterion is faithful to its source. Notably AC-6 guards a *prior* feature's
requirement (FR-LIST-005) that this feature is the first able to break — a
criterion the standard did not have to include and is better for including.

### Minor
1. **AC-11's presentation clause had no rerunnable test** — found and **corrected**
   by this audit (above). Recorded because the pattern matters: the clause was
   demonstrated by screenshot during the build, and a screenshot is evidence that
   expires. The correction cost two lines.
2. **One worker-suite failure in nine runs, cause not established.** It occurred
   chained immediately after a parallel api run; **8 subsequent runs were green**
   (6 isolated, 2 deliberately chained to reproduce it), and no diagnostic was
   captured before the run was lost. `apps/worker` is **untouched** by this
   feature's entire diff, so this is not a FEAT-012 regression. It is consistent
   with **DEF-002**'s shared-database family but is *not* established as the same
   cause — recorded here so the next sighting has a precedent rather than being
   met fresh. DEF-002 itself did **not** reproduce in this audit: the api suite
   was green in parallel as well as serially, which is one clean sample against a
   measured ~8%, not evidence of a fix.
3. **The E2E harness's missing `AUTH_RATELIMIT_MAX` bit twice** during this
   feature (once in the build, once mid-audit), each time turning every
   signup-dependent spec red with an unrelated-looking `429`. The documented
   remedy — clear `auth_rate_buckets` for the loopback — worked both times and no
   test was weakened. This is the **carried FEAT-009 acceptance minor**, now with
   two more sightings; it is cheap to fix (one `env` entry in
   `e2e/playwright.config.ts`) and it wastes a diagnosis every time it fires.
4. **`apps/web` still has no unit-test runner.** This feature adds
   `task-checkbox.tsx` — the first list-row control with **state and a failure
   mode** — whose optimistic/rollback logic is observable only through Playwright.
   Finding 1 is the concrete cost: a presentation criterion went unmeasured
   because the cheap place to assert it does not exist. Recorded against DEF-003
   and DEF-004, which name the same gap; it is now the strongest case for
   scheduling it, and FEAT-013's undo-snackbar (a stateful island with a timeout)
   will be the next.

## RTM

Test ref appended — `features/FEAT-012-complete-reopen/acceptance-report.md`:

| FR | Append | Note |
| :-- | :-- | :-- |
| FR-TASK-003 | `…/acceptance-report.md (partial)` | the plan's touchpoint says partial; with FEAT-010's row already present, the FR is now **fully verified by computation** — neither entry is edited |
| FR-TASK-009 | `…/acceptance-report.md` | sole implementing feature |
| FR-TASK-010 | `…/acceptance-report.md` | sole implementing feature |
| FR-TASK-011 | `…/acceptance-report.md` | sole implementing feature |

FR-LIST-005 is **not** appended: AC-6 guards it against regression, but FEAT-009
implements it and owns its Test ref.
