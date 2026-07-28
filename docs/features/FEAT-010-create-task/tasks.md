# Tasks: FEAT-010 — Create task + list view

> Executes: docs/features/FEAT-010-create-task/technical-design.md
> Status: all tasks done · Last updated: 2026-07-27
> Notes: **no migration** (design §4/D1) — the list starts at the contract layer,
> because FEAT-009's migration 007 already created every column this slice reads.
> The `tasks` module copies `modules/lists` as its worked example: every repository
> statement owner-scoped, uniform 404 for missing-or-forbidden (FEAT-009 D3).
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T7 exists because this feature completes the first end-to-end path a user
> actually came for (sign in → see a list → add a task), which the suite should
> hold. Behavioral tasks follow the established Jest + supertest patterns
> (`modules/lists/lists.controller.spec.ts` is the closest model).
> **Known harness trap (FEAT-009 acceptance, minor 2):** the E2E webServer sets no
> `AUTH_RATELIMIT_MAX`, so repeated local runs exhaust the per-IP register limiter
> and fail the *whole* suite with an unrelated-looking error. If that happens,
> clear `auth_rate_buckets` for `::1` — do not "fix" it by weakening a test.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §5): `listTasksPath(listId)`,
      `TASK_TITLE_MAX_LENGTH = 500`, `TaskSummary`, `ListTasksResponse`,
      `CreateTaskRequest`, `CreateTaskResponse`. **No new error code** (D7) —
      failures reuse `LIST_ERROR_CODES.listNotFound` and `validation_failed`.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols.

- [x] T2 — Domain: `modules/tasks/` repository + errors (design §5;
      FR-TASK-001/002, FR-LIST-009, FR-AUTHZ-002/003/004/005).
      `TasksRepository` with `findOwnedList(ownerId, listId)` (the one-statement
      ownership check against `lists` — D8, no cross-module import),
      `findByList(ownerId, listId)` (one statement returning both sections' rows,
      excluding `deleted_at IS NOT NULL`), and `create(ownerId, listId, title)`;
      **every statement owner-scoped**. `tasks.errors.ts` with
      `TaskTitleInvalidError` and a module-local list-not-found error.
      Done when: integration tests pass for AC-1 (row created active, in the path's
      list, owned by the caller), AC-2 (trim/empty/whitespace/501 rejected, 500
      accepted, duplicate titles accepted, nothing created), AC-3 (2 active /
      3 completed / 1 soft-deleted partitioned correctly), AC-4 (both orders, and
      a newly created task lands last in `active`), AC-5 (another owner's listId
      is the same not-found as an unknown uuid, and no row is inserted), AC-7
      (the task is returned by that list only; deleting the list removes it),
      and AC-9 (timestamps are UTC `timestamptz` round-tripping as ISO-8601).

- [x] T3 — Domain: `TasksService` (design §5) — title normalization + FR-TASK-002
      bounds, the owned-list guard before both operations, the active/completed
      partition, and row → `TaskSummary` mapping with ISO-8601 UTC timestamps
      (NFR-LOC-001).
      Done when: the T2 criteria hold through the service surface (same AC set,
      asserted against `TaskSummary` shapes rather than raw rows), including AC-9's
      `completedAt: null` for an active task.

- [x] T4 — Contract: `TasksController` + `CreateTaskDto` + `TasksModule`
      registered in `AppModule` (design §3). `@Controller('lists/:listId/tasks')`,
      class-level `@UseGuards(SessionGuard)`, `@CurrentUser()` for the owner id;
      error mapping `TaskTitleInvalidError` → `400 validation_failed`
      (`fields[]` naming `title`), list-not-found → `404 list_not_found`.
      Done when: supertest contract tests pass for AC-1 (`201 { task }`), AC-2
      (`400` + `title` field, nothing created), AC-3 (`200 { list, active,
      completed }` with `list` carrying the `ListSummary` shape), AC-4 (orders,
      new task last in `active`), AC-5 (`404 list_not_found` byte-identical to the
      unknown-uuid response on **both** endpoints, no row created), AC-6 (`401
      unauthenticated` on both with no/expired/revoked cookie, nothing written),
      and AC-8 (**two** `DbService` queries for the view — no query per task — and
      500 tasks served well inside 300 ms), each rendering the `ApiError` envelope.

- [x] T5 — UI integration point (design §5): BFF route
      `app/api/lists/[id]/tasks/route.ts` (GET, POST) forwarding the browser
      `cookie` and relaying status + JSON verbatim; `lib/tasks.ts`
      `fetchListTasks(listId)`; `app/lists/[id]/page.tsx` rendering **SCR-WEB-008**
      (list header from `list`, quick-add composer, active section, completed
      section) inside `AppShell`; `app/page.tsx` replacing FEAT-009's placeholder
      by resolving the caller's **default list** and rendering the same view (D2) —
      which for a new account is **SCR-WEB-018**'s first-run state; and
      `components/lists-nav.tsx` making sidebar rows **links** to `/lists/{id}`
      with the `sidebar-nav-item` selected state. Screens are ui-design's manifest;
      this task is the contract wiring only.
      Done when: signed in, `/` shows the Inbox's view; typing a title and pressing
      Enter creates the task and it appears **last** in the active section without
      a manual reload (AC-11) while the sidebar's count badge increments (AC-12);
      an over-long or blank title renders the `title` field error and creates
      nothing (AC-2); a list with no tasks renders the empty state and a failed
      fetch renders a retry affordance (AC-10); clicking a sidebar row opens that
      list and marks it selected (AC-12); an unknown or not-owned `/lists/{id}`
      renders the not-found state without disclosing existence (AC-5); an
      unauthenticated visit redirects to `/signin` (AC-6).

- [x] T6 — Cross-feature check: FEAT-009's list-deletion cascade still holds now
      that tasks arrive through a real contract, and the sidebar's
      `activeTaskCount` reflects tasks created here (design §6 AC-7, AC-12;
      FEAT-009 AC-5/AC-13 re-exercised, not rewritten).
      Done when: the FEAT-009 suites stay green **and** a test creates tasks via
      `POST /lists/{id}/tasks`, deletes the list via `DELETE /lists/{id}`, and
      observes `deletedTaskCount` matching and zero surviving rows.

- [x] T7 — E2E: extend `e2e/tests/` with the path this feature completes —
      sign in → land on `/` → see the Inbox view → add a task → it appears in the
      active section with the sidebar badge updated → open another list from the
      sidebar and see its own (empty) state. [UC-009]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the FEAT-009 lists spec still green.

- [x] T8 — Verify: acceptance criteria AC-1..AC-12 (design §6) demonstrably pass;
      `npm run boundaries` (confirming **no** `modules/tasks → modules/lists`
      import crept in — D8), `npm run lint`, `npm run build`, and the api + shared +
      web + e2e suites green; no migration to apply (design §4) — confirm
      `npm run db:migrate` is a no-op at migration 008.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
