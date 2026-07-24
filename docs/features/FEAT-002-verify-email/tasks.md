# Tasks: FEAT-002 — Verify email + resend

> Executes: docs/features/FEAT-002-verify-email/technical-design.md
> Status: pending per task · Last updated: 2026-07-23
> Note: architecture names no critical E2E flows / test frameworks → no mandatory
> Playwright E2E task (legitimate skip, tasks-guide, mirroring FEAT-001).
> Behavioral tasks use Jest unit + supertest contract tests (the API's runner).

- [x] T1 — Migration 004: add partial index
      `users_verification_token_hash_idx ON users (verification_token_hash)
      WHERE verification_token_hash IS NOT NULL` (design §4).
      Done when: `npm run db:migrate` applies clean and the down migration drops
      the index, against the current schema (last migration 003). No column changes.

- [x] T2 — Shared contracts: add `VERIFY_PATH`, `RESEND_VERIFICATION_PATH`,
      `VerifyRequest`, `VerifyResponse`, `ResendVerificationRequest`,
      `ResendVerificationResponse` to `@todo/shared` (design §3).
      Done when: `npm run build:shared` succeeds and api + web typecheck against them.

- [ ] T3 — Domain (verify): `UsersRepository.findByVerificationTokenHash` +
      `markVerified` (guarded `WHERE verified_at IS NULL`, clears token columns);
      `TokenInvalidError` / `TokenExpiredError`; `AuthService.verifyEmail(token)`
      reusing `VerificationTokenService.hashToken` (design §5; FR-AUTH-006,
      NFR-SEC-004).
      Done when: unit/integration tests for AC-1 (verify success + columns cleared),
      AC-2 (single-use replay → invalid), AC-3 (expired), AC-4 (no match) pass
      against the local test DB.

- [ ] T4 — Domain (resend): `UsersRepository.findUnverifiedByEmail` +
      `rotateVerificationToken`; `EmailOutboxRepository.lastVerificationEnqueuedAt`;
      `AuthService.resendVerification(email)` — neutral no-op for absent/verified,
      cooldown check (`RESEND_COOLDOWN_SECONDS`), else rotate-token + enqueue in one
      transaction; add `resendCooldownSeconds` to `config.ts` (design §5, D3/D4/D5;
      FR-AUTH-008).
      Done when: integration tests for AC-6 (rotate + new outbox row + old token now
      invalid), AC-7 (neutral no-op for unknown / already-verified), AC-8 (cooldown
      suppresses a second send) pass against the local test DB.

- [ ] T5 — Contract: add `POST /auth/verify` and `POST /auth/verify/resend` to
      `AuthController` with `VerifyDto` / `ResendVerificationDto`; map
      `TokenExpiredError`→`400 token_expired`, `TokenInvalidError`→`400
      token_invalid`; resend always returns neutral `200` (design §3; UC-002 flows).
      Done when: supertest contract tests pass for `200 {status:"verified"}`,
      `400 token_expired`/`token_invalid`, neutral `200` resend, and `400
      validation_failed` for missing token / malformed email (AC-9), each rendering
      the `ApiError` envelope.

- [ ] T6 — UI integration point: build the `/verify` page (SCR-WEB-003) consuming
      `POST /auth/verify` — verifying / success / expired-or-invalid states, the
      last offering **sign in** and **resend**; wire the Resend control on the
      `/verify-email` notice (SCR-WEB-002) to `POST /auth/verify/resend` with its
      resend-sent state. (Screens themselves are ui-design's manifest; this task is
      the contract wiring only.)
      Done when: `/verify` reads `?token=`, POSTs it, and renders success vs.
      expired/invalid from the response; the notice's Resend button posts the email
      and shows the neutral resend-sent confirmation.

- [ ] T7 — Verify: all acceptance criteria AC-1..AC-9 (design §6) demonstrably
      pass; `npm run boundaries`, `npm run lint`, and the api + shared test suites
      are green; migration up/down clean.
      Done when: the full feature suite passes and the checklist above is satisfied.

> Deferred dependency (not a blocker for this feature's FRs): placing
> `POST /auth/verify` and `POST /auth/verify/resend` behind the shared per-IP
> rate limiter (FR-AUTH-018, NFR-SEC-006) — foundations, see technical-design §8.
> Resend is protected now by the feature-local cooldown (D4); add the IP guard to
> both endpoints when that mechanism lands (foundations task / FEAT-003).
</content>
