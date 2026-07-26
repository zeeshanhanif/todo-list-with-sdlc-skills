# Acceptance Report: FEAT-006 — Change password (signed-in)

> Verdict: **Accepted** · Date: 2026-07-26
> Standard: technical-design.md §6 (AC-1..AC-9) @ 109130c · Sources: docs/srs.md (FR-AUTH-015/017/004, FR-AUTHZ-001, NFR-SEC-003/005/006/007/009), docs/use-cases.md (UC-006)
> Repo state audited: 7a7be71 (head after the Phase-3 test corrections)

## Verdict summary

Accepted. All nine criteria are covered by tests that assert what the criteria
say — after this audit strengthened four of them (AC-5, AC-7, AC-8, AC-9), which
the production code then passed **unchanged**, so the weakness was in the
measurement, not the behavior. Four mutation checks confirmed the suite actually
fails when the feature's core claims are broken (revoke-all, cookie rotation,
policy gate, current-password verification). All suites, the build, and the E2E
suite were observed green in this run, and the FR side effects were verified
directly in Postgres (one live session after a change; audit rows present and
secret-free). No rework and no design-defect findings; six minor/observational
items are recorded below, two of them inherited debt with named owners.

**Milestone:** with this acceptance, **FR-AUTH-017 is now fully verified** — both
features in its Plan ref (FEAT-005 reset, FEAT-006 change) have accepted reports.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-015, UC-006 main 2–5; NFR-SEC-005 | change-password.controller.spec "AC-1"; change-password.service.spec "AC-1" | faithful (status + state change + hash shape + old password dead) | green |
| AC-2 | FR-AUTH-017 (change half), UC-006 postcondition | controller "AC-2"; service "AC-2/AC-3" | faithful (second device 200 → 401 across the change) | green |
| AC-3 | NFR-SEC-007 (rotation), UC-006 main 5 | controller "AC-3"; service "AC-2/AC-3" | faithful (new cookie ≠ presented, new resolves, old 401, HttpOnly+SameSite); user-identity half asserted in the service spec | green |
| AC-4 | FR-AUTH-015, UC-006 alt 3a | controller "AC-4"; service "AC-4" | faithful (code + fields[] + no Set-Cookie + password, sessions and lockout counters untouched) | green |
| AC-5 | FR-AUTH-004, NFR-SEC-003, UC-006 alt 3b | controller "AC-5" (**corrected**); service "AC-5" | was weak (message non-empty) → corrected to assert the specific requirement | green |
| AC-6 | FR-AUTHZ-001 | controller "AC-6" | faithful (no cookie / bogus / revoked → 401 + no password write); expired-cookie case covered by session.service.spec | green |
| AC-7 | validation | controller "AC-7" (**corrected**) | was weak (fields[] non-empty) → corrected to assert the field names | green |
| AC-8 | NFR-SEC-006 (FR-AUTH-018 pattern) | controller "AC-8" (**corrected**) | was weak (status only, one direction) → corrected to assert code + retryAfterSeconds + both bucket-isolation directions | green |
| AC-9 | NFR-SEC-009 (recording half) | service "AC-9" (**corrected**) | was weak (event presence) → corrected to assert one row each + absence of the rotated session token | green |

**Standard audited against its sources (Phase 2).** Every FR in the feature's
trace has ≥1 criterion; both UC-006 alternates (3a, 3b) are represented; the
binding NFRs each appear as a criterion. One interpretation deserves recording:
FR-AUTH-015 says "invalidate **all** of a user's existing sessions", while UC-006's
postcondition says "**other** sessions are invalidated" and keeps the user signed
in. The design resolves this by revoking every pre-change session and issuing a
replacement for the caller (D1), which satisfies the FR literally (no credential
minted before the change survives), UC-006's postcondition, and NFR-SEC-007's
rotation clause simultaneously. Verified directly: exactly one session row exists
after a change, and its token differs from the one presented. Not a defect.

## Corrected tests

Four, all committed as `7a7be71 FEAT-006 acceptance: strengthen tests for AC-5,
AC-7, AC-8, AC-9`. Each moves the assertion toward the criterion; none was
changed toward the code, and the code passed all four without modification.

