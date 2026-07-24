# Acceptance Report: FEAT-003 — Sign in (session, lockout, rate-limit)

> Verdict: **Accepted** · Date: 2026-07-24
> Standard: technical-design.md §6 @ f7256d5 · Sources: srs.md (v1.0), use-cases.md (UC-003)
> Repo state audited: d285303

## Verdict summary

FEAT-003 is **accepted — verified**. The standard was re-derived from the SRS
FR statements, UC-003, and the binding NFRs: every FEAT-003 requirement is
covered by ≥1 acceptance criterion, and each criterion faithfully encodes its
source (no coverage gap, no misencoding). All nine criteria (AC-1..AC-9) were
observed green this run across the feature suite (23 tests) and the whole-repo
suite (api 62, worker 20); migration 005 applies clean up and down; boundaries
and lint pass repo-wide. The two highest-value criteria — AC-2 (no
account-enumeration) and AC-5 (account lockout) — were mutation-checked: both
sets of tests went red when the behavior was deliberately broken and green when
restored, confirming they are real guards, not fake-green. No rework or
design-defect findings; partial FRs are scoped and marked accordingly.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-009, UC-003 main | sign-in.service.spec AC-1; sign-in.controller.spec AC-1/AC-4 | faithful (200 + Set-Cookie + session row + counter reset) | green |
| AC-2 | FR-AUTH-010, UC-003 alt 3a | sign-in.service.spec AC-2; sign-in.controller.spec AC-2 | faithful — asserts byte-identical envelopes for unknown-email vs wrong-password; **mutation-checked** | green |
| AC-3 | FR-AUTH-007 (partial), UC-003 alt 3b | sign-in.service.spec AC-3; sign-in.controller.spec AC-3 | faithful (403 only after correct pw; 401 on wrong pw) | green |
| AC-4 | FR-AUTH-016, NFR-SEC-007 (partial) | session.service.spec AC-4; sign-in.controller.spec AC-1/AC-4 | faithful (hash-at-rest; HttpOnly+SameSite; Secure gated on for prod) | green |
| AC-5 | FR-AUTH-019, UC-003 exc-3c | sign-in.service.spec AC-5; sign-in.controller.spec AC-5 | faithful (lock after N; correct-pw-while-locked → 423 + retryAfterSeconds; reset on success); **mutation-checked** | green |
| AC-6 | FR-AUTH-018, NFR-SEC-006, UC-003 exc-2a | rate-limit.guard.spec AC-6; sign-in.controller.spec AC-6 | faithful (429 on /auth/login and on retrofitted /auth/verify/resend) | green |
| AC-7 | FR-AUTHZ-001 (partial) | session.guard.spec AC-7; sign-in.controller.spec AC-7 | faithful (401 without/invalid cookie; 200 + user with valid) | green |
| AC-8 | NFR-SEC-009 (partial) | sign-in.service.spec AC-8; audit.service.spec | faithful (success + failure rows; no password/token in any row) | green |
| AC-9 | validation rule | sign-in.controller.spec AC-9 | faithful (400 validation_failed + fields[]) | green |

## Corrected tests

None — every criterion's test asserted the criterion faithfully on first audit;
no correction was required.

## Independent execution

- **Feature suite** (`common/authz`, `common/audit`, `common/rate-limit`,
  `modules/auth/sign-in`), fresh from repo head: **6 suites, 23 tests — green.**
- **Whole-repo suite** (`npm test`): **api 17 suites / 62 tests, worker 6 / 20 —
  green.** (The `[Audit] audit write failed` and `[SkeletonService] db round-trip
  failed` log lines are the intentional best-effort / db-down negative-path
  tests, not failures.)
- **Boundaries** (`npm run boundaries`): no violations (70 modules). **Lint**
  (`npm run lint`, api+web): pass.
- **Migration 005**: `down` then `up` against the local store — both
  `Migrations complete!`, no error.
