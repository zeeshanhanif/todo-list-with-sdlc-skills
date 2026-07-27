# Tasks: FEAT-009 — List management

> Executes: docs/features/FEAT-009-lists/technical-design.md
> Status: pending · Last updated: 2026-07-27
> Notes: first slice of Phase 2 and the **first owned-data module** — the
> ownership-scoping convention set in T3 (design D3: every repository statement
> carries `WHERE owner_id = $1`; missing-or-forbidden is a uniform `404`) is
> inherited by every later data module, so get it right here.
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task (the FEAT-001..006 skip); T8 exists because T6 deletes the skeleton E2E.
> Behavioral tasks follow the established Jest + supertest patterns
> (`sign-in.controller.spec.ts` and `reset-password.*.spec.ts` are the closest
> models). `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before
> writing web code — this Next.js differs from training data.

- [x] T1 — Migration 007 `migrations/1721540000000_lists-management.js`
      (design §4): add `lists.position` (`integer NOT NULL DEFAULT 0`) with a
      per-owner backfill ordered by `created_at ASC, id ASC` and index
      `lists_owner_position_idx (owner_id, position)`; create the **minimal
      `tasks`** table — `id`, `owner_id → users(id) ON DELETE CASCADE`,
      `list_id → lists(id) ON DELETE CASCADE NOT NULL`, `title`, `completed_at`,
      `deleted_at`, `created_at`, `updated_at` — plus
      `tasks_owner_list_idx (owner_id, list_id)` and the partial
      `tasks_active_by_list_idx (list_id) WHERE completed_at IS NULL AND
      deleted_at IS NULL`. Comment the table as minimal, "FEAT-010+ extend"
      (mirroring migration 002's note on `lists`). FR-LIST-007/008/009; D1.
      Done when: `npm run db:migrate` applies clean on a database at 006, the
      down migration reverses it, and an existing account's Inbox row has
      `position = 0`.

- [x] T2 — Shared contracts (`@todo/shared`, design §5): `LISTS_PATH`,
      `LIST_REORDER_PATH`, `LIST_NAME_MAX_LENGTH = 100`, `ListSummary`,
      `ListsResponse`, `CreateListRequest/Response`, `RenameListRequest/Response`,
      `DeleteListResponse`, `ReorderListsRequest/Response`, and
      `LIST_ERROR_CODES { listNotFound, listNotDeletable }`.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols.

- [x] T3 — Domain: `modules/lists/` repository + service + errors (design §5;
      FR-LIST-001/002/004/005/006/007/008, FR-AUTHZ-002/003/004/005).
      `ListsRepository` with `findAllWithCounts` (one LEFT JOIN +
      `FILTER`-aggregate statement), `findById`, `create` (position =
      `COALESCE(MAX(position) + 1, 0)` per owner), `rename`, `deleteById`,
      `countTasks`, `setPositions` — **every method owner-scoped** (D3);
      `lists.errors.ts` (`ListNotFoundError`, `ListNotDeletableError`,
      `ListNameInvalidError`); `ListsService` with name normalization + the
      FR-LIST-002 bounds, the `is_default` delete guard, the delete transaction
      (count → delete → cascade), and the reorder set-equality check +
      `setPositions` in one transaction.
      Done when: integration tests pass for AC-1 (counts: 3 active / 6 total over
      active+completed+soft-deleted fixtures, ordered by position), AC-2 (append
      position, owner from the caller), AC-3 (trim/empty/whitespace/101-char
      rejected, 100 accepted, duplicate names accepted), AC-4 (rename, including
      the default list, `is_default` preserved), AC-5 (delete removes the list
      and every task row it contained — completed and soft-deleted included —
      and returns the count; other lists and other users untouched), AC-6
      (`ListNotDeletableError` on the default list, nothing deleted), AC-7
      (reorder persists dense `0..n-1`, is idempotent, and rejects a
      missing/duplicate/foreign id without changing the stored order), AC-8
      (another owner's id resolves to `ListNotFoundError` identically to an
      unknown uuid), and AC-10 (NULL/dangling `list_id` inserts are rejected by
      the constraints).

- [x] T4 — Contract: `ListsController` + DTOs + `ListsModule` registered in
      `AppModule` (design §3). Class-level `@UseGuards(SessionGuard)`,
      `@CurrentUser()` for the owner id; `POST /lists/reorder` declared **before**
      `PATCH /lists/:id`; error mapping `ListNameInvalidError` → `400
      validation_failed` (`fields[]` naming `name` or `listIds`),
      `ListNotFoundError` → `404 list_not_found`, `ListNotDeletableError` → `409
      list_not_deletable`.
      Done when: supertest contract tests pass for AC-1 (`200 { lists }`, ordered,
      counted), AC-2 (`201 { list }`), AC-3 (`400` + `name` field), AC-4 (`200`
      renamed, default renameable), AC-5 (`200 { status, deletedTaskCount }` +
      tasks gone), AC-6 (`409 list_not_deletable`), AC-7 (`200` reordered /
      `400` on a bad set), AC-8 (`404 list_not_found` byte-identical to the
      unknown-uuid response, target unmodified), AC-9 (`401 unauthenticated` on
      all five endpoints with no/expired/revoked cookie, and nothing written),
      and AC-11 (one `DbService` query for `GET /lists` — no N+1 — and 20 lists ×
      100 tasks served well inside 300 ms), each rendering the `ApiError`
      envelope. Also: `modules/auth/lists.repository.ts` states `position = 0`
      explicitly (D6) with the auth suites still green.

- [x] T5 — UI integration point (design §5): BFF routes
      `app/api/lists/route.ts` (GET, POST), `app/api/lists/[id]/route.ts`
      (PATCH, DELETE), `app/api/lists/reorder/route.ts` (POST) forwarding the
      browser `cookie` and relaying status + JSON verbatim; `lib/lists.ts`
      `fetchLists()`; `components/app-shell.tsx` sidebar rendering the real lists
      as `sidebar-nav-item`s with count badges plus a "New list" action and a
      per-row rename / delete / move-up / move-down menu; `app/page.tsx` becomes
      the authenticated home (`requireSession()`) with a placeholder content
      column (SCR-WEB-008/018 are FEAT-010's). Wires **SCR-WEB-011** (create /
      rename / delete-confirm dialog) and the **SCR-WEB-007** sidebar treatment —
      screens are ui-design's manifest; this task is the contract wiring only.
      Done when: signed in, the sidebar shows the account's lists with active
      counts (a fresh account shows Inbox); creating a list from the dialog makes
      it appear without a manual reload (AC-13); renaming updates in place;
      deleting a non-default list first shows a confirmation naming the list and
      its task count and issues no request when dismissed (AC-12); the Inbox row
      offers no delete affordance; move-up/move-down persists across a reload
      (AC-7); an unauthenticated visit to `/` redirects to `/signin`.

- [x] T6 — Retire the walking-skeleton scaffolding (design §5, D7): delete
      `apps/api/src/health/skeleton.service.ts` + its spec and the
      `GET /healthz/ping` route, `SKELETON_PING_PATH` / `SkeletonPingResponse`
      from `@todo/shared`, `fetchSkeletonPing` from `apps/web/src/lib/api.ts`,
      and `e2e/tests/skeleton.spec.ts`; add migration 008
      `1721550000000_retire-skeleton.js` dropping `skeleton_ping` with a
      reversible `down`. **`GET /healthz` (liveness, NFR-OBS-002) stays.** Update
      the `docs/scaffold-notes.md` line that promised this removal.
      Done when: `npm run build`, `npm test` and `npm run boundaries` are green
      with no dangling references to the removed symbols, `GET /healthz` still
      answers `200`, and both migrations apply and reverse cleanly.

- [x] T7 — Cross-feature guard: the `session.guard.ts` header comment that
      promises an ownership *guard* in FEAT-009 is corrected to point at the
      design's D3 (ownership is enforced by repository query scoping), so the
      next data module inherits the actual convention (design §8).
      Done when: the comment matches the implemented mechanism and the api suite
      is green.

- [ ] T8 — E2E: replace the deleted skeleton spec with `e2e/tests/lists.spec.ts`
      covering UC-008 against the local stack — sign in, see Inbox with its
      count in the sidebar, create a list, rename it, delete it through the
      confirmation, and see the sidebar reflect each change.
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up) with the lists spec replacing the skeleton spec.

- [ ] T9 — Verify: acceptance criteria AC-1..AC-13 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, `npm run build` and the api + shared +
      web test suites green; migrations 007 and 008 applied and reversible.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
