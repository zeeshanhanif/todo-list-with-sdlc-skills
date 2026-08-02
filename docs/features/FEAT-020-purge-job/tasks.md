# Tasks: FEAT-020 — Soft-deleted task purge job

> Executes: docs/features/FEAT-020-purge-job/technical-design.md
> Status: pending per task · Last updated: 2026-08-02
> No screens (backend-only) → no ui-design, no UI task. No architecture-named
> critical E2E flow → no mandatory Playwright task (legitimate skip, design §8);
> UC-012's user-facing half already has `e2e/tests/delete-restore.spec.ts`.
> Behavioral tasks use Jest integration specs against local Postgres — the
> worker's established runner (schema via `apps/worker/test/global-setup.js`).

- [ ] T1 — Migration 013 (`migrations/1721600000000_task-purge-index.js`): partial
      index `tasks_purge_due_idx ON tasks (deleted_at) WHERE deleted_at IS NOT NULL`
      (design §4).
      Done when: `npm run db:migrate` applies clean against the current schema
      (last migration 012) and the down migration drops the index, verified by
      `\di` / `pg_indexes` before and after.

- [ ] T2 — Worker config: add `taskRetentionDays` (`TASK_RETENTION_DAYS`, default
      30) and `purgeBatchSize` (`PURGE_BATCH_SIZE`, default 500) to
      `apps/worker/src/config.ts`; document both in `.env.example` beside the
      `EMAIL_*` block (design §5, D1).
      Done when: the worker builds and `readConfig()` returns 30/500 with the vars
      unset and the overridden values when set.

- [ ] T3 — `PurgeRepository.purgeExpired({ retentionDays, limit })` in
      `apps/worker/src/purge/purge.repository.ts` — the batched
      `DELETE … FOR UPDATE SKIP LOCKED` against the retention cutoff, returning the
      row count (design §5; FR-TASK-015).
      Done when: integration tests pass for AC-1 (expired row gone), AC-2
      (in-window row survives), AC-3 (active and completed rows with
      `deleted_at IS NULL` untouched however old), AC-5 (completed-then-deleted
      purges too), AC-6 (a non-default `retentionDays` changes what is purged),
      and AC-11 (a second user's expired-looking-but-in-window rows and all
      `lists` rows survive a run).

- [ ] T4 — `TaskPurgeService.purge()` in
      `apps/worker/src/purge/task-purge.service.ts` — batch loop to exhaustion
      under the `MAX_ITERATIONS` safety cap, `{ purged }` summary returned and
      logged as structured JSON (design §5; NFR-OBS-001).
      Done when: integration tests pass for AC-7 (more expired rows than one batch
      → all purged across batches; the cap bounds the loop) and AC-8 (one summary
      line carrying `purged`).

- [ ] T5 — Wire the job: register `PurgeRepository` + `TaskPurgeService` in
      `worker.module.ts`; `main.ts` runs `drain()` then `purge()` with each pass
      guarded so one failure cannot skip the other, rethrowing afterwards so the
      exit code stays honest; rewrite the `main.ts:11` forward-reference comment
      that names this feature (design §5, D4).
      Done when: running the worker against local Postgres with a seeded expired
      row deletes it and logs both summaries; AC-9 demonstrated by forcing each
      pass to throw in turn and observing the other still ran and the process
      exited non-zero.

- [ ] T6 — Index effectiveness: `EXPLAIN` the purge's selection query at seeded
      scale and confirm it uses `tasks_purge_due_idx` rather than a sequential
      scan of `tasks` (design §4, D5; AC-10).
      Done when: the plan is captured in the run and shows the index scan — the
      measurement D5's claim stands or falls on.

- [ ] T7 — AC-4, the API-observable boundary: in
      `apps/api/src/modules/tasks/tasks-lists-integration.spec.ts`, soft-delete a
      task through the real endpoint, remove the row directly (reproducing the
      purge's only effect — design §8's recorded composition), then assert
      `POST /tasks/{id}/restore` answers `404 task_not_found`
      (design §3, §6 AC-4; FR-TASK-015, FR-TASK-014's limit).
      Done when: the test passes and fails if the restore path stops returning the
      uniform not-found.

- [ ] T8 — Verify: all acceptance criteria AC-1..AC-11 (design §6) demonstrably
      pass; `npm run boundaries`, `npm run lint`, worker + api + web suites and
      the e2e suite green; migration 013 up/down clean; no WIP markers.
      Done when: the full gate passes.
