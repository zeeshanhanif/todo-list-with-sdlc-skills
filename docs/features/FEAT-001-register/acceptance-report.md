# Acceptance Report: FEAT-001 — Register account + bootstrap Inbox

> Verdict: **Accepted** · Date: 2026-07-22
> Standard: technical-design.md §6 @ 84a4d80 · Sources: docs/srs.md, docs/use-cases.md
> Repo state audited: 84a4d80 (FEAT-001 T9)

## Verdict summary

FEAT-001 is **accepted — verified**. Every acceptance criterion (AC-1..AC-9) is
faithfully encoded from its FR/UC/NFR source and covered by a test that asserts the
criterion's actual claim; all suites were re-run fresh and observed green (api
24/24, worker 1/1, e2e 4/4), and every requirement was additionally verified by
direct observation against a live API and the real database (201 + rows, and the
409/400 error envelopes matching technical-design §3 exactly). No rework or
design-defect findings; three non-blocking minor notes are recorded, all
consistent with decisions the design already documented. RTM Test ref appended.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-001; UC-001 main | auth.service.spec (unverified user), auth.controller.spec (201) | faithful | green + live: 201 `{status:verification_sent}`, `verified_at` NULL |
| AC-2 | FR-AUTH-002; UC-001 alt-3a | auth.service.spec, auth.controller.spec | faithful | green + live: 409 `email_taken`, case-insensitive, no 2nd row |
| AC-3 | FR-AUTH-003; UC-001 alt-3b | auth.controller.spec | faithful | green + live: 400 `validation_failed`, field `email` |
| AC-4 | FR-AUTH-004, NFR-SEC-003; UC-001 alt-3b | password-policy.service.spec, auth.controller.spec | faithful | green + live: 400, field `password` — "≥10" and "too common" |
| AC-5 | NFR-SEC-005 | password-hasher.spec | faithful | green + live: stored hash prefix `$argon2id$`, verifies |
| AC-6 | FR-LIST-003 | auth.service.spec | faithful | green + live: one `Inbox`, `is_default=true`, owned |
| AC-7 | FR-AUTH-005, NFR-SEC-004 | auth.service.spec, verification-token.service.spec | faithful | green + live: outbox `pending`+token; TTL 24.0h; hash=SHA-256(token) (unit) |
| AC-8 | ADR-003 (atomicity) | auth.service.spec (forced mid-tx failure) | faithful | green: no orphan user on rollback |
| AC-9 | SW-002; UC-001 exc-5a | auth.service.spec (status pending) | faithful | green + live: outbox `pending`, no send in request path |

Standard audit: every feature FR (FR-AUTH-001..005, FR-LIST-003) has ≥1 criterion;
binding NFRs (SEC-003/004/005) appear as concrete criteria; UC-001 main + alt-3a +
alt-3b + exc-5a are represented. No misencodings; no tombstoned references.

## Corrected tests

None — every test audited faithful as written (asserts status **and** state change,
error **and** its envelope shape, boundary messages at the boundary).

## Independent execution (repo @ 84a4d80, harness commands)

- **Unit suites** (`npm test`): api **24/24** (8 suites), worker **1/1** — green.
- **E2E** (`npm run test:e2e`): **4/4** — skeleton health + 3 signup paths — green.
- **Boundaries** (`npm run boundaries`): clean (42 modules). **Lint** (`npm run lint`): clean.
- **Migrations**: 002 `down` drops users/lists/email_outbox cleanly, `up` recreates — clean cycle.
- No flakiness observed (no retries needed).

## Direct verification

- **Live API** (`node apps/api/dist/main.js`, real Postgres):
  - Valid `POST /auth/register` → 201; DB inspected directly: `users.verified_at`
    NULL (FR-AUTH-001), `password_hash` begins `$argon2id$` (NFR-SEC-005),
    `verification_token_expires_at` = now()+24.0h (NFR-SEC-004); one `lists` row
    `Inbox`/`is_default=true` (FR-LIST-003); one `email_outbox` row
    `type=verification`/`status=pending` carrying the token (FR-AUTH-005, AC-9).
  - Error paths matched technical-design §3 verbatim: 409 `email_taken`
    (case-insensitive), 400 `validation_failed` field `email`, 400 field `password`
    ("Must be at least 10 characters." / "This password is too common — pick another.").
- **Contracts**: request/response/error shapes as implemented match §3 (observed).
- **Screens** (manifest spot-check): SCR-WEB-001 (default, field-error) and
  SCR-WEB-002 (default) render and are exercised by the e2e; conformance holds —
  no raw hex/values in the feature UI (tokens only); code-native locators resolve.
- **NFRs**: no hard performance bound binds this endpoint (NFR-PERF-001 scopes to
  task CRUD, not registration; Argon2id is intentionally slow) — nothing pending environment.

## Findings

**Rework:** none.
**Design defect:** none.
**Minor (non-blocking, all pre-recorded in the design):**
- Breach check is a **bundled curated common-password subset** (design D2), not a
  comprehensive breached-password service. Satisfies NFR-SEC-003's "commonly-used"
  intent for the MVP; broader coverage (e.g. a HIBP-backed port) is the documented
  swap point. Recorded, not blocking.
- FR-AUTH-005 is delivered **partially** by FEAT-001 (unique, time-limited token
  **enqueued**); actual email delivery is FEAT-007 and single-use *consumption* is
  FEAT-002 (verify). Test ref marked `(partial)`.
- SCR-WEB-002's `resend-sent` / `rate-limited` states are **designed** but their
  implementation is deferred to FEAT-002 (needs `POST /auth/verify/resend`) — as
  recorded in ui-design.md and the manifest note. Consistent, not a gap in FEAT-001.
- (Context, not a FEAT-001 requirement) Per-IP rate limiting on `/auth/register`
  (FR-AUTH-018, NFR-SEC-006) remains the foundations dependency from design §8.

## RTM

Accepted → Test ref appended (Test ref column only, append-only) to:
FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-LIST-003 →
`features/FEAT-001-register/acceptance-report.md`; and
FR-AUTH-005 → `features/FEAT-001-register/acceptance-report.md (partial)`.
