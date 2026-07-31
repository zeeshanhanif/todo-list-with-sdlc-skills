# Acceptance Report: FEAT-015 — Keyword search + status/due filters + pagination

> Verdict: **Accepted** · Date: 2026-07-31
> Standard: technical-design.md §6 (AC-1..AC-14) · Sources: docs/srs.md (FR-SRCH-001..006,
> 009, NFR-PERF-003, NFR-USE-003, NFR-SCAL-002, FR-AUTHZ-001/002/003),
> docs/use-cases.md (UC-013), docs/design.md, docs/features/FEAT-015-search/ui-design.md,
> docs/design-manifest.json
> Repo state audited: `01e0e41` (implementation head `ad85acf` + this run's test corrections)

## Verdict summary

**Accepted.** All fourteen criteria hold, every suite was observed green in this
run (api 395 both serially **and** in parallel, shared 24, web 53, e2e 40), the
migration state is unchanged and reversible, and the contract, the literal-match
rule, the timezone buckets and NFR-PERF-003 were verified directly against a
running stack rather than taken on report. Four **mutation checks** confirmed the
tests fail when the behaviours they claim are broken. One gap was found and
corrected: AC-11's `loading` and `error` states were claimed by both the
criterion and the manifest but had **no test**. No production code was changed by
this audit. Three **minor** findings are recorded; none blocks.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-SRCH-001; UC-013 main 1–2 | `search.repository.spec` ×2, `search.controller.spec`, `search.spec.ts` (e2e) | faithful — case, substring-inside-word, and two lists in one response | green |
| AC-2 | FR-SRCH-002 | `search.repository.spec` ×2, `search.service.spec`, `search.controller.spec` | faithful — `listName` asserted, and soft-delete exclusion checked under **ten** parameter combinations | green |
| AC-3 | FR-SRCH-003 | `search.repository.spec` ×3 | faithful — includes the discriminating case (a *completed* past-due task is not overdue) | green |
| AC-4 | FR-SRCH-004, FR-PROF-003 | `search.repository.spec` ×3 | faithful; **mutation-checked** (below) | green |
| AC-5 | FR-SRCH-005 | `search.repository.spec` ×2, `search.controller.spec`, e2e | faithful — dropping a criterion widens; a contradictory pair returns empty, not an error | green |
| AC-6 | FR-SRCH-006; UC-013 alt 2a | `search.controller.spec`, e2e ×2 | faithful — `200 []` not `404`, and empty is distinguished from **idle** in the UI | green |
| AC-7 | FR-SRCH-009 | `search.service.spec`, `search.controller.spec`, e2e | faithful — 25/25/10, distinct and complete, last page carries no cursor | green |
| AC-8 | FR-AUTHZ-001/002/003 | `search.repository.spec`, `search.controller.spec` ×2, e2e | faithful — 401 for missing/garbage cookie; another account's match absent | green |
| AC-9 | validation | `search.criteria.spec` ×15, `search.controller.spec` ×11 | faithful — every parameter names its own field; a limit alone is still no criteria | green |
| AC-10 | NFR-PERF-003, NFR-SCAL-002 | T7 + **re-measured in this run** | faithful (indicative; see caveat) | green |
| AC-11 | NFR-USE-003 | e2e ×4 | **loading and error were untested → corrected** (below) | green |
| AC-12 | FR-SRCH-003/004 consistency; FEAT-011 D3 | `search.repository.spec`, `search.service.spec` | faithful; **mutation-checked** | green |
| AC-13 | D4, keyset stability | `search.service.spec`, `search.controller.spec` | faithful; **mutation-checked** against an OFFSET implementation | green |
| AC-14 | D8, term escaping | `search.criteria.spec` ×9, `search.repository.spec` ×2, verified over HTTP | faithful; **mutation-checked** | green |

## Corrected tests

Committed as `01e0e41` — `FEAT-015 acceptance: correct tests for AC-11's untested states`.

**AC-11's `loading` and `error` states had no test.** The criterion names both,
and the manifest entry lists all five states as covered — but the e2e asserted
only idle, results and empty, and the keyboard clause covered the overlay's
shortcut/arrows/Esc rather than the controls inside it. Three additions:

1. **loading** — the local stack answers in single-digit milliseconds, so the
   state is invisible unless the response is held. The route is delayed 1.2 s to
   make the claim testable, and the test asserts ui-design's *specific* promise:
   the query field stays live, **keeps focus**, and accepts further typing while
   the panel thinks.
2. **error** — a fulfilled `500` proves the alert renders, the typed query
   survives (NFR-REL-004), and the last good results remain rather than the
   panel blanking.
3. **keyboard reachability** — tab order is query → status → due, the selects
   are operable from the keyboard alone, and focus stays trapped after twelve
   tabs.

## Mutation checks

Every check below was run by **breaking the behaviour and confirming the test
went red**, then restoring. A test never seen to fail is unverified
verification.

| Mutation | Expected to catch | Result |
| :-- | :-- | :-- |
| `escapeLike` returns its input unchanged | AC-14 | **9 tests red** |
| Bucket predicate binds `'UTC'` instead of the caller's zone | AC-4 | **1 test red** |
| `due=overdue` becomes a calendar-day rule instead of the instant rule | AC-12 | **3 tests red** |
| Keyset comparison replaced with `OFFSET` | AC-13, AC-7 | **4 tests red** |
| Tab trap disabled while `aria-modal` stays | AC-11 (corrected test) | **1 test red** |

The fourth is the one worth naming: AC-13 exists precisely to rule out offset
pagination, and the test does rule it out rather than merely describing it.

## Independent execution

All from repo head `01e0e41`, with the harness's own commands:

| Run | Command | Result |
| :-- | :-- | :-- |
| API suite (serial, per open DEF-002) | `npm test -w @todo/api -- --runInBand` | **395 passed**, 44 suites |
| API suite (parallel) | `npm test -w @todo/api` | **395 passed** — no flakiness this run (see findings) |
| Whole repo | `npm test` | api 395 · shared 24 · web 53, all green |
| E2E | `npm run test:e2e` | **40 passed** (38 + 2 from the corrections) |
| Migration | `node-pg-migrate down` then `npm run db:migrate` | both clean; **`migrations/` is unchanged by this feature**, which is D3's no-index decision holding |
| Lint / boundaries / build | `npm run lint`, `npm run boundaries`, `npm run build` | green; 173 modules cruised, no violations |

## Direct verification

Observed in this run against a live API (`nest start`) with a **5,000-task**
fixture:

- **Contract shape (§3.1):** `GET /search?q=report&limit=2` returns
  `{ results: [...], nextCursor }` with each result carrying `listName` beside
  the full `TaskSummary` — exactly FR-SRCH-002's two halves.
- **Every error shape (§3.1), driven by `curl`:** no criteria → `_`; `q=` → `q`;
  `status=archived` → `status`; `due=yesterday` → `due`; `limit=51` → `limit`;
  `cursor=junk` → `cursor`; no cookie and a garbage cookie → `401`.
- **AC-14 over the wire, not just in unit tests:** `q=50%` returns **1** result
  (not all 5,001), `q=done_v2` returns 1 while `q=done-v2` returns 0 — the
  underscore is a literal, not a wildcard — and `q=REPORT` matches
  lower-case titles.
- **AC-4 directly, on one account and one row:** a task due 12 hours out, with
  only the *stored zone* changed between requests, is returned by `due=today`
  under `Asia/Tokyo` (local 05:00) and by `due=upcoming` under `Europe/London`
  (local 21:00) — and by `due=overdue` under neither, since that bucket is
  zone-invariant by design (D5).
- **NFR-PERF-003, re-measured independently** (5,000 tasks, 30 calls per shape):
  keyword few-matches p95 **5 ms**; keyword most-rows p95 **7 ms**; filter-only
  p95 **4 ms**; combined p95 **5 ms**. Two orders of magnitude inside the 500 ms
  bound, and consistent with T7's numbers. *Caveat: a local single-user stack.
  NFR-PERF-003 says "at expected load", which is **pending environment**.*
- **Screens vs. the manifest:** SCR-WEB-012's entry resolves to a real heading,
  and all five claimed states now render under test (two of them only after this
  run's corrections). The design-system escalation the entry once carried is
  resolved — design.md §4's `command-search` was amended on 2026-07-31 and the
  screen conforms to the amended wording.

## Findings

**Rework: none.**

**Design defect: none.** The standard was audited against its sources before use:
all seven FR-SRCH requirements this feature implements have ≥ 1 criterion, the
binding NFRs appear as criteria, and UC-013's main flow 1–3 plus alternate 2a are
each represented. Two readings were scrutinised and accepted: `overdue` appearing
in **both** the status and due-date filters is what the SRS itself specifies
(FR-SRCH-003 and FR-SRCH-004), and D5's decision to compile both to the single
instant-based rule keeps them from drifting — AC-12 pins that they agree with
each other and with the payload. And D6's "no criteria is a 400" is a design
decision the SRS does not contradict: no FR asks for an unfiltered listing, and
FEAT-016 owns the `All` view.

**Minor:**

1. **FR-SRCH-009's "default page size configurable" is satisfied narrowly.** The
   default is a shared constant (`SEARCH_PAGE_SIZE`) and callers may override it
   per request within a bound. If "configurable" was meant as *deploy-time*
   configuration, it is not that. The requirement's stated purpose — "prevents
   unbounded rendering of large lists" — is fully met, so this is recorded
   rather than raised.
2. **The contrast sweep was not extended to SCR-WEB-012.** ui-design recommended
   adding this screen to `e2e/tests/control-contrast.spec.ts` rather than writing
   a screen-local check. Every pairing it renders was measured during FEAT-008's
   acceptance and none is new, and NFR-USE-004 is not among FEAT-015's criteria —
   so this is a carried recommendation, not a gap in this feature's standard.
3. **DEF-002 did not reproduce here, but new evidence contradicts its ledger
   row.** Both a serial and a parallel full run passed in this audit. However,
   the implementation session recorded a **serial** run failing with the ledger's
   own signature ("a row that should exist doesn't"), while the row characterises
   DEF-002 as *parallel-run* flakiness. That characterisation is incomplete, which
   matters to whoever fixes it: the cause is not cross-worker interference.
   Routed to the defect ledger, not to this feature.

## RTM

Test ref appended for the seven FRs this feature implements —
`features/FEAT-015-search/acceptance-report.md`:

- FR-SRCH-001, FR-SRCH-002, FR-SRCH-003, FR-SRCH-004, FR-SRCH-005, FR-SRCH-009
  (full)
- FR-SRCH-006 carries `(partial)`: its Plan ref names **FEAT-015 and FEAT-016**,
  and this report covers only the search overlay's empty state. FEAT-016's smart
  views own the other half, and the FR becomes fully verified when that report
  lands — computed from the rows, never stored.
