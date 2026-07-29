# Tasks: FEAT-013 — Delete / restore task (soft-delete + undo)

> Executes: docs/features/FEAT-013-delete-restore/technical-design.md
> Status: pending · Last updated: 2026-07-29
> Notes: **No migration** (design §4/D8) — `tasks.deleted_at` and the partial
> `tasks_active_by_list_idx` have existed since migration 007, which named this
> feature as the column's writer, and four statements plus the list aggregate
> already read it. If you find yourself writing a migration, stop and re-read D8.
> **The four design subtleties to hold onto:** (1) `setDeletion` is the **only**
> statement in the module that omits `AND deleted_at IS NULL` — restore must reach
> a deleted row; ownership stays in the `WHERE` (D5). (2) Delete is **idempotent
> and never re-stamps** `deleted_at` via `COALESCE(deleted_at, now())` — that
> column is FR-TASK-015's retention clock, and a re-stamp would extend it (D3).
> (3) The undo host goes in **`app/layout.tsx`**, wrapping both `{children}` and
> `{detail}`, because the detail slot is a *sibling* of children — anything held
> in the panel dies when the panel closes (D6). (4) **Delete is confirmed AND
> undoable** — a `confirm-dialog` in front of the DELETE and the undo snackbar
> after it, per the product owner's 2026-07-29 ruling on NFR-USE-002's literal
> reading (D2). ux-foundations §A5 / Flow 3 still describe the snackbar-only flow
> and owe a small amendment (design §8); build what D2 says, not what Flow 3
> draws. The API is unaffected — confirmation is entirely client-side.
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T7 exists for the same reason FEAT-010/011/012's did, and harder: with no
> web unit-test runner (design §8), Playwright is the only harness that can see the
> snackbar's timing at all.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/tasks/task-item.controller.spec.ts` is the closest model;
> `tasks-lists-integration.spec.ts` is the model for T5).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression (design §8), and new
> specs must assert their own fixture responses (`200`/`201`) rather than
> destructuring an unchecked one.
> **Known harness trap (FEAT-009 acceptance, minor 2):** the E2E webServer sets no
> `AUTH_RATELIMIT_MAX`, so repeated local runs exhaust the per-IP register limiter
> and fail the *whole* suite with an unrelated-looking error. If that happens,
> clear `auth_rate_buckets` for `::1` — do not "fix" it by weakening a test.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §5): `restoreTaskPath(id)`,
      `DeleteTaskResponse` (`{ task, deletedAt }` — D4) and `RestoreTaskResponse`
      (`{ task }`) in a FEAT-013 block beside FEAT-012's. `taskPath(id)` already
      addresses the DELETE. **`TaskSummary` does not change** (D4).
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols with **no change to any existing exported shape**.

- [x] T2 — Domain: repository `setDeletion(ownerId, id, deleted)` (design §5;
      FR-TASK-013, FR-TASK-014, FR-AUTHZ-002/003/005). Extend `TASK_COLUMNS` with
      `deleted_at` and `TaskRow` with `deletedAt: Date | null` (D5), then **one**
      statement — `UPDATE tasks SET deleted_at = COALESCE(deleted_at, now()) | NULL,
      updated_at = now() WHERE owner_id = $1 AND id = $2 RETURNING ${TASK_COLUMNS}`
      — with **no** `deleted_at IS NULL` guard, which is the point of the method.
      A zero-row result is the same uniform not-found `findById` returns; no new
      error class.
      Done when: integration tests pass for AC-1 (a row gains a `deleted_at` inside
      the request window while every other column stays byte-identical), AC-3
      (restore sets it back to SQL NULL and reaches a row the other statements
      cannot see), AC-4 (a repeat delete keeps the **original** instant — asserted
      at the row, not just the return value), and AC-6 (another owner's id — deleted
      **and** not — plus an unknown uuid return null with the target row's
      `deleted_at` and `updated_at` unmodified). The five pre-existing statements
      still carry their `deleted_at IS NULL` filter — assert one of them still
      hides a deleted row rather than assuming the projection change was inert.

- [x] T3 — Domain: `TasksService.softDelete(ownerId, id)` → `{ task, deletedAt }`
      and `.restore(ownerId, id)` → `TaskSummary` (design §5; FR-TASK-013/014).
      `assertTaskLookupId` reused for the non-uuid path, `TaskNotFoundError` on a
      null row, `toSummary` for the task, `toISOString()` for `deletedAt`
      (NFR-LOC-001) — so `isOverdue` keeps coming from the single existing
      derivation.
      Done when: the T2 criteria hold through the service surface (asserted against
      `TaskSummary` / `deletedAt` shapes), plus: a task deleted while **completed**
      restores with `completedAt` byte-identical (AC-3), and a task whose `dueAt`
      passed while it was deleted comes back with `isOverdue: true` — inherited,
      not re-implemented.

