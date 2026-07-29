# Tasks: FEAT-012 — Complete / reopen task

> Executes: docs/features/FEAT-012-complete-reopen/technical-design.md
> Status: pending | in-progress | done per task · Last updated: 2026-07-29
> Notes: **No migration** (design §4/D3) — `tasks.completed_at` and the partial
> `tasks_active_by_list_idx` have existed since migration 007, which named this
> feature as the column's writer. If you find yourself writing a migration, stop
> and re-read D3. This feature **extends** the `tasks` module and the
> `TaskItemController` FEAT-011 built; it restructures nothing on the API side.
> **The two design subtleties to hold onto:** (1) both routes are **idempotent**
> via `COALESCE(completed_at, now())` — a repeat complete returns the ORIGINAL
> timestamp, never a re-stamp and never a 409 (D2); (2) on the web side the
> checkbox is a **sibling** of the row `<Link>`, never nested inside it — an
> interactive control inside an anchor is invalid HTML with undefined activation
> behaviour (D6).
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T7 exists for the same reason FEAT-010's and FEAT-011's did — this feature
> completes the loop a user actually came for (add → schedule → finish → reopen).
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/tasks/task-item.controller.spec.ts` is the closest model, and
> `tasks-lists-integration.spec.ts` is the model for T5).
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

- [x] T1 — Shared contracts (`@todo/shared`, design §5): `completeTaskPath(id)`,
      `reopenTaskPath(id)` and `TaskStatusResponse` in a FEAT-012 block beside
      FEAT-011's. Nothing existing changes shape — `TaskSummary.completedAt`
      already carries the status on the wire.
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols with **no change to any existing exported shape**.

- [x] T2 — Domain: repository `setCompletion(ownerId, id, completed)` (design §5;
      FR-TASK-009, FR-TASK-010, FR-AUTHZ-002/003/005). **One** statement —
      `UPDATE tasks SET completed_at = COALESCE(completed_at, now()) | NULL,
      updated_at = now() WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${TASK_COLUMNS}` — projecting the existing `TASK_COLUMNS`
      constant. A zero-row result is the same uniform not-found `findById`
      returns; no new error class.
      Done when: integration tests pass for AC-1 (an active row gains a
      `completed_at` inside the request window), AC-2 (reopen sets it back to SQL
      NULL and every other column is byte-identical across both transitions),
      AC-5 (a repeat complete returns the **original** instant — asserted at the
      row, not just the response), and AC-7 (another owner's id, an unknown uuid
      and a soft-deleted id all return null with the target row's `completed_at`
      **and** `updated_at` unmodified).

- [x] T3 — Domain: `TasksService.complete(ownerId, id)` / `.reopen(ownerId, id)`
      (design §5; FR-TASK-009/010). `assertTaskLookupId` reused for the non-uuid
      path, `TaskNotFoundError` on a null row, `toSummary` for the response — so
      `isOverdue` comes from the **single existing derivation** and this feature
      adds no second opinion about overdue (D4).
      Done when: the T2 criteria hold through the service surface (asserted
      against `TaskSummary` shapes) plus AC-4 in full — completing a task with a
      **past** `dueAt` returns `isOverdue: false` in that same response, reopening
      it returns `true` again, `dueAt` unchanged throughout, and a completed task
      with a **future** due date is likewise not overdue.

- [x] T4 — Contract: `POST /tasks/:id/complete` and `POST /tasks/:id/reopen` on the
      existing `TaskItemController` (design §3), `@HttpCode(200)`, **no `@Body()`
      and no DTO** (D8), reusing the file's existing `toHttp`.
      Done when: supertest contract tests pass for AC-1 (`200 { task }`,
      `completedAt` non-null ISO-8601 UTC, `GET /tasks/{id}` agrees), AC-2
      (`completedAt: null` after reopen), AC-5 (a repeat call on either route is
      `200`, byte-identical `completedAt`, never `409`), AC-7 (`404
      task_not_found` **byte-identical** across unknown uuid, another owner's
      task, a non-uuid segment and a soft-deleted task, on **both** routes, target
      row unmodified), AC-8 (`401 unauthenticated` on both with no/expired/revoked
      cookie, nothing written), and AC-9 (**exactly one** `DbService` query per
      route, inside the 300 ms bound), each rendering the `ApiError` envelope.

- [x] T5 — Contract: the cross-feature consequences of a transition
      (`tasks-lists-integration.spec.ts`; design §3 side-effects; FR-TASK-003,
      FR-TASK-011, FR-LIST-005).
      Done when: AC-3 passes (completing moves the task into `completed` and out
      of `active` in `GET /lists/{listId}/tasks`; reopening reverses it; with two
      tasks completed in a known order `completed` is most-recently-completed
      first and `active` stays oldest-first) and AC-6 passes (completing
      decrements `activeTaskCount` and leaves `taskCount` unchanged on **both**
      `GET /lists` and the `list` inside `GET /lists/{listId}/tasks`; reopening
      restores it) — the first feature able to move a row across that aggregate's
      predicate, so it is asserted rather than assumed.

- [x] T6 — UI integration point (design §5): BFF routes
      `app/api/tasks/[id]/complete/route.ts` and `.../reopen/route.ts` (POST,
      cookie forwarded, status + JSON relayed verbatim, no body);
      `components/task-checkbox.tsx` as a **new client island** (design.md §4
      `checkbox` — circular, `--color-success` when checked) posting to the BFF and
      calling `router.refresh()` on success; `components/list-view.tsx` `TaskRow`
      **restructured so the checkbox is a sibling of the row `<Link>`** (D6) and
      the completed section rendered as a collapsed `<details>`/`<summary>`
      disclosure carrying its count (D5); `components/task-detail.tsx`'s read-only
      `detail-status` becoming the same transition control (one component serves
      both the intercepted panel and the full page). Screens are ui-design's
      manifest; this task is the contract wiring only.
      Done when: ticking an active row completes the task — it moves to the
      completed section, renders strikethrough + `--color-text-muted`, loses any
      overdue treatment, and the header and sidebar counts drop, with no full page
      navigation (AC-11); the completed section is **collapsed by default**, shows
      its count, and expands by mouse **and** by keyboard alone with the state
      exposed to assistive technology (AC-10); it is absent entirely when nothing
      is completed (AC-10); unticking a row inside it reopens the task and
      reverses all of the above (AC-11); the detail surface offers the same
      transition in both its panel and full-page presentations and shows the
      resulting status (AC-11); and a failed transition leaves the control in its
      **pre-click** state with an inline message, never showing completed while
      the row is still active (AC-12).

- [ ] T7 — E2E: extend `e2e/tests/` with the path this feature completes — sign in
      → add a task → complete it from the list row → it leaves the active section
      and appears under an expandable Completed section → reopen it from there →
      it returns to active, with the list count moving both ways. [UC-011]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the FEAT-009, FEAT-010 and FEAT-011 specs still green.

- [ ] T8 — Verify: acceptance criteria AC-1..AC-12 (design §6) demonstrably pass;
      **no migration was added** (D3 — the check is that `migrations/` is
      unchanged and `npm run db:migrate` is a no-op at head); `npm run boundaries`,
      `npm run lint`, `npm run build`, and the api + shared + web + e2e suites
      green — the api suite **serially** while DEF-002 is open, with any parallel
      failure re-checked serially before it is attributed to this feature.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
