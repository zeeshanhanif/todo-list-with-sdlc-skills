# Tasks: FEAT-006 — Change password (signed-in)

> Executes: docs/features/FEAT-006-change-password/technical-design.md
> Status: pending per task · Last updated: 2026-07-26
> Notes: **no migration** (design §4/D5) — the list starts at the contract layer.
> Architecture names no critical E2E flows / frameworks → no mandatory Playwright
> E2E task (legitimate skip, mirroring FEAT-001..005). Behavioral tasks use the
> established Jest integration + supertest contract patterns
> (`reset-password.*.spec.ts` are the closest models). `apps/web/AGENTS.md`: read
> `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`): add `CHANGE_PASSWORD_PATH`
      (`/auth/change-password`), `ChangePasswordRequest
      { currentPassword, newPassword }`, `ChangePasswordResponse
      { status: "password_changed" }`, and
      `AUTH_ERROR_CODES.currentPasswordInvalid = "current_password_invalid"`
      (design §5, D3).
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols.

- [ ] T2 — Session-rotation seam: give `SessionsRepository.create` and
      `SessionService.issue` the optional `TxClient` parameter its sibling
      `deleteByUserId` already has, so issuance can join a transaction
      (design §5, D2). No behavior change for existing callers.
      Done when: the existing `session.service.spec.ts` /
      `session-revoke.service.spec.ts` / sign-in suites stay green **and** a new
      test shows atomicity is real: inside a rolled-back `db.transaction`,
      `issue(userId, tx)` leaves no `sessions` row (mirroring
      `db.service.transaction.spec.ts`).

- [ ] T3 — Domain: `UsersRepository.findPasswordHashById`;
      `CurrentPasswordInvalidError` in `auth.errors.ts`; `AUDIT_EVENTS`
      `passwordChanged` + `passwordChangeFailure`;
      `AuthService.changePassword({ userId, currentPassword, newPassword, ip })`
      per the §5 order — verify current → policy-check new → one transaction
      (`updatePasswordAndClearReset` → `revokeAllForUser(tx)` →
      `issue(userId, tx)`) → audit. Design §5; FR-AUTH-015, FR-AUTH-017, D1/D4/D6.
      Done when: integration tests pass — AC-1 (hash changed, Argon2id, old
      password no longer verifies), AC-2 (all pre-change sessions gone), AC-3 (a
      new session row exists for the caller with a different token),
      AC-4 (wrong current password → `CurrentPasswordInvalidError`, password and
      sessions untouched, `failed_login_count`/`locked_until` unchanged — D4),
      AC-5 (policy failure → `PasswordPolicyError`, nothing changed),
      AC-9 (`password_changed` / `password_change_failure` rows with no secrets),
      plus D6 (a pending reset token is cleared by the change).

- [ ] T4 — Contract: `AuthController` `POST /auth/change-password` with
      `ChangePasswordDto` (`@IsString @IsNotEmpty` on both fields),
      `@UseGuards(SessionGuard, RateLimitGuard)`, `@CurrentUser()` for the user id
      and `clientIp(req)` for the audit/limiter; set the rotated cookie exactly as
      `login` does; map `CurrentPasswordInvalidError` →
      `400 current_password_invalid` (field `currentPassword`) and
      `PasswordPolicyError` → `400 validation_failed` (field `newPassword`).
      Design §3; UC-006 flows.
      Done when: supertest contract tests pass for AC-1 (200 password_changed +
      new password signs in), AC-2 (second device's cookie → 401 after the
      change), AC-3 (response `sid` differs from the presented one; new cookie
      resolves `GET /auth/session`, old one 401), AC-4 (400
      current_password_invalid + caller's cookie still resolves), AC-5 (400
      validation_failed + `newPassword` field), AC-6 (401 unauthenticated with
      no/expired/revoked cookie, no password change), AC-7 (400 validation_failed
      + `fields[]`), AC-8 (429 `rate_limited` in its own bucket — login's
      allowance unaffected), each rendering the `ApiError` envelope.

- [ ] T5 — UI integration point: BFF route `POST /api/auth/change-password` that
      forwards the browser `cookie` + `x-forwarded-for` to the API and **relays
      the API's `set-cookie`** back (login's relay + session's forward, design
      §5/D1); wire **SCR-WEB-015** (change-password form: default / field-error /
      success states, consuming that route) and the **SCR-WEB-014** Security &
      Account hub entry that reaches it. (Screens are ui-design's manifest; this
      task is the contract wiring only.)
      Done when: signed in, submitting the form with the correct current password
      shows the success state and the browser keeps working without re-signing-in
      (rotated cookie accepted); a wrong current password renders the
      `currentPassword` field error; a weak new password renders the policy
      requirement on `newPassword`.

- [ ] T6 — Verify: acceptance criteria AC-1..AC-9 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, and the api + shared test suites are
      green; no migration to apply (design §4) — confirm `npm run db:migrate` is
      a no-op at migration 006.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
