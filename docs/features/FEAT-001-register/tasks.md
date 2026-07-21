# Tasks: FEAT-001 — Register account + bootstrap Inbox

> Executes: docs/features/FEAT-001-register/technical-design.md
> Status: pending per task · Last updated: 2026-07-21
> Note: architecture names no critical E2E flows / test frameworks → no mandatory
> Playwright E2E task (legitimate skip, tasks-guide). Behavioral tasks use Jest
> unit + supertest contract tests (the API's established runner).

- [x] T1 — Migration 002: create `users`, `lists` (minimal), `email_outbox` (minimal)
      with columns/indexes/constraints (design §4).
      Done when: `npm run db:migrate` applies clean, and the down migration drops
      all three (leaving `skeleton_ping`), against the current schema.

- [x] T2 — Shared contracts: add `REGISTER_PATH`, `RegisterRequest`,
      `RegisterResponse`, `ApiError`, `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`
      to `@todo/shared` (design §3).
      Done when: `npm run build:shared` succeeds and api + web typecheck against them.

- [x] T3 — Infra: add `DbService.transaction<T>(fn)` (BEGIN/COMMIT/ROLLBACK on a
      pooled client) (design §5).
      Done when: an integration test shows commit persists and a thrown error rolls
      back (against the local test DB).

- [x] T4 — Domain: `PasswordPolicyService` — length bounds + `CommonPasswordSet`
      membership; add the bundled common-password data file (design §5, D2;
      FR-AUTH-004, NFR-SEC-003).
      Done when: unit tests for AC-4 pass (too-short rejected, common password
      rejected, compliant accepted).

- [ ] T5 — Domain: `PasswordHasher` (Argon2id) + `VerificationTokenService`
      (raw+SHA-256 hash+expiry) (design §5, D1/D4; NFR-SEC-005, NFR-SEC-004).
      Done when: unit tests pass — hash has `$argon2id$` prefix and verifies (AC-5);
      token issue returns raw≠hash, hash=SHA-256(raw), expiry ≈ now()+24h (AC-7).

- [ ] T6 — Domain: `AuthService.register` + `Users/Lists/EmailOutbox` repositories,
      one transaction (user + Inbox + outbox), unique-violation→`email_taken`
      mapping (design §5; FR-AUTH-001, FR-AUTH-002, FR-AUTH-005, FR-LIST-003).
      Done when: integration tests for AC-1, AC-2, AC-6, AC-7, AC-8, AC-9 pass
      against the local test DB.

- [ ] T7 — Contract: `AuthModule` + `AuthController` `POST /auth/register` + `RegisterDto`;
      register global `ValidationPipe` and `HttpExceptionFilter` error envelope in
      `main.ts` (design §3, §7 D6; FR-AUTH-003; UC-001 flows).
      Done when: supertest contract tests pass for 201 success and the designed
      errors — 400 `validation_failed` (bad email / weak / breached password, with
      `fields[]`), 409 `email_taken` (AC-1..AC-4).

- [ ] T8 — UI integration point: wire the Sign Up form (SCR-WEB-001) and the
      "check your email" notice (SCR-WEB-002) to `POST /auth/register`, rendering
      success and field-error states. (Screens themselves are ui-design's manifest;
      this task is the contract wiring only.)
      Done when: the form submits, shows the notice on 201, and renders field errors
      from the `ApiError` envelope on 400/409.

- [ ] T9 — Verify: all acceptance criteria AC-1..AC-9 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, and the api + shared test suites are green;
      migration up/down clean.
      Done when: the full feature suite passes and the checklist above is satisfied.

> Deferred dependency (not a blocker for this feature's FRs): placing
> `POST /auth/register` behind the shared per-IP rate limiter (FR-AUTH-018,
> NFR-SEC-006) — foundations, see technical-design §8. Add the guard when that
> mechanism lands (foundations task / FEAT-003).
