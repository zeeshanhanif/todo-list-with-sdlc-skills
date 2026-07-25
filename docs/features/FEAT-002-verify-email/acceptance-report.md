# Acceptance Report: FEAT-002 — Verify email + resend

> Verdict: **Accepted** · Date: 2026-07-24
> Standard: technical-design.md §6 @ f9bea86 · Sources: srs.md (FR-AUTH-006/007/008, NFR-SEC-004), use-cases.md (UC-002)
> Repo state audited: 9ded4ab (HEAD, branch implementation)

## Verdict summary

FEAT-002 is **accepted**. All nine acceptance criteria were re-derived from the
FR/UC/NFR sources, each is covered by a test that faithfully asserts the
criterion's real claim (status code **and** state change, error **and** its
shape), and every suite ran green in this audit run — feature specs 15/15,
whole API suite 39/39, worker 20/20, boundaries clean, migration 004 up/down
clean. No production code was corrected (none needed); no tests were corrected
(none were weak). Two non-blocking minor notes are recorded below. The RTM Test
ref is appended for FR-AUTH-006, FR-AUTH-007 (partial), and FR-AUTH-008.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-006, UC-002 main | verify-email.service (AC-1) + verify.controller (200 verified) | faithful — asserts 200/`verified` **and** `verified_at` set + token columns cleared | green |
| AC-2 | NFR-SEC-004 (single-use) | verify-email.service (AC-2) | faithful — consumed token replay → `TokenInvalidError` | green |
| AC-3 | NFR-SEC-004 (time-limited), UC-002 alt 2a | verify-email.service (AC-3) + verify.controller (400 `token_expired`) | faithful — expired → error **and** account stays unverified | green |
| AC-4 | FR-AUTH-006, UC-002 alt 2a | verify-email.service (AC-4) + verify.controller (400 `token_invalid`) | faithful | green |
| AC-5 | FR-AUTH-007 (partial) | verify-email.service (AC-1 post-state) + register spec (pre-state `verified_at` NULL, FEAT-001) | covered — the NULL→timestamp transition is observed (minor #1) | green |
| AC-6 | FR-AUTH-008, UC-002 alt 2a (resend) | resend-verification.service (AC-6) | faithful — new outbox row **and** token rotated **and** old link now `token_invalid` | green |
| AC-7 | FR-AUTH-008 neutrality (D3) | resend-verification.service (AC-7 ×2) + verify.controller (neutral 200 ×2) | faithful — unknown & already-verified: no row, no rotation, identical body | green |
| AC-8 | FR-AUTH-018 (partial) / cooldown (D4) | resend-verification.service (AC-8) | faithful — within cooldown: no additional row, no rotation | green |
| AC-9 | validation (FR-AUTH-003 convention) | verify.controller (missing token; malformed email) | faithful — 400 `validation_failed` with the offending field | green |

**Standard-vs-source check:** every feature FR has ≥1 criterion (006→AC-1/4,
007→AC-5, 008→AC-6/7); NFR-SEC-004 is concrete criteria (AC-2/3); UC-002 main
(AC-1) and alt 2a (AC-3/4) are represented. UC-002 exc-3a is folded into the
invalid path by documented decision D2 (minor #2). No misencoded criteria.

## Corrected tests

None — every test asserted its criterion faithfully; no weakened proxies,
tolerances, skips, or mocked-away behavior. The anti-fake-green diff review over
`ef0f6bf..HEAD` confirms **no existing test file was modified**; all three spec
files (`verify-email.service.spec.ts`, `resend-verification.service.spec.ts`,
`verify.controller.spec.ts`) are new additions, and the production diff is
feature-only.

## Independent execution

Run fresh from repo head with the harness's own commands (DATABASE_URL → local
docker Postgres; schema via jest globalSetup):

- **Feature specs** (`--testPathPatterns verify-email.service|resend-verification.service|verify.controller`): **3 suites, 15 tests — all passed.**
- **Whole API suite** (`npm test -w @todo/api`): **11 suites, 39 tests — all passed** (no regression in FEAT-001/007 auth/health tests).
- **Worker suite** (`npm test -w @todo/worker`): **6 suites, 20 tests — passed.**
- **Boundaries** (`npm run boundaries`): clean — no dependency violations (57 modules).
- **Migration 004** (`node-pg-migrate down` then `up`): applies clean both ways against the current schema.
- **E2E**: **not owed** — the architecture names no critical E2E flows/frameworks, so UC-002 carries no mandatory Playwright path (legitimate skip, consistent with FEAT-001; recorded in tasks.md). The skeleton E2E is untouched by this feature's additive diff.
- No flakiness observed (no retries; consistent green across the T7 run and this audit run).

## Direct verification

- **FR-AUTH-006 (mark verified on valid link)** — observed directly: verify sets
  `verified_at` (non-NULL) and clears the token columns; invalid/expired links
  are rejected. Confirmed by AC-1/3/4 integration assertions against the DB.
- **FR-AUTH-008 (resend)** — observed: resend enqueues a fresh `verification`
  `pending` outbox row and rotates the stored token hash; the previous link then
  fails verification (AC-6). Delivery of the enqueued row is FEAT-007 (already
  accepted); the pipeline is type-agnostic, so resent rows are delivered unchanged.
- **NFR-SEC-004 (single-use, ≤24h)** — single-use enforced by consuming the token
  on verify (AC-2, observed). Expiry ≤24h: the TTL is a single-sourced config
  (`verificationTokenTtlHours`, default 24) used by `VerificationTokenService.issue()`
  for both registration and resend rotation. *Indicative/config-bound* — the
  boundary itself is exercised by AC-3 (a past-expiry token is rejected).
- **Screens** — SCR-WEB-003 (`/verify`): the five manifest states
  (verifying/success/expired/invalid/resend-sent) are present in the page's state
  machine; served `200` at runtime. SCR-WEB-002 resend control wired to
  `/api/auth/verify/resend`. Conformance: grep of the feature's web files found
  **no raw hex/rgb colors** — styling is design tokens only, matching the manifest
  `pass` claims. Manifest locators resolve to existing headings.
- **Contracts** — request/response/error shapes as implemented match
  technical-design §3: `POST /auth/verify` → 200 `{verified}` / 400
  `token_expired` / 400 `token_invalid` / 400 `validation_failed`; `POST
  /auth/verify/resend` → neutral 200 `{verification_sent}` / 400 `validation_failed`.

**Pending environment:** none material. The per-IP rate limiter (FR-AUTH-018) is
explicitly out of FEAT-002's FR set (deferred foundations, design §8); the
feature-local cooldown portion is verified (AC-8).

## Findings

**Rework:** none.

**Design defect:** none.

**Minor (non-blocking, recorded):**
1. **AC-5 has no standalone AC-5-labelled test.** The FR-AUTH-007 (partial)
   transition (NULL→timestamp) is fully observed — post-verify `verified_at` is
   asserted in verify-email.service AC-1, and the pre-state (unverified default)
   is guaranteed and asserted by the FEAT-001 register spec. Behavior is covered;
   only the direct AC-5 traceability label is absent. No action required.
2. **UC-002 exc-3a (already-verified → informational, direct to sign-in)** is not
   a dedicated criterion; by documented decision D2 an already-verified user
   clicking a (now-consumed) link receives the `token_invalid` result whose UI
   offers **sign in**. This is intentional and honest (recorded in §7/§8 of the
   design), and meets the UC's core intent (don't error-block a verified user;
   guide them to sign in). Recorded as acceptable, not a defect.

## RTM

Test ref appended (append-only, Test ref column only):
- **FR-AUTH-006** → `features/FEAT-002-verify-email/acceptance-report.md`
- **FR-AUTH-007** → `features/FEAT-002-verify-email/acceptance-report.md (partial)` (completes with FEAT-003's sign-in gate)
- **FR-AUTH-008** → `features/FEAT-002-verify-email/acceptance-report.md`
