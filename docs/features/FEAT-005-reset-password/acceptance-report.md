# Acceptance Report: FEAT-005 — Forgot / reset password

# Re-verification — 2026-08-01 · Verdict: Accepted (unchanged) · after the DEF-006 and DEF-009 fixes

**Two one-line-per-site colour changes; no behaviour, contract or state moved.**

- **DEF-006** — this feature's inline error alert paired `--color-danger` with
  `--color-danger-subtle` (**3.95:1**, under design.md §5's 4.5:1 for body
  text). It now uses the tint's partner ink `--color-danger-text` (**6.80:1**
  light / 8.31:1 dark). The alert's copy, role, testid, trigger conditions and
  placement are untouched — only the ink.
- **DEF-009** — the design system's `:focus-visible` ring (2px
  `--color-focus-ring`, 2px offset) is now actually applied, product-wide, in
  `globals.css`. Every screen previously showed the browser's 1px default.

**Verdict unchanged: Accepted.** No acceptance criterion of this feature is
affected: both changes make the screens conform *more* closely to design.md §5,
which the criteria already required. Both are now guarded permanently —
`e2e/tests/inline-alert-contrast.spec.ts` measures the rendered contrast ratio
and `e2e/tests/focus-ring.spec.ts` measures the rendered ring.

**Re-executed (2026-08-01, from `70b4a30`):** api **442/442**, web **78/78**,
worker 24/24, e2e **53/53**, lint · boundaries · build clean.

