# Tasks: FEAT-005 — Forgot / reset password

> Executes: docs/features/FEAT-005-reset-password/technical-design.md
> Status: pending per task · Last updated: 2026-07-25
> Note: the worker already renders the `password_reset` email (FEAT-007) — no
> worker change. Architecture names no critical E2E flows / frameworks → no
> mandatory Playwright E2E task (legitimate skip, mirroring FEAT-001..004).
> Behavioral tasks use Jest integration + supertest contract tests.

- [x] T1 — Migration 006 (`1721530000000_password-reset.js`): add
      `reset_token_hash` + `reset_token_expires_at` to `users` and the partial
      index `users_reset_token_hash_idx … WHERE reset_token_hash IS NOT NULL`
      (design §4).
      Done when: `npm run db:migrate` applies clean and the down migration drops
      the index + columns, against the current schema (last migration 005).

- [x] T2 — Shared contracts (`@todo/shared`): add `FORGOT_PATH`, `RESET_PATH`,
      `ForgotPasswordRequest`, `ForgotPasswordResponse` (`{status:"reset_requested"}`),
      `ResetPasswordRequest` (`{token,password}`), `ResetPasswordResponse`
      (`{status:"password_reset"}`). Design §3.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      them.

- [ ] T3 — Domain (forgot): `ResetTokenService` (issue + hashToken) +
      `resetTokenTtlHours` in `config.ts`; `UsersRepository.findIdByEmail` +
      `setResetToken`; `EmailOutboxRepository.enqueuePasswordReset` (type
      `password_reset`); `AuthService.requestPasswordReset` (neutral no-op for
      unknown; else setResetToken + enqueue in one tx). Design §5; FR-AUTH-012/013.
      Done when: integration tests pass — AC-1 (registered → token stored + one
      `password_reset` outbox row; unknown → nothing stored/enqueued; identical
      neutral outcome) and AC-2 (only the SHA-256 hash stored; raw only in the
      outbox payload; expiry ≈ now + TTL).

- [ ] T4 — Domain (reset): `UsersRepository.findByResetTokenHash` +
      `updatePasswordAndClearReset`; `SessionsRepository.deleteByUserId` (FR-AUTH-017);
      `AuthService.resetPassword` per the §5 order (validate token → policy →
      update + consume + invalidate sessions, one tx). Design §5; FR-AUTH-014/017.
      Done when: integration tests pass — AC-3 (valid token + password → password
      changed + token cleared + single-use replay → invalid), AC-4 (all sessions
      deleted), AC-5 (expired → token_expired, unknown/consumed → token_invalid,
      password unchanged), AC-6 (policy fail → PasswordPolicyError, password + token
      untouched).

- [ ] T5 — Contract: `AuthController` `POST /auth/forgot` (`ForgotPasswordDto`) +
      `POST /auth/reset` (`ResetPasswordDto`), both `@UseGuards(RateLimitGuard)`;
      map `TokenExpiredError`/`TokenInvalidError` → `400 token_expired`/`token_invalid`,
      `PasswordPolicyError` → `400 validation_failed` field=`password`. Design §3;
      UC-005 flows.
      Done when: supertest contract tests pass for AC-1 (neutral 200), AC-3 (200
      password_reset), AC-4 (prior session cookie → 401 after reset), AC-5
      (400 token_expired/token_invalid), AC-6 (400 validation_failed + password
      field), AC-7 (429 on forgot and on reset), AC-8 (400 validation_failed +
      fields[]), each rendering the `ApiError` envelope.

- [ ] T6 — UI integration point: serve **SCR-WEB-005** (forgot request) at
      `/reset-password` (no token) consuming `POST /api/auth/forgot` with the
      neutral submitted state, and **SCR-WEB-006** (set new password) at
      `/reset-password?token=…` consuming `POST /api/auth/reset` with
      default / invalid-or-expired / success states (success → link to sign in).
      Add the BFF routes `POST /api/auth/forgot` and `POST /api/auth/reset`
      (mirror the register/verify proxies). (Screens are ui-design's manifest;
      this task is the contract wiring only.)
      Done when: submitting an email shows the neutral confirmation; opening a
      valid link sets a new password and routes to `/signin`; an expired/invalid
      link renders the recovery state.

- [ ] T7 — Verify: acceptance criteria AC-1..AC-8 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, and the api + shared test suites are
      green; migration 006 up/down clean.
      Done when: the full feature suite passes and the checklist above is satisfied.
