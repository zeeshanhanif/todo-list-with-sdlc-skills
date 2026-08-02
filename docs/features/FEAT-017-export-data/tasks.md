# Tasks: FEAT-017 — Export personal data (JSON)

> Executes: docs/features/FEAT-017-export-data/technical-design.md
> Status: all tasks done · Last updated: 2026-08-01
> Notes: **This feature mints the `account-data` module** — the last capability
> module in the API monolith (architecture §5; `src/modules/README.md` already
> reserves its row). `apps/api/src/modules/profile/` is the closest structural
> model (controller + service + repository + errors, framework-free domain
> errors, `toHttp` in the controller); copy its *shape*, not its content.
> **There is no migration.** Design §4 is "none, and here is why" — the export is
> a pure read over existing columns and existing indexes. Do not go looking for
> the schema task; T2 is a repository against the schema as it stands at
> migration 012.
> **The four design subtleties to hold onto:** (1) the success body is the
> document itself, **not** an envelope (D2) — errors still use the standard
> `ApiError` shape; (2) `displayName` is the **stored** value, `null` when never
> set — `displayNameFor()` is not applied (D4); (3) the three reads share **one
> `REPEATABLE READ` snapshot** (D8), which is the only thing standing between a
> concurrent write and an internally contradictory file; (4) soft-deleted tasks
> are **out** (D7).
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T7 exists for the same reason FEAT-008's T10 did — UC-015 is a whole
> user-visible flow this feature completes end to end.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/profile/profile.controller.spec.ts` is the closest model for T4;
> `modules/lists/lists.repository.spec.ts` for T2).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression (design §8).
> **DEF-006/009/011 are closed and guarded**: any new web surface is born
> conforming — `--color-danger-text` on the danger tint, a visible
> `:focus-visible` ring, icon-only controls ≥ 44px on touch (design AC-15). Do not
> copy alert markup out of an older screen without checking its token.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3.2): a FEAT-017 block adding
      `ACCOUNT_EXPORT_PATH` (`"/account/export"`), `ACCOUNT_EXPORT_FORMAT_VERSION`
      (`1`), the document types `AccountExportDocument`, `AccountExportAccount`,
      `AccountExportList`, `AccountExportTask`, and the filename helper
      `accountExportFilename(exportedAt, timeZone)` → `todo-export-<YYYY-MM-DD>.json`
      with the date resolved **in the passed zone** (D5).
      Done when: unit tests for `accountExportFilename` pass — an instant near
      midnight UTC yields the *local* date under `Asia/Calcutta` and
      `America/New_York` (two different dates from one instant), `"UTC"` yields
      the UTC date, and the result always matches
      `/^todo-export-\d{4}-\d{2}-\d{2}\.json$/` — `npm run build:shared` succeeds,
      api + web typecheck against the new symbols, and **no existing exported
      shape changes**.

- [x] T2 — Domain: `AccountExportRepository` (design §5.1; FR-DATA-001/002,
      FR-AUTHZ-002). The three reads (`ACCOUNT_SQL`, `LISTS_SQL`, `TASKS_SQL`) in
      one `db.transaction`, opened with
      `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` (D8). Every statement
      carries a non-optional `WHERE owner_id = $1` / `WHERE id = $1`; the task
      read carries `AND deleted_at IS NULL` (D7). Orders as designed
      (`lists`: `position, created_at`; `tasks`: `list_id, position, created_at`).
      A missing account row returns `null` rather than throwing.
      Done when: integration tests pass for AC-2 (all lists incl. an empty one, in
      order), AC-3 (active + completed tasks both returned), AC-4 (a soft-deleted
      task is absent while its list-mates are present), AC-5 (a second user's rows
      never appear for either read), and AC-9 (the isolation level is actually in
      force — assert that a task inserted by a *separate* connection after the
      transaction opens is absent from the task read, which fails under
      `READ COMMITTED` and passes under `REPEATABLE READ`).

- [x] T3 — Domain: `AccountExportService` + `account-data.errors.ts` (design §5.1;
      FR-DATA-001/002). Row → wire mapping: `Date → toISOString()`,
      `display_name → displayName` **verbatim, no `displayNameFor`** (D4), tasks
      grouped into their lists in one pass over the task rows, `exportedAt`
      stamped once and returned alongside the document. `AccountNotFoundError`
      when the account row is null.
      Done when: unit tests pass for AC-1 (the top-level keys are exactly
      `formatVersion`, `exportedAt`, `account`, `lists`; `formatVersion === 1`),
      AC-3 (a completed task maps to an ISO `completedAt`, an active one to
      `null`), AC-7 (every timestamp is `null` or an ISO-8601 `Z` string that
      round-trips through `new Date(...).toISOString()` unchanged), AC-8 (a user
      who never set a display name maps to `displayName: null`; the serialized
      document contains none of `password_hash`, `verification_token_hash`,
      `reset_token_hash`, `failed_login_count`, `locked_until`, `verified_at`),
      and that a task whose `list_id` matches no returned list is not silently
      dropped into a phantom list (AC-9's mapping half).

- [x] T4 — Contract: `AccountExportController` + `account-data.module.ts`,
      registered in `app.module.ts` (design §3.1, §5.1). Class-level
      `@UseGuards(SessionGuard)`; **no `ChangeSignalInterceptor`** — this is a
      read and publishes no `changed` signal. Returns the document **unwrapped**
      (D2), sets `Content-Disposition: attachment; filename="…"` from
      `accountExportFilename(exportedAt, account.timezone ?? "UTC")` via
      `@Res({ passthrough: true })`, and records the `data_exported` audit event
      (D6 — add `dataExported` to `AUDIT_EVENTS`). `toHttp` maps
      `AccountNotFoundError → 401 unauthenticated`.
      Done when: supertest contract tests pass for AC-1 (`200`, unwrapped body,
      `content-type: application/json`), AC-5 (two seeded accounts export
      disjoint documents — asserted over the **serialized** body, so a stray id
      anywhere fails), AC-6 (`401 unauthenticated` for missing, expired and
      revoked cookies, with no account/list/task data in the body), AC-11 (exactly
      one `data_exported` row per successful export, carrying the user id and no
      titles or list names; **and** an `AuditService` whose write throws still
      yields `200` with the document), AC-12's server half (the
      `Content-Disposition` filename matches the user's zone-resolved date), and
      the `Content-Disposition` header survives for a `curl`-shaped request.

- [x] T5 — Web wiring: `app/api/account/export/route.ts` (BFF `POST` proxy —
      cookie forwarded, status + body relayed verbatim, **and
      `Content-Disposition` relayed**, which the profile proxy has no reason to
      do) and `lib/account-export.ts` (`requestExport()` returning
      `{ document, filename }` or a typed failure; filename parsed from the header
      with `accountExportFilename` as the fallback). Design §5.2.
      Done when: a signed-in browser request through the BFF returns the same
      document and filename the API returned, an unauthenticated one relays the
      `401` envelope unchanged, and a `500` from the API surfaces as the typed
      failure rather than a thrown parse error (NFR-REL-004).

- [x] T6 — UI integration point (design §5.2): `app/settings/security/export/page.tsx`
      (**SCR-WEB-016**) + `components/export-data.tsx` client island consuming
      `POST /api/account/export`, and one new `HubRow` on
      `app/settings/security/page.tsx` (**SCR-WEB-014**) reaching it. Screens are
      ui-design's manifest; this task is the contract wiring and the download
      mechanism (Blob → object URL → programmatic `<a download>` →
      `revokeObjectURL`).
      Done when: AC-12 (the control moves `default → preparing → ready`; a file
      named `todo-export-<YYYY-MM-DD>.json` downloads and its bytes parse as the
      AC-1 document), AC-13 (the hub row reaches SCR-WEB-016, keyboard-reachable,
      and the screen links back), AC-14 (a failed request renders an error state
      naming the failure with a working retry; nothing downloads; the session
      survives), and AC-15 (danger-tint text on `--color-danger-text`, visible
      focus ring on every control, any icon-only control ≥ 44×44 at a touch
      viewport) all hold.

- [x] T7 — E2E: extend `e2e/tests/` with the path this feature completes — sign in
      → Settings › Security & account → Export → a file downloads → its parsed
      contents contain the seeded lists and both an active and a completed task,
      and **not** a task the same run soft-deleted. [UC-015]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the existing specs — including `control-contrast`, `focus-ring`,
      `inline-alert-contrast` and `touch-target` — still green.

- [x] T8 — Verify: acceptance criteria AC-1..AC-15 (design §6) demonstrably pass;
      **AC-10 measured explicitly** (seed 100 lists / 5,000 tasks, assert one
      complete document within the 2 s budget with every task present — no
      earlier task owns it, and it is the criterion D9 rests on);
      `src/modules/README.md`'s `account-data` row and `app.module.ts`'s module
      comment updated to show export as built; `npm run boundaries` (the new
      module imports no other module's internals), `npm run lint`, `npm run
      build`, and the api + shared + web + e2e suites green — the api suite
      **serially** while DEF-002 is open, with any parallel failure re-checked
      serially before it is attributed to this feature.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