- **Mutation checks**: (1) unknown-email throwing `EmailNotVerified` instead of
  `InvalidCredentials` → both AC-2 tests red; (2) lockout gate disabled → both
  AC-5 tests red. Restored → green. Tests genuinely guard the behavior.
- **E2E**: architecture names no critical E2E flows / frameworks → none owed
  (legitimate skip, consistent with FEAT-001/002).

## Direct verification

- **NFR-SEC-007 (session at rest)** — `sessions` columns observed:
  `id, user_id, token_hash, created_at, last_used_at, expires_at` — only the
  hash is stored, no plaintext-token column exists. Cookie flags: HttpOnly +
  SameSite=Lax always; Secure env-gated (asserted on for production config).
  *Partial*: token rotation on privilege change is FEAT-005/006 (no privilege
  change occurs in sign-in).
- **NFR-SEC-009 (audit)** — `audit_log` columns observed:
  `id, user_id, event, ip, detail, created_at`; AC-8 confirms success/failure
  rows are written with no secret material. *Partial*: the ≥90-day retention
  *sweep/enforcement* is not owned by this feature (append-only production now).
- **FR-AUTH-019 (lockout state)** — `users.failed_login_count` +
  `users.locked_until` present; behavior verified by AC-5 + mutation.
- **NFR-SEC-006 / FR-AUTH-018 (rate limit)** — mechanism verified;
  thresholds are config-driven (defaults 30 hits / 900 s window; the SRS values
  are `*(confirm)*`/example). *Indicative*: local thresholds only.
- **Contracts vs §3** — `POST /auth/login` (200 `{status,user}` + Set-Cookie;
  401/403/423/429/400) and `GET /auth/session` (200 `{user}` / 401) match the
  designed shapes; the global filter relays `retryAfterSeconds` on 423/429.
- **Screen (SCR-WEB-004)** — `/signin` realizes the manifest states: default
  (email/password inputs + submit), error (form-error + email/password field
  errors), unverified-prompt (+ resend). Conformance: no raw hex/px literals —
  all design tokens (grep clean).
- **Pending environment** — no hard response-time NFR binds sign-in (argon2
  verification cost is intentional per NFR-SEC-005); the general p95 latency NFR
  is not measured here and needs real infrastructure.

## Findings

**Rework:** none.

**Design defect:** none.

**Minor (non-blocking):**
- **FR-AUTH-018 cross-feature completion.** The FR names the password-reset
  request endpoint among the endpoints to rate-limit; that endpoint does not
  exist yet (FEAT-005). FEAT-003 delivers and verifies the limiter for every
  currently-existing auth endpoint (login, register, verify, verify/resend);
  technical-design §8 records that FEAT-005 must apply the same guard to
  `/auth/forgot` + `/auth/reset`. Recommend the RTM Plan ref for FR-AUTH-018 add
  FEAT-005 so the FR's full-verification computes correctly. Test ref appended
  with the `(partial)` marker to reflect this accurately.
- **`auth_rate_buckets` core-tables note.** Already surfaced in technical-design
  §8 (infra table realizing arch §8's DB-backed throttle; flagged for the
  architecture core-tables list on its next revision). Recorded, not blocking.

## RTM

Accepted → Test ref appended (`features/FEAT-003-sign-in/acceptance-report.md`,
with `(partial)` where the feature implements the requirement partially):
- Full: **FR-AUTH-009, FR-AUTH-010, FR-AUTH-016, FR-AUTH-019.**
- Partial: **FR-AUTH-007** (sign-in verification gate), **FR-AUTH-018 /
  NFR-SEC-006** (existing endpoints; forgot/reset pending FEAT-005),
  **FR-AUTHZ-001** (session-auth half; ownership scoping FEAT-009),
  **NFR-SEC-007** (session cookie; rotation pending FEAT-005/006),
  **NFR-SEC-009** (sign-in events; retention enforcement pending its owner).