> Verdict: **Accepted** · Date: 2026-07-25
> Standard: technical-design.md §6 @ db3e340 · Sources: srs.md (v1.0), use-cases.md (UC-005)
> Repo state audited: ddc8bb6 (includes this skill's test-isolation correction)

## Verdict summary

FEAT-005 is **accepted — verified**. The standard was re-derived from FR-AUTH-012
(neutral forgot request), FR-AUTH-013 (single-use, time-limited reset link),
FR-AUTH-014 (set new password, consumed on success), FR-AUTH-017 (invalidate all
sessions on reset), and NFR-SEC-003/004; the eight criteria cover every FR and
both consequential UC-005 alternates (4a expired/used, 4b policy fail), each
faithful. All criteria were observed green; the two decisive criteria — AC-4
(invalidate ALL sessions, FR-AUTH-017) and AC-5 (token expiry gate) — were
mutation-checked and went red when the behavior was broken. **One finding**
surfaced during independent execution: a pre-existing flaky-test defect (the
register/verify contract specs 429'd once rate-limit buckets accumulated across
runs) — a **test-measurement** issue, not a production bug; corrected here within
this skill's mandate (production rate-limiting is correct). After the correction
the whole-repo suite is deterministically green across repeated runs. No
production rework or design-defect findings.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-012, UC-005 main 1–2 | forgot-password.service.spec; reset-password.controller.spec AC-1 | faithful (registered → 1 password_reset row; unknown → 0; identical neutral body) | green |
| AC-2 | FR-AUTH-013, NFR-SEC-004 | forgot-password.service.spec | faithful (only SHA-256 hash stored; raw only in outbox payload; expiry ≈ now+TTL) | green |
| AC-3 | FR-AUTH-014, UC-005 main 4–5 | reset-password.service.spec AC-3; reset-password.controller.spec AC-3/4 | faithful (password changed; token cleared; single-use replay → invalid) | green |
| AC-4 | FR-AUTH-017 | reset-password.service.spec AC-4; reset-password.controller.spec AC-3/4 | faithful (all sessions deleted; prior cookie → 401); **mutation-checked** | green |
| AC-5 | UC-005 alt 4a | reset-password.service.spec AC-5; reset-password.controller.spec AC-5 | faithful (expired → token_expired; unknown → token_invalid; password unchanged); **mutation-checked** | green |
| AC-6 | FR-AUTH-014, NFR-SEC-003, UC-005 alt 4b | reset-password.service.spec AC-6; reset-password.controller.spec AC-6 | faithful (policy fail → 400 password field; password + token untouched, retry works) | green |
| AC-7 | FR-AUTH-018, NFR-SEC-006 | reset-password.controller.spec AC-7 | faithful (429 on both /auth/forgot and /auth/reset) | green |
| AC-8 | validation | reset-password.controller.spec AC-8 | faithful (400 validation_failed + fields[]) | green |

## Corrected tests

- **`auth.controller.spec.ts`, `verify.controller.spec.ts` — rate-limit isolation
  added** (commit `ddc8bb6`). *What was wrong:* neither spec isolated against the
  per-IP `RateLimitGuard` that FEAT-003 retrofitted onto `/auth/register` +
  `/auth/verify`; both share the default IP, and `auth_rate_buckets` rows persist
  across runs within the 15-minute window, so once enough runs accumulate the
  specs receive `429` instead of their asserted `201`/`400`/`200` (the whole-repo
  suite failed 5–8 tests non-deterministically). *The fix:* lift
  `AUTH_RATELIMIT_MAX` in each spec's `beforeAll` (saved/restored), mirroring the
  newer contract specs. **Test-measurement only — no assertion was weakened; the
  same statuses are asserted; production rate-limiting is unchanged.** This is a
  latent defect from FEAT-003's retrofit that FEAT-005's added contract tests
  tipped into reliable failure.

## Independent execution

- **Feature suite** (`forgot-password`, `reset-password` service + controller
  specs), fresh from repo head: **3 suites, 12 tests — green.**
- **Whole-repo suite** (`npm test`): pre-correction it failed **5–8 tests**
  non-deterministically (the flaky finding above); **post-correction: api 22
  suites / 80 tests, worker 6 / 20 — green, and deterministically so across three
  back-to-back runs in the same rate-limit window.**
- **Boundaries**: no violations (78 modules). **Lint** (api+web): pass.
- **Migration 006**: `down` then `up` against the local store — both clean;
  `reset_token_hash` / `reset_token_expires_at` + the partial index confirmed.
- **Mutation checks**: (1) dropping `revokeAllForUser` in `resetPassword` → AC-4
  red (service + contract); (2) disabling the reset-token expiry gate → AC-5 red.
  Restored → green.
- **E2E**: architecture names no critical E2E flows → none owed (legitimate skip).

## Direct verification

- **FR-AUTH-013 delivery path** — the worker's `EmailRenderer` renders the
  `password_reset` type into `${PUBLIC_APP_URL}/reset-password?token=…` with the
  1-hour-expiry copy (FEAT-007, unchanged). FEAT-005 enqueues the row; the send is
  FEAT-007's — hence the `(partial)` Test-ref markers on the shared FRs.
- **FR-AUTH-013/NFR-SEC-004 token at rest** — `forgot-password.service.spec`
  observes the DB stores only `SHA-256(raw)` (raw only in the outbox payload) with
  a ~1-hour expiry. Directly checked, not just the 200.
- **FR-AUTH-017 side effect** — AC-4 seeds two sessions, resets, and observes 0
  sessions remain + the prior cookie → 401. Mutation-confirmed.
- **Screen (SCR-WEB-005/006)** — `/reset-password` realizes the manifest states:
  forgot (email-input/error, submit → neutral success), reset (password-input/
  error, success, token invalid/expired via form-error, rate-limited). Conformance
  holds — only design tokens, no raw hex/px (grep clean). Token-presence route
  switch matches the worker's link (ui-design D1).
- **Pending environment** — none. Rate-limit thresholds are config (indicative
  locally); no hard perf NFR binds these endpoints.

## Findings

**Rework (production):** none.

**Design defect:** none.

**Minor (non-blocking):**
- **Flaky-test defect — corrected (see Corrected tests).** Root cause is FEAT-003's
  RateLimitGuard retrofit without updating the FEAT-001/002 contract specs' isolation;
  recorded here because FEAT-005 surfaced it. Fixed as a test-measurement correction.
- **RTM Plan-ref for FR-AUTH-018 + NFR-SEC-006.** FEAT-005 implements and verifies
  the rate-limit on `/auth/forgot` + `/auth/reset` (AC-7), completing the
  endpoint-coverage gap FEAT-003's report flagged. Its acceptance report is appended
  to those Test-ref cells (partial). The **Plan ref** for FR-AUTH-018 lists only
  FEAT-003 — recommend implementation-planning add FEAT-005 so full-verification
  computes correctly (acceptance-verification owns Test ref only, not Plan ref).

## RTM

Accepted → Test ref appended (`features/FEAT-005-reset-password/acceptance-report.md`;
`(partial)` where co-owned):
- Full: **FR-AUTH-012, FR-AUTH-014.**
- Partial: **FR-AUTH-013** (token+enqueue; delivery FEAT-007), **FR-AUTH-017**
  (reset side; change-password side FEAT-006), **FR-AUTH-018 / NFR-SEC-006**
  (forgot/reset endpoints), **NFR-SEC-003** (policy on the reset path),
  **NFR-SEC-004** (reset 1h; verify 24h FEAT-002).
