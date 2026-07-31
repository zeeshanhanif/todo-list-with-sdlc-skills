# Tasks: FEAT-014 — Reorder active tasks within a list

> Executes: docs/features/FEAT-014-reorder-tasks/technical-design.md
> Status: pending · Last updated: 2026-08-01
> Notes: **The pattern already exists — copy it, don't invent it.** FEAT-009's
> `POST /lists/reorder` is this feature's model end to end: whole-vector
> submission, set-equality in the service, `unnest(...) WITH ORDINALITY` rewrite
> in one transaction, full collection returned, menu-driven UI in
> `lists-nav.tsx`. Read `ListsService.reorder`, `ListsRepository.setPositions`,
> `ReorderListsDto` and `app/api/lists/reorder/route.ts` before writing T3–T5, T7.
> **The four design subtleties to hold onto:** (1) the vector is the **active**
> set only — completed rows keep their stored positions and are never renumbered
> (D3). (2) **Do not touch `setCompletion` or `setDeletion`** — FEAT-012/013 are
> verified contracts, and D4 is explicit that reopen/restore write no position;
> `created_at ASC, id ASC` behind `position` is what makes their landing spot
> deterministic. (3) `create` appends with `MAX(position) + 1` over **all** the
> list's rows, soft-deleted included (D5) — a MAX that filters `deleted_at IS
> NULL` is a collision waiting for FEAT-013's restore. (4) **No new index** (D9)
> — T9 measures instead; if you find yourself writing a second migration, re-read
> D9 first.
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T8 exists for the same reason FEAT-010/011/012/013's did — this feature
> completes UC-010's other half, and cross-device persistence is only observable
> end to end.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/lists/lists.service.spec.ts` + `lists.controller.spec.ts` are the
> closest models for T4/T5; `tasks-lists-integration.spec.ts` is the model for
> T6). Web unit tests use the jest + RTL runner that now exists in `apps/web`
> (`components/smart-view.spec.tsx` is the model).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression, and new specs must
> assert their own fixture responses (`200`/`201`) rather than destructuring an
> unchecked one.
> **Known harness trap (FEAT-009 acceptance, minor 2):** the E2E webServer sets no
> `AUTH_RATELIMIT_MAX`, so repeated local runs exhaust the per-IP register limiter
> and fail the *whole* suite with an unrelated-looking error. If that happens,
> clear `auth_rate_buckets` for `::1` — do not "fix" it by weakening a test.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3.2/§5): `reorderTasksPath(listId)`,
      `ReorderTasksRequest`, and **`position: number` on `TaskSummary`** —
      replacing the "FEAT-014 adds `position`" note with the field and its
      meaning (0-based rank within the list's *active* order; stored but not
      meaningful for completed/soft-deleted rows, D8).
      Done when: `npm run build -w @todo/shared` is clean and the existing
      consumers still typecheck (`npm run build`) — the addition is additive.

- [x] T2 — Migration 012 `1721590000000_task-manual-order.js` (design §4):
      add `tasks.position integer NOT NULL DEFAULT 0`; backfill dense
      `0..n-1` **per `(owner_id, list_id)`** ordered `created_at ASC, id ASC`
      over *all* the list's rows (completed and soft-deleted included); down
      drops the column. No index (D9).
      Done when: `npm run db:migrate` applies clean, `migrate down` reverses it,
      and a re-applied migration leaves every row in a list with a distinct
      position (AC-13's precondition).

- [ ] T3 — Repository (design §5; FR-TASK-012): project `position` in
      `TASK_COLUMNS` / `TaskRow` / `toTaskRow`; change `findByList`'s active
      branch to `position ASC` with `created_at ASC, id ASC` behind it (completed
      branch untouched); append on `create` via the `MAX(position) + 1` scalar
      sub-select (D5); add `setPositions(tx, ownerId, listId, orderedIds)` and
      `findActiveIdsByList(ownerId, listId, tx)`.
      Done when: `tasks.repository.spec.ts` covers AC-3 (append), AC-9/AC-10
      (reopened/restored rows land deterministically behind the tiebreaker) and
      the unchanged completed ordering, and passes.

- [ ] T4 — Service: `TasksService.reorder(ownerId, listId, taskIds)` in one
      transaction — list ownership → duplicate check → set-equality against the
      active ids → `setPositions` → re-read the view (design §5; FR-TASK-012,
      FR-AUTHZ-002/003). Inject `DbService` alongside the repository.
      Done when: unit tests for AC-1, AC-4 (idempotent, dense `0..n-1`), AC-5
      (duplicate / missing / extra / completed / soft-deleted / other-list /
      other-user ids all raise the **same** `TaskFieldInvalidError('taskIds', …)`
      and write nothing) and AC-6 (unknown, foreign and non-uuid list ids raise
      the same `ListNotFoundError`) pass.

- [ ] T5 — Contract: `@Post('reorder')` on `TasksController` with
      `ReorderTasksDto`, `@HttpCode(200)`, returning `ListTasksResponse`
      (design §3.1; UC-010 main 2–3). `toHttp` needs no change — verify that
      rather than assume it.
      Done when: contract tests pass for `200` + the designed errors —
      AC-5 (`400 validation_failed`, field `taskIds`, one message; plus the
      DTO's own shape failures), AC-6 (`404 list_not_found`, **byte-identical**
      across the three causes), AC-7 (`401`, nothing written).

- [ ] T6 — Cross-feature integration (design §5/§6; FR-TASK-003/009/010/014,
      FR-LIST-005): one spec exercising reorder against the rest of the task
      loop — completed section order unchanged, remaining actives keep their
      relative order after a completion, `activeTaskCount` unaffected, a task
      created after a reorder lands last, a reopened and a restored task land at
      their stored position and read the same way twice.
      Done when: the spec covers AC-3, AC-8, AC-9, AC-10 and passes; **no
      FEAT-010/011/012/013 test needed an edit** to stay green (if one does, the
      change was not additive — stop and re-read D4).

- [ ] T7 — UI integration: consume the contract on SCR-WEB-008 per ui-design's
      manifest — the reorder affordance on `task-row`, optimistic move →
      `POST` the full active vector → `router.refresh()`, inline error on
      failure (the `lists-nav.tsx` shape) — plus the BFF route
      `app/api/lists/[id]/tasks/reorder/route.ts` (design §3.3).
      *(The screen spec itself is ui-design's output; this task is the wiring.)*
      Done when: the affordance renders per the manifest, a move persists across
      a reload, and a web unit test covers AC-12 (keyboard operability,
      accessible names) and AC-15 (failure surfaces an explicit error, no
      half-applied order).

- [ ] T8 — E2E: extend `e2e/tests/` with the path this feature completes — sign
      in → add three tasks → reorder them from the list view → the new order is
      the rendered order → **reload** and it is still the rendered order →
      complete one and the remaining two keep their relative order. [UC-010]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), covering AC-1, AC-2 (server-side persistence observed across a fresh
      page load) and AC-8.

- [ ] T9 — Verify: every acceptance criterion in design §6 demonstrably passes,
      including **AC-11 measured** (reorder and list-view timings for a 50-task
      list, recorded here against NFR-PERF-001's 300 ms — and D9's index added
      only if the number demands it), AC-13 checked against a pre-migration
      database, and AC-14 confirmed by the search/smart-view suites still green.
      `npm run lint`, `npm run boundaries` and `npm run build` clean; api, web,
      worker and e2e suites green.
      Done when: all of the above are run and their results recorded in the
      commit; nothing is checked off from inspection alone.
