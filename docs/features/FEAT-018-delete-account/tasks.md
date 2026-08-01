# Tasks: FEAT-018 — Delete account (confirm + password re-entry)

> Executes: docs/features/FEAT-018-delete-account/technical-design.md
> Status: pending · Last updated: 2026-08-01
> Notes: **The `account-data` module already exists** — FEAT-017 minted it. This
> feature is its second capability; `account-export.*` is the structural model
> sitting right beside the files you are adding.
> **There is no migration.** Design §4 is "none, and here is why": `lists`,
> `tasks` and `sessions` already cascade from `users`, and the unique
> `users_email_key` is what frees the address. Do not go looking for the schema
> task — T3 is a repository against the schema as it stands at migration 012.
> **The four design subtleties to hold onto:** (1) `email_outbox` has **no FK**
> and must be deleted explicitly inside the same transaction (D5); (2) the
> `account_deleted` audit row must be written **after** the commit with
> `user_id: null` + `detail: { userId }`, or the FK rejects it and
> `AuditService` swallows the error, recording nothing (D6); (3) a bad password
> is **400**, not 401 (D4); (4) the post-deletion confirmation is **client-
> rendered** — any `router.refresh()` or push to a protected route replaces it
> with the sign-in screen (D10).
> T2 is a **cross-feature refactor** (D2): it touches verified auth code, so the
> auth suite is part of this feature's green bar from T2 onward.
> Architecture names no critical E2E flows → no *mandatory* Playwright task; T8
> exists for the same reason FEAT-017's T7 did — UC-016 is a whole user-visible
> flow this feature completes end to end.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/account-data/account-export.controller.spec.ts` is the closest model
> for T5; `account-export.repository.spec.ts` for T3).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression (design §8).
> **DEF-006/009/011/012 are closed and guarded**: new web surfaces must be born
> conforming — `--color-danger-text` on the danger tint, a visible
> `:focus-visible` ring, icon-only controls ≥ 44px on touch — and the contrast
> sweeps now run **both themes** through `e2e/tests/contrast.ts` (AC-19).
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3.2): a FEAT-018 block adding
      `ACCOUNT_DELETE_PATH` (`"/account/delete"`), `DeleteAccountRequest`
      (`currentPassword: string; confirm: true`) and `DeleteAccountResponse`
      (`status: "account_deleted"`). **Re-mint nothing**: the error code is the
      existing `AUTH_ERROR_CODES.currentPasswordInvalid` (D4), and
      `ACCOUNT_EXPORT_FORMAT_VERSION` stays `1` (FEAT-017 §8 watch item 2).
      Done when: `npm run build:shared` succeeds, api + web typecheck against the
      new symbols, and **no existing exported shape changes** — `confirm`'s type
      is the literal `true`, so a `confirm: false` call site fails to compile.

- [x] T2 — Refactor: promote `PasswordHasher` from
      `apps/api/src/modules/auth/password-hasher.ts` to
      `apps/api/src/common/crypto/password-hasher.ts` (design D2), moving
      `password-hasher.spec.ts` with it and updating every import
      (`auth.service.ts`, `auth.module.ts`, and the auth spec files that
      construct or inject it). Class body unchanged — this is a move, not a
      rewrite. No `auth` contract, response or behavior changes.
      Done when: `npm run boundaries` is green (the new location is importable
      from `modules/account-data`), and the **whole api suite** — auth included —
      passes serially, demonstrating the move broke nothing that was verified.

- [x] T3 — Domain: `AccountDeleteRepository` (design §5.1; FR-DATA-003,
      FR-DATA-005). `findCredential(userId)` → `{ passwordHash } | null`, and
      `deleteAccount(userId)` → `boolean`, the latter in one `db.transaction`:
      `DELETE FROM email_outbox WHERE payload->>'userId' = $1` **then**
      `DELETE FROM users WHERE id = $1`, returning `rowCount === 1`.
      Done when: integration tests pass for AC-2 (a seeded user with lists,
      active + completed + **soft-deleted** tasks and two sessions leaves zero
      rows on `users`, `lists`, `tasks`, `sessions` — asserted per table, not
      inferred from the cascade), AC-8 (a second user's rows on every one of
      those tables survive untouched), AC-9 (pending **and** sent outbox rows for
      the user are gone; another user's remain), and AC-10 (a transaction that
      throws before commit leaves every row in place — nothing partially
      deleted).

- [x] T4 — Domain: `AccountDeleteService` + the `CurrentPasswordInvalidError`
      addition to `account-data.errors.ts` (design §5.1; FR-DATA-003/004/005).
      The order **is** the design: credential read → `hasher.verify` → (on
      failure: `account_delete_failure` audit + throw, **nothing written**) →
      delete transaction → **post-commit** `account_deleted` audit with
      `userId: null` and `detail: { userId }` (D6). A `null` credential or a
      `false` from `deleteAccount` → `AccountNotFoundError`.
      Done when: unit tests pass for AC-5's service half (a wrong password
      deletes nothing and throws `CurrentPasswordInvalidError`), AC-11 (the
      success path records exactly one `account_deleted` carrying the id in
      `detail` and no email/password/content, **and** an `AuditService` whose
      write rejects still resolves the deletion), AC-12 (a wrong password records
      exactly one `account_delete_failure` carrying the user id and a reason
      category, never the submitted password), and the concurrent-delete case
      (`deleteAccount` returning `false` → `AccountNotFoundError`).

- [x] T5 — Contract: `AccountDeleteController` + `dto/delete-account.dto.ts`,
      wired into `account-data.module.ts` (design §3.1, §5.1). Class-level
      `@UseGuards(SessionGuard, RateLimitGuard)`; **no `ChangeSignalInterceptor`**
      (D7). DTO validates a non-empty `currentPassword` and `confirm === true`
      (D3). On success clears the session cookie with
      `clearSessionCookieOptions(config.cookieSecure)` — the sign-out mechanism —
      and returns `{ status: 'account_deleted' }`. `toHttp` maps
      `CurrentPasswordInvalidError → 400 current_password_invalid` (with
      `fields[]`) and `AccountNotFoundError → 401 unauthenticated`.
      Done when: supertest contract tests pass for AC-1 (`200`, the exact body,
      and a `Set-Cookie` that clears the session cookie), AC-3 (a second live
      session's cookie answers `401` on its next authenticated request), AC-4
      (registering the same email afterwards returns `201`), AC-5 (`400
      current_password_invalid`, account intact, the caller's session still
      authenticates), AC-6 (missing/`false` `confirm` and missing/empty password
      → `400 validation_failed` naming the field, nothing deleted), AC-7 (`401`
      for missing, expired and revoked cookies), and AC-13 (`429 rate_limited`
      with `retryAfterSeconds` past the window maximum).

- [x] T6 — Web wiring: `app/api/account/delete/route.ts` (BFF `POST` proxy —
      cookie **and** `x-forwarded-for` forwarded, status + body relayed verbatim,
      **and `Set-Cookie` relayed** so the cleared cookie lands on the web origin)
      and `lib/account-delete.ts` (`requestAccountDelete({ currentPassword })` →
      `{ ok: true }` or a typed
      `"invalid_password" | "unauthenticated" | "rate_limited" | "failed"`,
      never throwing). Design §5.2.
      Done when: a signed-in browser request through the BFF deletes the account
      and the browser's session cookie is cleared by the relayed header; a wrong
      password surfaces as `invalid_password` with the session intact; a `500`
      surfaces as the typed failure rather than a thrown parse error
      (NFR-REL-004).

- [ ] T7 — UI integration point (design §5.2): `app/settings/security/delete/page.tsx`
      (**SCR-WEB-017**) + `components/delete-account.tsx` client island consuming
      `POST /api/account/delete`, and a third `HubRow` on
      `app/settings/security/page.tsx` (**SCR-WEB-014**) — **last**, with the
      divider, as that file's comment already anticipates. Screens are
      ui-design's manifest; this task is the contract wiring, the warning copy's
      data (list/task counts from the existing `GET /lists`, D8) and the
      client-rendered confirmation (D10 — **no `router.refresh()`, no push to a
      protected route** after success).
      Done when: AC-15 (the pre-state states permanence and unrecoverability,
      quantifies lists + tasks, and offers export first; the post-state confirms
      removal), AC-16 (wrong password → password-error state, account intact,
      retry works; cancel changes nothing), AC-17 (the confirmation renders while
      signed out and the next navigation lands on `/signin`), AC-18 (the hub row
      is last, keyboard-reachable, marked destructive, and the screen links
      back), and AC-19 (danger-tint text on `--color-danger-text`, visible focus
      ring, icon-only controls ≥ 44×44 at a touch viewport — **measured in both
      themes**) all hold.

- [ ] T8 — E2E: extend `e2e/tests/` with the path this feature completes — sign in
      → Settings › Security & account → Delete account → the warning names what
      will be lost → a wrong password is refused with the data still there → the
      correct password deletes → the confirmation renders → the app is signed out
      → **the same email registers again successfully**. [UC-016]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the existing specs — including `control-contrast`, `focus-ring`,
      `inline-alert-contrast` and `touch-target`, all now both-theme — still
      green.

- [ ] T9 — Verify: acceptance criteria AC-1..AC-19 (design §6) demonstrably pass;
      **AC-14 measured explicitly** (seed 100 lists / 5,000 tasks, delete, assert
      completion within the 2 s budget and zero surviving rows on every one of
      that user's tables — no earlier task owns it);
      `src/modules/README.md`'s `account-data` row and the module/hub comments
      that say "FEAT-018 later" updated to show deletion as built;
      `npm run boundaries` (account-data still imports no other module's
      internals, and the promoted hasher is why), `npm run lint`, `npm run build`,
      and the api + shared + web + e2e suites green — the api suite **serially**
      while DEF-002 is open, with any parallel failure re-checked serially before
      it is attributed to this feature.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
