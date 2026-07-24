# Tasks: FEAT-003 — Sign in (session, lockout, rate-limit)

> Executes: docs/features/FEAT-003-sign-in/technical-design.md
> Status: pending per task · Last updated: 2026-07-24
> Note: architecture names no critical E2E flows / test frameworks → no mandatory
> Playwright E2E task (legitimate skip, tasks-guide, mirroring FEAT-001/002).
> Behavioral tasks use Jest unit + supertest contract tests (the API's runner);
> integration specs use `DbService` against local Postgres.

- [x] T1 — Migration 005 (`1721520000000_sign-in.js`): create `sessions`
      (§4.1) + `audit_log` (§4.3) + `auth_rate_buckets` (§4.4); add
      `failed_login_count` / `locked_until` to `users` (§4.2); indexes per §4
      (`sessions_token_hash_key` unique, `sessions_user_id_idx`, `audit_log`
      `(created_at)` + `(user_id)`). Design §4.
      Done when: `npm run db:migrate` applies clean and the down migration
      reverses all objects, against the current schema (last migration 004).

- [x] T2 — Shared contracts (`@todo/shared`): add `LOGIN_PATH`, `SESSION_PATH`,
      `SESSION_COOKIE`, `SignInRequest`, `SignInResponse`, `SessionResponse`,
      and the new error `code` literals (`invalid_credentials`,
      `email_not_verified`, `account_locked`, `rate_limited`, `unauthenticated`).
      Design §3.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      them.

- [x] T3 — `common/authz` sessions: `SessionsRepository`
      (`create`, `findLiveByTokenHash` joined to `users` with `expires_at >
      now()`, `touchLastUsed`) + `SessionService` (`issue`, `resolve`,
      `hashToken`) + session-cookie constants; session TTL in `config.ts`.
      Design §5, §4.1; FR-AUTH-016, NFR-SEC-007 (D1).
      Done when: integration tests pass — `issue` writes a row storing only the
      `SHA-256` hash (raw token in no column) with the configured `expires_at`
      (AC-4); `resolve` returns `{id,email}` for a live token and touches
      `last_used_at`; returns null for unknown/expired tokens.

- [ ] T4 — `common/authz` guard: `SessionGuard` (`CanActivate`) reading the
      session cookie via `SessionService.resolve`, attaching `req.user`, throwing
      `401 unauthenticated`; `@CurrentUser()` decorator; wire
      `app.use(cookieParser())` in `app-setup.ts` (add `cookie-parser` dep).
      Design §3.3, §5; FR-AUTHZ-001 (partial).
      Done when: integration tests pass — the guard rejects a request with no /
      invalid cookie (401 envelope) and admits one with a valid session cookie,
      exposing the current user (AC-7).

- [ ] T5 — `common/audit`: `AuditRepository` (append-only insert) +
      `AuditService.record(event,{userId?,ip?,detail?})`, best-effort (never
      throws into the caller). Design §5, §4.3; NFR-SEC-009 (partial).
      Done when: a unit/integration test shows `record` appends a row with the
      given `event`/`user_id`/`ip` and that a repository failure does not
      propagate to the caller.

- [ ] T6 — `common/rate-limit`: `RateLimitRepository.hitAndCount(ip,route,
      windowStart)` (upsert-increment on `auth_rate_buckets`) + `RateLimitGuard`
      throwing `429 rate_limited` with `retryAfterSeconds` when over the max;
      `AUTH_RATELIMIT_WINDOW_SECONDS` / `AUTH_RATELIMIT_MAX` in `config.ts`.
      Design §3.4, §4.4; FR-AUTH-018, NFR-SEC-006 (D8).
      Done when: integration tests pass — attempts up to the max succeed, the
      next returns `429 rate_limited` with `retryAfterSeconds`, and a new window
      resets the count (AC-6, mechanism).

- [ ] T7 — Domain (sign-in + lockout): `UsersRepository.findByEmailForAuth` /
      `recordFailedLogin` / `resetFailedLogin`; `InvalidCredentialsError` /
      `EmailNotVerifiedError` / `AccountLockedError`; `AuthService.signIn` per the
      §5 order (lockout check → password verify → verification check → issue
      session via `SessionService` → audit). Design §5; FR-AUTH-009/010/007/016/019.
      Done when: integration tests pass for AC-1 (success + session + counter
      reset), AC-2 (unknown email and wrong password → identical
      `invalid_credentials`, no session), AC-3 (unverified + correct pw →
      `email_not_verified`; unverified + wrong pw → `invalid_credentials`), AC-5
      (Nth consecutive failure locks; correct pw while locked still rejected;
      success resets), AC-8 (success/failure audit rows written, no secrets).

- [ ] T8 — Contract: `AuthController` `POST /auth/login` (`SignInDto`; maps
      domain errors → 401/403/423/429; sets `Set-Cookie` via passthrough `res`)
      + `GET /auth/session` (`@UseGuards(SessionGuard)`, `@CurrentUser()`); apply
      `@UseGuards(RateLimitGuard)` to `login` and **retrofit** onto the existing
      `register`, `verify`, `verify/resend`; register the `common/*` providers in
      `AuthModule`. Design §3; UC-003 flows.
      Done when: supertest contract tests pass for AC-1 (200 + `Set-Cookie`
      attributes), AC-2 (401 identical body), AC-3 (403 / 401), AC-5 (423 +
      `retryAfterSeconds`), AC-6 (429 on `/auth/login` and on a retrofitted
      endpoint), AC-7 (`GET /auth/session` 401 vs 200), AC-9 (400
      `validation_failed` + `fields[]`), each rendering the `ApiError` envelope.

- [ ] T9 — UI integration point: build the `/login` page (SCR-WEB-004) consuming
      `POST /auth/login` — default / submitting / error states, mapping
      `email_not_verified` to a verify+resend affordance (reusing FEAT-002's
      resend), `account_locked` / `rate_limited` to a retry-after message, and
      `invalid_credentials` to the generic error; on success route into the app
      shell (SCR-WEB-007). Add the BFF routes `POST /api/auth/login` (relaying
      `Set-Cookie`) and `GET /api/auth/session` (forwarding `Cookie`) per D6.
      (Screens themselves are ui-design's manifest; this task is the contract +
      cookie wiring only.)
      Done when: sign-in with valid credentials sets the session cookie via the
      BFF and lands in the app; the error branches render their designed states;
      `GET /api/auth/session` reflects auth state.

- [ ] T10 — Verify: all acceptance criteria AC-1..AC-9 (design §6) demonstrably
      pass; `npm run boundaries`, `npm run lint`, and the api + shared test suites
      are green; migration 005 up/down clean.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
</content>
