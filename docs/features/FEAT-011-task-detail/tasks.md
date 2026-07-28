# Tasks: FEAT-011 — Task detail (title, due date, priority, overdue)

> Executes: docs/features/FEAT-011-task-detail/technical-design.md
> Status: all tasks done · Last updated: 2026-07-28
> Notes: **migration 009** (design §4) — the first schema change since FEAT-009,
> two columns on `tasks` inside the entity the architecture already owns. This
> feature **extends** the `tasks` module FEAT-010 built (repository, service,
> errors, DTOs) and adds a second controller for the `/tasks/{id}` item resource;
> it restructures nothing. `modules/lists` and `modules/tasks` remain the worked
> examples: every repository statement owner-scoped, uniform 404 for
> missing-or-forbidden (FEAT-009 D3).
> **The one design subtlety to hold onto:** PATCH treats an *absent* field and an
> explicit `null` differently (design D4). `@IsOptional()` destroys that
> distinction — use `@ValidateIf((_, value) => value !== undefined)`, branch on
> key presence in the service, and build the `SET` clause from supplied keys only.
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T8 exists for the same reason FEAT-010's did — this feature completes the
> next thing a user actually came for (add a task → open it → schedule it).
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/tasks/tasks.controller.spec.ts` is the closest model).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression (design §8), and new
> specs must assert their own fixture responses (`201`/`200`) rather than
> destructuring an unchecked one.
> **Known harness trap (FEAT-009 acceptance, minor 2):** the E2E webServer sets no
> `AUTH_RATELIMIT_MAX`, so repeated local runs exhaust the per-IP register limiter
> and fail the *whole* suite with an unrelated-looking error. If that happens,
> clear `auth_rate_buckets` for `::1` — do not "fix" it by weakening a test.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Migration 009 `1721560000000_task-due-priority.js` (design §4;
      FR-TASK-006, FR-TASK-008): add `tasks.due_at timestamptz` (nullable — no
      due date is SQL NULL) and `tasks.priority text NOT NULL DEFAULT 'none'`
      with the `tasks_priority_check` CHECK over the four values; `down` drops
      the constraint before the columns. **No index** (D7 — `(owner_id, due_at)`
      belongs to FEAT-015/016).
      Done when: `npm run db:migrate` applies clean against migration 008 and
      `npm run db:migrate down` reverses it clean, with existing task rows
      backfilled to `priority = 'none'` and `due_at IS NULL`.

- [x] T2 — Shared contracts (`@todo/shared`, design §5): `taskPath(id)`,
      `TaskPriority` + `TASK_PRIORITIES`, the three new `TaskSummary` fields
      (`dueAt`, `priority`, `isOverdue`), `TaskDetailResponse`,
      `UpdateTaskRequest`, `UpdateTaskResponse`, the two new optional
      `CreateTaskRequest` fields, and `TASK_ERROR_CODES.taskNotFound`
      (the code FEAT-010 D7 deferred to this feature).
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols with no change to any existing exported shape.

- [x] T3 — Domain: repository (design §5; FR-TASK-004/005/006/008,
      FR-AUTHZ-002/003/005). `TaskRow` + `toTaskRow` + the existing
      `findByList`/`create` selects carry `due_at`/`priority`; new owner-scoped
      `findById(ownerId, id)` and `update(ownerId, id, patch)` — one `UPDATE …
      updated_at = now() … RETURNING`, its `SET` clause built from **only the
      keys the patch contains** (D4); `create` accepts optional `dueAt`/`priority`
      and lets the column default supply `'none'`. `tasks.errors.ts` gains
      `TaskNotFoundError` and `TaskFieldInvalidError(field, requirement)`.
      Done when: integration tests pass for AC-3 (set/change a due date, instant
      round-trips), AC-4 (`null` clears; an omitted key leaves the stored value
      untouched — asserted at the row), AC-6 (each of the four values stored; a
      task created without one reads `'none'` **from the column default**), AC-7
      (a single-field patch leaves the other two byte-identical, and an empty
      patch writes nothing including `updated_at`), AC-8 (another owner's id and
      a soft-deleted id are the same null, and the row is unmodified), and AC-11
      (`timestamptz` UTC round-trip, including a non-UTC offset stored as the
      same instant).

- [x] T4 — Domain: `TasksService` (design §5) — `detail(ownerId, id)` and
      `update(ownerId, id, patch)`; `normalizeTitle` **reused verbatim** for
      update (FR-TASK-005 → FR-TASK-002), `assertLookupId` on the new id,
      `dueAt`/`priority` validation raising `TaskFieldInvalidError`, the empty
      patch rejected (D4), and `toSummary` extended with `dueAt`, `priority` and
      the **single** `isOverdue` derivation (D3).
      Done when: the T3 criteria hold through the service surface (asserted
      against `TaskSummary` shapes), plus AC-1 (the five FR-TASK-004 details,
      `list.id === task.listId`), AC-2 (title bounds on update; the stored title
      unchanged on rejection), and AC-5 in full — overdue **true** only for an
      active task with a past `dueAt`; **false** for future, for no due date, and
      for a **completed** task with a past due date.

- [x] T5 — Contract: `TaskItemController` (`task-item.controller.ts`,
      `@Controller('tasks')`) + `dto/update-task.dto.ts` + the two new optional
      fields on `dto/create-task.dto.ts`, registered in `TasksModule` (design §3).
      Class-level `@UseGuards(SessionGuard)`, `@CurrentUser()` for the owner id;
      DTO fields use `@ValidateIf((_, value) => value !== undefined)` so an
      explicit `null` is validated rather than skipped (D4); `toHttp` maps
      `TaskNotFoundError` → `404 task_not_found` and `TaskFieldInvalidError` →
      `400 validation_failed` with the named field.
      Done when: supertest contract tests pass for AC-1 (`200 { task, list }`),
      AC-2/AC-6 (`400 validation_failed` naming `title` / `priority`, nothing
      written), AC-4 (`{ dueAt: null }` clears; `{}` is `400`, not `200` — AC-7),
      AC-8 (`404 task_not_found` **byte-identical** across unknown uuid, another
      owner's task, a non-uuid segment and a soft-deleted task, on **both**
      routes, with the target row unmodified), AC-9 (`401 unauthenticated` on
      both with no/expired/revoked cookie, nothing written), and AC-12 (**two**
      `DbService` queries per route, both inside the 300 ms bound), each
      rendering the `ApiError` envelope.

- [x] T6 — Contract: due date + priority at creation on the **existing**
      `POST /lists/{listId}/tasks` (design §3.3; UC-009 step 2 — FEAT-010 D6's
      deferral, closed here).
      Done when: AC-10 passes — `{ title, dueAt, priority }` creates with both
      set, `{ title }` alone still creates `dueAt: null` / `priority: 'none'`,
      and **every FEAT-010 spec passes unmodified**. A FEAT-010 test that needs
      editing to stay green means the change was not additive (D8) — fix the
      change, not the test.

- [x] T7 — UI integration point (design §5): BFF route
      `app/api/tasks/[id]/route.ts` (GET, PATCH) forwarding the browser `cookie`
      and relaying status + JSON verbatim; `lib/tasks.ts` `fetchTask(id)` in the
      same discriminated shape as `fetchListTasks`; `app/tasks/[id]/page.tsx` as
      the addressable surface for **SCR-WEB-010**; `components/list-view.tsx`
      `TaskRow` gaining the due-date chip and priority dot and becoming the click
      target for detail; `components/quick-add.tsx` gaining the inline due-date
      and priority affordances design.md specifies. Screens are ui-design's
      manifest; this task is the contract wiring only.
      Done when: opening a task shows its title, list, due date, priority and
      status (AC-1); editing the title saves and re-renders, and an invalid title
      shows the field error **keeping the typed value** (AC-2, AC-13); setting a
      due date and a priority persists both and each survives a reload (AC-3,
      AC-6); clearing the due date removes the chip and any overdue treatment
      (AC-4); a past due date renders the chip in `--color-danger` **with the
      word "Overdue"**, never colour alone (AC-5, AC-14); a completed task with a
      past due date shows no overdue treatment (AC-5); an unknown or unowned
      `/tasks/{id}` renders the uniform not-found state without disclosing which
      (AC-8, AC-13); an unauthenticated visit redirects to `/signin` (AC-9); and
      quick-add can create a task with a due date and priority in one action
      (AC-10). **No list picker** — the contract rejects `listId` and moving a
      task between lists is not in this feature (design §8).

- [x] T8 — E2E: extend `e2e/tests/` with the path this feature completes —
      sign in → add a task → open its detail → set a due date in the past and a
      priority → the list row shows the overdue chip and the priority dot →
      clear the due date → the overdue treatment goes. [UC-010]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the FEAT-009 and FEAT-010 specs still green.

- [x] T9 — Verify: acceptance criteria AC-1..AC-14 (design §6) demonstrably pass;
      `npm run db:migrate` up **and** down clean (T1); `npm run boundaries`,
      `npm run lint`, `npm run build`, and the api + shared + web + e2e suites
      green — the api suite **serially** while DEF-002 is open, with any parallel
      failure re-checked serially before it is attributed to this feature.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
