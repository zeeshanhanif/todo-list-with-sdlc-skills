# Acceptance Report: FEAT-008 — View/edit profile (display name, timezone, theme)

> Verdict: **Accepted** · Date: 2026-07-30
> Standard: technical-design.md §6 (AC-1..AC-16) · Sources: docs/srs.md (FR-PROF-001..005,
> NFR-LOC-001, NFR-PERF-001, NFR-USE-003/004, NFR-REL-004, FR-AUTHZ-001/004),
> docs/use-cases.md (UC-007), docs/design.md, docs/features/FEAT-008-profile/ui-design.md,
> docs/design-manifest.json
> Repo state audited: `dd18546` (implementation head `ad078c8` + this run's test corrections)

## Verdict summary

**Accepted.** All sixteen criteria hold against faithful tests, every suite was
observed green in this run (api 315, shared 24, web 53, e2e 35), and the
contracts, latency, migration and screens were verified directly rather than
taken on report. Three test artifacts were **rejected and corrected** before the
verdict: AC-9's was unfalsifiable, AC-16 never measured its highest-risk pairing,
and AC-16's measurement helper could not see through an alpha channel — each
confirmed by mutation, corrected toward the criterion, and re-run. No production
code was changed by this audit. Two **minor** findings are recorded (a
product-wide focus-ring gap that predates this feature, and one untested screen
state now verified by direct observation); neither blocks.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-PROF-001; UC-007 main 1–2 | `profile.controller.spec` ×2, `profile.repository.spec` | faithful — asserts all four fields *and* cross-account isolation | green |
| AC-2 | FR-PROF-001 (email read-only), FR-AUTHZ-004 | `profile.controller.spec` ×2 | faithful — email checked in the response **and** at the row | green |
| AC-3 | FR-PROF-002; UC-007 main 3–4 | `profile.service.spec`, `profile.spec.ts` (e2e) | faithful — trim asserted at the value reaching persistence | green |
| AC-4 | FR-PROF-002; UC-007 alt 3a | `profile.service.spec` ×5, `profile.controller.spec` ×3 | faithful — each rejection paired with "nothing written" | green |
| AC-5 | FR-PROF-002, D1 | `profile.repository.spec`, `profile.service.spec`, `profile.controller.spec` | faithful — `null` distinguished from `""` at all three layers | green |
| AC-6 | FR-PROF-003 | `profile.repository.spec`, `profile.service.spec` ×10, `profile.controller.spec` ×8 | faithful — asserts the **exact string** stored, which a canonicalising impl fails | green |
| AC-7 | FR-PROF-003, D2 | `timezone-adoption.spec` ×5, `profile.spec.ts` (e2e) | faithful — the e2e **counts** requests rather than inferring "once" | green |
| AC-8 | FR-PROF-003, NFR-LOC-001 | `due-date.spec` ×17 | faithful — exact wall clocks, half-hour/45-min zones, 4 DST boundaries | green |
| AC-9 | FR-PROF-003, D4 (FEAT-011 D1 preserved) | `profile.controller.spec` | **was unfalsifiable → corrected** (below) | green |
| AC-10 | FR-PROF-004 | `profile.service.spec` ×7, `profile.controller.spec` ×6, migration CHECK | faithful — app *and* DB constraint | green |
| AC-11 | FR-PROF-004 ("applied on load") | `theme-sync.spec` ×7, `profile.spec.ts` (e2e) | faithful — asserted on a fresh `domcontentloaded` document; mutation-checked | green |
| AC-12 | FR-PROF-005 | `profile.spec.ts` (e2e) | faithful — separate browser contexts, no shared cookie jar | green |
| AC-13 | D6 (partial patch) | `profile.service.spec` ×5, `profile.controller.spec` ×4 | faithful — includes the `{ timeZone }` typo case and a materialised-DTO guard | green |
| AC-14 | FR-AUTHZ-001 | `profile.controller.spec` ×2 | faithful — missing/garbage/revoked, both routes, nothing written | green |
| AC-15 | NFR-PERF-001 | `profile.controller.spec` | faithful — query count filtered to this module's statements | green |
| AC-16 | NFR-USE-003, NFR-USE-004 | `profile.spec.ts` (e2e) ×2 | **had two gaps → corrected** (below) | green |

## Corrected tests

Committed as `dd18546` — `FEAT-008 acceptance: correct tests for AC-9 and AC-16`.

1. **AC-9's test was unfalsifiable.** It seeded due dates in **2020 and 2099**,
   then asserted `isOverdue` was unchanged across two timezone changes. No
   zone-dependent implementation could alter the answer for dates decades away,
   so the assertion held while proving nothing. **Mutation-confirmed**: a
   deliberately zone-shifted `isOverdue` (`Date.now() + 14h`) still passed.
   Corrected to seed **three hours either side of now** — inside every real UTC
   offset (−12..+14), so any implementation letting the zone touch the comparison
   flips at least one task. The corrected test passes against the real code and
   goes **red** under the same mutation. The production code was right all along;
   the measurement was not.
2. **AC-16 never measured the form-level alert.** It renders only when a save
   fails for a non-field reason, so a happy-path sweep could never see it — and it
   carries `--color-danger-text` on `--color-danger-subtle`, the exact pairing
   DEF-003 fixed and DEF-006 is still open on in five other places. Now provoked
   with an intercepted `500` and measured in **both** themes.
   **Mutation-confirmed**: swapping in `--color-danger` fails it at **3.95:1**,
   matching the defect ledger's own figure.
3. **AC-16's measurement helper could not see through an alpha channel.** The
   dark theme's `*-subtle` tints are translucent `rgba(…, 0.15)`; the helper read
   the element's own `backgroundColor` and dropped the alpha, comparing text
   against the fully-saturated colour. It reported the dark alert at **1.98:1**
   when the composited pairing is **7.8:1**. The helper now composites every
   translucent layer down to the first opaque one. This one matters beyond this
   screen: a contrast check that cannot composite invents failures and hides real
   ones wherever two tints stack.

Additionally, AC-16's keyboard clause ("every control keyboard-operable") was
**unasserted**; a second test now walks the tab order and drives the theme group
by arrow key. Its first form asserted the wrong thing — a native radio group
takes **one** tab stop, on the checked member — corrected to the platform's real
behaviour.

## Independent execution

All from repo head `dd18546`, with the harness's own commands:

| Run | Command | Result |
| :-- | :-- | :-- |
| API suite (serial, per open DEF-002) | `npm test -w @todo/api -- --runInBand` | **315 passed**, 39 suites |
| API suite (parallel) | `npm test -w @todo/api` | **315 passed** — no flakiness observed this run (see findings) |
| Whole repo | `npm test` | api 315 · shared 24 · web 53, all green |
| E2E | `npm run test:e2e` | **35 passed** (32 pre-existing + 3 net new after corrections) |
| Migration | `node-pg-migrate down` then `npm run db:migrate` | down clean, re-apply clean; all three columns present after |

## Direct verification

Beyond the suites, observed in this run against a live API (`nest start`) and a
production web build:

- **Contract shapes (§3), all ten cases driven by `curl`:** every success and
  error response matched the design exactly — `200 { profile }` with the trimmed
  name; the zone echoed **verbatim** (`Asia/Calcutta` in, `Asia/Calcutta` out);
  `400 validation_failed` on `displayName` / `timezone` / `theme` with the right
  field in `fields[]`; and `{}`, `{ timeZone: … }` and `{ email: … }` all landing
  on the synthetic `_` field. `401 unauthenticated` with no cookie.
- **NFR-PERF-001 (indicative, local stack, single user):** `GET /profile`
  min 1 ms / p50 2 ms / **p95 3 ms**; `PATCH /profile` min 3 ms / p50 4 ms /
  **p95 6 ms** over 20 calls each — two orders of magnitude inside the 300 ms
  bound. *Caveat: this measures a local single-user stack; the NFR says "at
  expected load", which is **pending environment**.*
- **FR-PROF-001 (email read-only):** no statement in the `profile` module writes
  `email`; the DTO does not declare it and `whitelist: true` strips it, so the
  read-only property is structural rather than a check someone must remember.
- **Screens vs. the manifest:** all three entries' source locators resolve to
  real headings; SCR-WEB-013's five claimed states were each observed rendering
  (default, saving, success, error at both field and form level), and the
  **unauthenticated** state was verified directly — `/settings/profile` returns
  `307 → /signin` with no cookie **and** with a garbage cookie.
- **Change signal (FR-PROF-005 side effect):** `ChangeSignalInterceptor` is
  applied at the controller class level, so every successful `PATCH` publishes.
  The configured publisher in this environment is the **no-op** (no Supabase
  project provisioned), so the actual broadcast is **pending environment** — the
  convergence it optimises was nevertheless demonstrated by AC-12 through
  FEAT-019's fallback refetch, which is the guarantee that must hold by default.

## Findings

**Rework: none.**

**Design defect: none.** The standard was audited against its sources before
being used: all five FR-PROF requirements, NFR-LOC-001 and the binding NFRs each
have ≥ 1 criterion, and UC-007's main flow plus alternates 3a and 4a are all
represented. One reading was scrutinised and accepted: **UC-007 alt 4a** says the
system "recomputes due/overdue status against the new timezone", while AC-9
asserts `isOverdue` does **not** move. These agree rather than conflict — `due_at`
is an absolute instant, so "has it passed?" has the same answer in every zone;
the recomputation is real and its result is invariant. The design states this
(D4) and it is consistent with the already-verified FEAT-011 D1/D3, which owns
the single derivation.

**Minor:**

1. **No explicit focus ring, product-wide.** design.md §5 specifies "a visible
   2px `--color-focus-ring` ring with 2px offset on `:focus-visible`", and
   `--color-focus-ring` exists in both themes' generated tokens — but **no CSS
   anywhere in `apps/web` sets it**, so every screen since FEAT-001 has relied on
   the browser default. FEAT-008 inherits this rather than causing it, and the
   default indicator *is* visible (asserted). Recommend a defect-ledger row and a
   web-tier pass, the same shape as DEF-005/DEF-006 — not FEAT-008 rework.
2. **DEF-002 did not reproduce.** The API suite passed **parallel** as well as
   serial in this run. Recorded as an observation only: one clean parallel run is
   not evidence the ~7% intermittent failure is gone, and the ledger row stays
   open.

## RTM

Test ref appended for the five FRs this feature implements —
`features/FEAT-008-profile/acceptance-report.md`:

- FR-PROF-001, FR-PROF-002, FR-PROF-003, FR-PROF-004, FR-PROF-005 (full)
- NFR-LOC-001 carries `(partial)`: the plan assigns it to *Foundations,
  FEAT-008*, and FEAT-010's report already covers its storage half — this report
  covers the display half (timestamps rendered in the user's selected timezone).
