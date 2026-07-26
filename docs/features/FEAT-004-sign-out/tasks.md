# Tasks: FEAT-004 — Sign out

> Executes: docs/features/FEAT-004-sign-out/technical-design.md
> Status: all tasks done · Last updated: 2026-07-25
> Note: no migration (reuses the sessions table from FEAT-003's migration 005).
> Architecture names no critical E2E flows / frameworks → no mandatory Playwright
> E2E task (legitimate skip, mirroring FEAT-001/002/003). Behavioral tasks use
> Jest integration + supertest contract tests.

- [x] T1 — Shared contracts (`@todo/shared`): add `LOGOUT_PATH` and
      `SignOutResponse` (`{ status: "signed_out" }`). Design §3.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      them.

- [x] T2 — Domain (revoke): `SessionsRepository.deleteByTokenHash(tokenHash)`
      (returns deleted count) + `SessionService.revoke(rawToken)` (hash + delete,
      no-op on empty) + `AuthService.signOut(rawToken)` (thin delegate);
      `clearSessionCookieOptions(cookieSecure)` in `session.constants.ts`.
      Design §5; FR-AUTH-011.
      Done when: integration tests pass — `revoke` deletes the session matching
      the token and leaves the user's other sessions intact (AC-3), and is a
      no-op (no throw) for an empty/unknown token (AC-2 domain half).

- [x] T3 — Contract: `AuthController` `POST /auth/logout` — read the session
      cookie, call `auth.signOut`, `res.clearCookie(SESSION_COOKIE, …)`, return
      `200 { status:"signed_out" }`; unguarded + idempotent (D1). Design §3;
      UC-004.
      Done when: supertest contract tests pass for AC-1 (200 + clear-cookie +
      session row gone + subsequent `GET /auth/session` → 401), AC-2 (200 with no
      cookie / invalid cookie), AC-3 (only the current session removed), each
      rendering the designed response.

- [x] T4 — UI integration point: wire the sign-out control on the app shell
      (SCR-WEB-007) to `POST /api/auth/logout`, then redirect to `/signin`; add
      the BFF route `POST /api/auth/logout` forwarding the browser `Cookie` and
      relaying the clear `Set-Cookie` (mirrors the login BFF, technical-design
      §2). (The control's visual spec is ui-design's manifest; this task is the
      wiring only.)
      Done when: clicking sign out clears the session cookie via the BFF and lands
      on `/signin`; a reload shows the signed-out state (`GET /api/auth/session`
      → 401).

- [x] T5 — Verify: acceptance criteria AC-1..AC-3 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, and the api + shared test suites are
      green. (No migration in this feature.)
      Done when: the full feature suite passes and the checklist above is
      satisfied.