- [x] T4 — Contract: `DELETE /tasks/:id` (Nest's default `200`) and
      `POST /tasks/:id/restore` (`@HttpCode(200)`) on the existing
      `TaskItemController` (design §3), **no `@Body()` and no DTO**, reusing the
      file's existing `toHttp`.
      Done when: supertest contract tests pass for AC-1 (`200 { task, deletedAt }`,
      `deletedAt` a non-null ISO-8601 UTC instant within the request window, stored
      column agrees), AC-3 (`200 { task }` on restore; `GET /tasks/{id}` succeeds
      again), AC-4 (a repeat delete is `200` with **byte-identical** `deletedAt`,
      never `404`; restore on a non-deleted task is `200`), AC-6 (`404
      task_not_found` **byte-identical** across unknown uuid, non-uuid segment, and
      another owner's task — deleted and not — on **both** routes, target row
      unmodified), AC-7 (`401 unauthenticated` on both with no/expired/revoked
      cookie, nothing written), and AC-8 (**exactly one** `DbService` query per
      route, inside the 300 ms bound), each rendering the `ApiError` envelope.

- [x] T5 — Contract: the cross-feature consequences of a deletion
      (`tasks-lists-integration.spec.ts`; design §3 side-effects; FR-TASK-013,
      FR-LIST-005, and the FEAT-010/011/012 routes).
      Done when: AC-2 passes (after a delete the task is in **neither** `active` nor
      `completed` in `GET /lists/{listId}/tasks`, and `GET`, `PATCH`,
      `POST …/complete` and `POST …/reopen` on it each return the byte-identical
      uniform `404` — while the **row still exists** with `deleted_at` set, asserted
      at the database); AC-3's list-side half passes (restore returns the task to
      its original list **and** original section, active in its original
      `created_at` position, completed with its timestamp intact); and AC-5 passes
      (deleting an active task decrements `activeTaskCount` and leaves `taskCount`
      unchanged on **both** `GET /lists` and the list inside the list view;
      restoring restores it; deleting a completed task moves neither count).

- [ ] T6 — UI integration point (design §5): `DELETE` added to the existing
      `app/api/tasks/[id]/route.ts` proxy and a new
      `app/api/tasks/[id]/restore/route.ts` (POST, cookie forwarded, status + JSON
      relayed verbatim, no body); `components/undo-snackbar.tsx` as a **new client
      island** (`UndoHost` provider + `useUndo()`), mounted in `app/layout.tsx`
      around **both** `{children}` and `{detail}` (D6), rendering design.md §4's
      undo snackbar — `role="status"` / `aria-live="polite"`, an "Undo"
      `button-tertiary`, ~7 s auto-dismiss, no focus stealing — and posting to the
      restore BFF then `router.refresh()`; `components/task-detail.tsx` gaining the
      `button-danger` delete control design.md's `task-detail-panel` names, which
      opens design.md §4's **`confirm-dialog`** (D2 — focus trapped and restored,
      Esc/cancel close writing nothing, `button-danger` confirm; `list-dialog.tsx`'s
      `kind: "delete"` branch is the working precedent) and only on **confirm**
      calls `useUndo().deleted(...)` and then leaves the surface
      (`router.back()` in the panel, `router.push('/lists/{listId}')` on the full
      page — a new `presentation` prop from the two callers). Screens are
      ui-design's manifest; this task is the contract wiring only.
      Done when: the delete control opens the confirm dialog rather than deleting,
      and cancel/Esc close it with **nothing written** — the task still at the row,
      `deleted_at` still NULL, no request sent — with focus trapped while open and
      returned to the control on close (AC-9b); confirming removes the row from the
      list without a full page navigation and leaves the surface — panel closed,
      full page returned to its list (AC-9); the snackbar appears over the list,
      **survives the panel closing**, is announced politely without stealing focus,
      and its Undo is operable by keyboard alone (AC-10); Undo returns the task to
      its original list and section with the list and sidebar counts restored, and
      no full page navigation (AC-10); left alone the snackbar dismisses in ~7 s and
      the task stays deleted (AC-10); a failed delete leaves the task on screen and
      in the list with an inline recoverable message, and a failed Undo keeps the
      snackbar and its action rather than dismissing on a lie (AC-11).

- [ ] T7 — E2E: extend `e2e/tests/` with the path this feature completes — sign in
      → add a task → open it → hit delete → **cancel the confirm and see the task
      still there** → delete and confirm → the row is gone
      from the list and the count has dropped, with an undo snackbar present →
      click Undo → the task is back in its original section with the count restored;
      plus a second pass where the snackbar is left alone and the task stays gone
      after a reload. [UC-012 main 1–4]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB up),
      with the FEAT-009, FEAT-010, FEAT-011 and FEAT-012 specs still green.

- [ ] T8 — Verify: acceptance criteria AC-1..AC-12 **including AC-9b** (design §6)
      demonstrably pass;
      **no migration was added** (D8 — `migrations/` unchanged and
      `npm run db:migrate` a no-op at head); **no code path hard-deletes a task**
      (AC-12 — grep the diff for `DELETE FROM tasks`, which must appear nowhere);
      `npm run boundaries`, `npm run lint`, `npm run build`, and the api + shared +
      web + e2e suites green — the api suite **serially** while DEF-002 is open,
      with any parallel failure re-checked serially before it is attributed to this
      feature.
      Done when: the full feature suite passes and the checklist above is satisfied.