- **AC-5** asserted only that the `newPassword` field message was non-empty. The
  criterion requires the *specific* requirement (NFR-SEC-003's bound). Now
  matched against `PASSWORD_MIN_LENGTH` — observed message: "Must be at least 10
  characters."
- **AC-7** asserted `fields[].length > 0`. The criterion requires `fields[]` to
  **name** the offending field. Now asserts `currentPassword` and `newPassword`
  by name.
- **AC-8** asserted only HTTP 429, and tested bucket isolation in one direction.
  The criterion names the `rate_limited` code and `retryAfterSeconds`, and says
  "and vice versa". Now asserts both, plus the login→change-password direction
  (exhausting login's bucket on an IP leaves change-password reachable).
- **AC-9** asserted event *presence*. The criterion says **one** row of each kind
  and forbids secrets. Now asserts exact counts and that the rotated session
  token does not appear in the trail.

## Independent execution

Run fresh from repo head with the harness's own commands. No claim from the
implementation session was taken as evidence.

| Check | Command | Observed |
| :-- | :-- | :-- |
| Feature suite | `npx jest src/modules/auth/change-password src/common/authz` (apps/api) | 5 suites / **25 passed** |
| Whole repo | `npm test` (api + worker) | 24 suites / **95 passed**; 6 suites / **20 passed** |
| Boundaries | `npm run boundaries` | no violations (85 modules, 101 deps) |
| Lint | `npm run lint` | 0 issues |
| Build | `npm run build` | all workspaces; `/settings/security` and `/settings/security/password` present as dynamic routes |
| E2E | `npm run test:e2e` | **4 passed** (5.4s) — no new path owed by this feature |
| Migrations | `npm run db:migrate` | "No migrations to run" — matches design §4/D5 (no migration owed) |

No flakiness observed; no test passed only on retry.

**Mutation checks** (Phase 3, "exercised?"), each applied to production code, run,
then reverted — repo confirmed clean afterward:

| Mutation | Expectation | Observed |
| :-- | :-- | :-- |
| Drop `revokeAllForUser` from the change transaction | FR-AUTH-017 tests red | 4 tests failed |
| Drop the rotated `Set-Cookie` in the controller | AC-3 red | 1 test failed |
| Remove the new-password policy gate | AC-5 red | 2 tests failed |
| Accept any current password (`if (false)`) | AC-4 red | 4 tests failed |

**Anti-fake-green review.** `git diff bc6e11c..HEAD -- '*spec*'` shows **607
insertions, 0 deletions** across three test files: no assertion was loosened, no
case deleted, no skip/`only`/`todo` introduced, and no behavior-under-test
mocked. The suites are integration-level against real Postgres.

## Direct verification

- **FR-AUTH-017 (side effect, observed in the DB).** After a live change through
  the web tier: `SELECT count(*) FROM sessions` for the user = **1**, and the
  browser's `sid` differed from the pre-change value — every prior session row
  gone, one replacement issued.
- **NFR-SEC-009 (audit entries inspected, not inferred).** `audit_log` for the
  audited user held `sign_in_success`, `password_change_failure` (detail
  `{"reason": "wrong_current_password"}`), `password_changed`, and a second
  failure row — each with the client IP. A scan for the plaintext passwords, the
  Argon2 prefix, and the session token across `audit_log.detail` returned **0
  rows**. Observation (not a finding): attempts rejected by the rate limiter
  produce no audit row, since the guard runs before the handler — consistent with
  NFR-SEC-009, which enumerates credential events, not throttled requests.
- **Contract shapes vs §3.** `401` → `{"statusCode":401,"code":"unauthenticated",
  "message":"Authentication required."}`; `200` → `{"status":"password_changed"}`;
  `400 current_password_invalid` and `400 validation_failed` carry `fields[]` with
  the designed field names. All match §3.1.
- **NFR-PERF-001 — indicative, not binding.** The SRS scopes the 300 ms bound to
  task operations, so it does not bind this endpoint. Measured anyway on the local
  stack (dev mode, local Postgres, Docker Desktop): 3 samples at **59 / 59 / 61
  ms** end-to-end including Argon2id verify + hash and the three-statement
  transaction. Indicative only — not a cloud-environment measurement.
- **Screens vs the manifest.** Every claimed state rendered and was observed in a
  real browser: SCR-WEB-014 `default` (row present, nav item `aria-current="page"`);
  SCR-WEB-015 `default`, `success` ("…still signed in on this device; any other
  devices have been signed out."), `error` — **all three branches**, including the
  `rate_limited` form-level alert that implementation never rendered — and
  `unauthenticated` (cookie cleared → redirect to `/signin`). Conformance claim
  spot-checked: no raw hex/rgb in the feature's web sources, and the alert's
  computed background `rgb(254, 243, 199)` is exactly `--color-warning-subtle`
  (#FEF3C7). Both manifest locators resolve to their ui-design.md headings.

**Pending environment (non-blocking):** NFR-SEC-009's retention half ("retained
for ≥ 90 days") is not verifiable locally and no retention mechanism exists for
`audit_log` yet — its Test refs remain partial. What would verify it: a retention
policy on the audit store plus evidence of enforcement in the deployed
environment.

## Findings

**Rework: none.**

**Design defect: none.**

**Minor / observational:**

1. **Four criteria were under-asserted by the implementation's own tests**
   (AC-5, AC-7, AC-8, AC-9 — corrected above). Individually small; as a cluster
   it's a test-quality signal worth naming: the pattern in each case was
   asserting the *shape* of a response (a field exists, a status matched) rather
   than the *content* the criterion specifies. Recorded as a note for the next
   feature's implementation, not as rework — the behavior was correct throughout.
2. **AC-3's "same user" and AC-6's expired-cookie halves are covered by
   composition** across the service and session-service specs rather than at the
   contract layer. Adequate coverage; noted so a future reader doesn't mistake the
   contract spec for the whole story.
3. **Inherited, not this feature's: the reset path records no audit event.**
   NFR-SEC-009 names password change *and* reset; FEAT-006 added the change
   events, but `AuthService.resetPassword` (FEAT-005, accepted 2026-07-25) writes
   none. This is verified behavior falling short of a Should-level NFR → belongs
   on the **maintenance route** (defect ledger `docs/defects.md`), owner: the
   orchestrator to file, FEAT-005's code to fix. It does not affect FEAT-006's
   verdict; FEAT-006's own events were observed.
4. **Inherited, not this feature's: the app shell has no mobile drawer.**
   design.md §3 specifies a drawer below `md`; the shell keeps its 280px sidebar,
   so at 390px the content column is ~115px. Recorded by implementation in
   technical-design §8 and confirmed here. No FEAT-006 criterion covers it; owner
   is the shell (FEAT-009 sidebar work or a foundations task). The feature's own
   responsive obligation — the form's action row stacking below `sm` — was
   verified.
5. **FR-AUTH-018 scope claim honored.** The design explicitly did *not* claim
   change-password as FR-AUTH-018 coverage (the SRS enumerates other endpoints);
   the RTM append for FR-AUTH-018 was correspondingly **not** made. Rate limiting
   here is recorded under NFR-SEC-006.
6. **Audit-run artifact, no product impact.** An initial Phase-5 setup attempt
   returned 401 because the auditor's own low `AUTH_RATELIMIT_MAX=4` throttled the
   *provisioning* requests (the localhost bucket already held hits from the E2E
   run). Re-provisioned on a separate IP bucket; recorded so the transcript's 401
   is not mistaken for a defect.

## RTM

Test ref appended (append-only, Test ref column only) for:

| Req | Appended |
| :-- | :-- |
| FR-AUTH-015 | `features/FEAT-006-change-password/acceptance-report.md` (full — FEAT-006 is its only Plan ref feature) |
| FR-AUTH-017 | `…/acceptance-report.md (partial)` — **FR now fully verified by computation** (FEAT-005 + FEAT-006 both accepted) |
| FR-AUTHZ-001 | `…(partial — authenticated endpoint)` |
| NFR-SEC-003 | `…(partial — change path)` |
| NFR-SEC-005 | `…(partial — change path)` |
| NFR-SEC-006 | `…(partial — change endpoint)` |
| NFR-SEC-007 | `…(partial — rotation on password change)` |
| NFR-SEC-009 | `…(partial — password-change events)` |

FR-AUTH-004 was deliberately **not** appended: its Plan ref is FEAT-001, and
FEAT-005 set the precedent of recording policy-enforcement-on-other-paths under
NFR-SEC-003 instead. The policy-on-change evidence is AC-5, discoverable through
NFR-SEC-003's row (which traces UC-006).
