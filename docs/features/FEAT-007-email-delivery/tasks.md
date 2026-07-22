# Tasks: FEAT-007 — Email delivery pipeline

> Executes: docs/features/FEAT-007-email-delivery/technical-design.md
> Status: pending per task · Last updated: 2026-07-22
> No screens (backend-only) → no ui-design, no UI task. No architecture-named
> critical E2E flow → no mandatory Playwright task (legitimate skip). Behavioral
> tasks use Jest unit + integration (worker's established runner) against local
> Postgres.

- [x] T1 — Migration 003: extend `email_outbox` with `attempts`, `next_attempt_at`,
      `sent_at`, `last_error` + partial due-index (design §4).
      Done when: `npm run db:migrate` applies clean and the down migration reverts
      (columns + index dropped), against the current schema.

- [x] T2 — Worker foundations: add `nodemailer` (+ types) dep, `config.ts`
      (EMAIL_PROVIDER, SMTP_URL, EMAIL_FROM, PUBLIC_APP_URL, EMAIL_MAX_ATTEMPTS,
      EMAIL_BATCH_SIZE, backoff base/cap), and a jest `globalSetup` that applies
      migrations so worker integration tests are self-contained (design §2, §5).
      Done when: worker builds; `npm run test -w @todo/worker` runs with the DB
      schema present.

- [x] T3 — EmailPort + adapters: `EmailPort`/`EmailMessage`, `LogEmailPort`,
      `SmtpEmailPort` (nodemailer), and the `EMAIL_PROVIDER` factory
      (design §3, §5, D1; SW-001, C-7).
      Done when: unit tests pass — LogEmailPort captures the message; SmtpEmailPort
      sends via nodemailer `jsonTransport` (no real server); factory selects by config (AC-7).

- [x] T4 — EmailRenderer: render `verification` and `password_reset` messages with
      links from `PUBLIC_APP_URL` + token (design §5, D3; FR-AUTH-005 and FR-AUTH-013 content).
      Done when: unit tests assert subject + correct link per type; unknown type throws.

- [x] T5 — OutboxRepository: `claimDue(limit)` (atomic pre-increment + backoff +
      `FOR UPDATE SKIP LOCKED`), `markSent`, `markFailed`, `recordRetry` (design §5).
      Done when: integration tests — claim returns due rows and skips `sent` and
      not-yet-due rows; each mark updates the expected columns (AC-4, AC-5).

- [x] T6 — OutboxDrainService.drain(): claim → render → `EmailPort.send` → mark;
      dead-letter at `EMAIL_MAX_ATTEMPTS`; structured `{sent,retried,deadLettered}`
      summary (design §5; SW-002, ADR-007, NFR-OBS-001/003).
      Done when: integration tests for AC-1, AC-2, AC-3, AC-5, AC-6, AC-8 pass
      against local Postgres with a fake EmailPort.

- [x] T7 — Wire the job: `main.ts` runs `OutboxDrainService.drain()`; remove the
      no-op `CleanupService` (+ its spec); update `worker.module.ts` (design §5).
      Done when: running the worker against local Postgres drains a real `pending`
      verification row end-to-end via `LogEmailPort` and marks it `sent`.

- [x] T8 — Verify: all acceptance criteria AC-1..AC-8 (design §6) demonstrably pass;
      `npm run boundaries`, `npm run lint`, worker + whole-repo suites green;
      migration up/down clean; no WIP markers.
      Done when: the full gate passes.
