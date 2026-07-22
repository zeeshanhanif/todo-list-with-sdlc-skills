# Technical Design: FEAT-007 — Email delivery pipeline

> Feature from: docs/implementation-plan.md §3 (EPIC-B) · Epic: Platform & Sync (worker)
> Implements: FR-AUTH-005 (delivery, partial), FR-AUTH-013 (delivery, partial) ·
> Realizes: SW-001, SW-002 · UC-001 (exc-5a), UC-005 (exc-3a) · Screens: none ·
> Binds NFR: NFR-OBS-001, NFR-OBS-003, NFR-SEC-001 (TLS to provider / COM-003) ·
> Constrains: ADR-007, C-6, C-7 · Status: Draft · Date: 2026-07-22

## 1. Intent

Actually deliver the emails that other features enqueue. Today the API writes a
`pending` row to `email_outbox` in the same transaction as registration
(FEAT-001) — but nothing sends it; the worker is still a no-op stub. This feature
makes the **Cleanup/Outbox Worker** (Cloud Run Job, triggered by Cloud Scheduler
~every minute) real: it drains due `email_outbox` rows, renders the message,
sends it through a swappable **EmailPort**, and marks the row `sent` — or, on
provider failure, schedules a retry with exponential backoff and dead-letters
after a threshold. This realizes the delivery side of FR-AUTH-005 (verification)
and FR-AUTH-013 (reset) and the SW-002 guarantee that email failures degrade to
delay, never to a blocked user action or a lost message.

## 2. Codebase context

Surveyed 2026-07-22 @ repo head (post-FEAT-001).

- **Worker** (`apps/worker/`): a NestJS **standalone app** (Cloud Run Job).
  `main.ts` builds an application context, runs `CleanupService.runOnce()`, and
  exits. `CleanupService` (`src/jobs/cleanup.service.ts`) is the **no-op stub**
  this feature replaces (its own comment names FEAT-007 for the outbox drain,
  FEAT-020 for purge). DB access is raw `pg` via `getPool()`
  (`src/infra/db.ts`) — the worker does **not** use the API's `DbService`.
- **Schema**: `email_outbox` (migration 002) currently has
  `id, type, recipient, payload(jsonb), status, created_at`. FEAT-001's design
  §8 explicitly reserved this table for FEAT-007 to extend with retry columns.
  Rows are produced by `EmailOutboxRepository.enqueueVerification`
  (`apps/api/src/modules/auth/`): `type='verification'`, `status='pending'`,
  `payload = { token, userId }` (raw token, for the link).
- **Migrations**: node-pg-migrate JS in `migrations/` (last is 002); worker/api
  integration tests apply them via a jest `globalSetup` (the api has one; the
  worker does **not** yet — this feature adds it).
- **No EmailPort / provider integration exists yet** — this feature creates it.
- **Conventions inherited**: structured JSON logs via Nest `Logger`
  (NFR-OBS-001); config from `process.env` with a local default (NFR-MAINT-003);
  worker tests are Jest with `getPool` mockable.
- **Divergence found**: none.

**Depends on:** FEAT-001 (produces the verification outbox rows this drains).
**Consumed later by:** FEAT-002 (resend → more verification rows), FEAT-005
(reset → `password_reset` rows). The pipeline is **type-agnostic**: it sends
whatever rows exist, so reset delivery works the moment FEAT-005 enqueues.

## 3. Interfaces (no HTTP API — a batch job)

FEAT-007 exposes **no HTTP endpoint** (SW-003). Its "contract" is the job
behavior and two internal ports:

**`EmailPort`** (the swappable provider boundary — C-7, SW-001):
```ts
interface EmailMessage { to: string; subject: string; text: string; html?: string; }
interface EmailPort { send(msg: EmailMessage): Promise<void>; } // throws on failure
```
- **`LogEmailPort`** (default, `EMAIL_PROVIDER=log`): logs the message and
  resolves. Lets the whole pipeline run locally/in CI with no external account.
- **`SmtpEmailPort`** (`EMAIL_PROVIDER=smtp`): nodemailer transport from
  `SMTP_URL`, `EMAIL_FROM`; sends over TLS (COM-003 / NFR-SEC-001). Works with
  any SMTP provider (portable — C-6; no vendor SDK).
- Selected by config at startup. A vendor-API adapter (once Q7 picks a provider)
  plugs in the same way — **§8 open item**.

**Job entrypoint**: `main.ts` runs `OutboxDrainService.drain()` once and exits
(Cloud Scheduler re-triggers ~every minute, ADR-007).

## 4. Schema changes

Migration **003** (`migrations/<ts>_outbox-retry.js`) — extends the existing
**EmailOutbox** entity (architecture §5); physical realization only, **no new
entity, no escalation**. Diff against current `email_outbox`:

| column | type | notes |
| :-- | :-- | :-- |
| `attempts` | int NOT NULL default `0` | send attempts made |
| `next_attempt_at` | timestamptz NULL | when the row becomes due again (NULL = immediately) |
| `sent_at` | timestamptz NULL | set when delivered |
| `last_error` | text NULL | last provider error (for retry visibility / dead-letter) |

`status` (existing) uses: `pending` (queued/retrying), `sent` (delivered),
`failed` (dead-lettered). Index for the claim query:
`CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status = 'pending'`.

**Down:** drop the index and the four columns.

## 5. Component design

New under `apps/worker/src/`:

- **`email/email.port.ts`** — `EmailPort` + `EmailMessage` types.
- **`email/log-email.port.ts`**, **`email/smtp-email.port.ts`** — the two
  adapters; **`email/email.provider.ts`** — factory selecting by `EMAIL_PROVIDER`.
- **`email/email-renderer.ts`** — `render(row): EmailMessage` keyed by `type`:
  - `verification` → subject "Verify your email"; link
    `${PUBLIC_APP_URL}/verify?token=<payload.token>` (served by FEAT-002, §8).
  - `password_reset` → subject "Reset your password"; link
    `${PUBLIC_APP_URL}/reset-password?token=<payload.token>` (FEAT-005).
  Unknown type → throw (surfaces as a send failure → retry/dead-letter).
- **`outbox/outbox.repository.ts`** — the claim/mark data ops (raw `pg`):
  - `claimDue(limit)` — atomically claims a batch and pre-schedules the next
    retry (single statement, `FOR UPDATE SKIP LOCKED` so overlapping job runs
    never double-claim):
    ```sql
    UPDATE email_outbox
    SET attempts = attempts + 1,
        next_attempt_at = now() + make_interval(secs =>
          LEAST(:backoffBase * power(2, attempts), :backoffCap))
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at LIMIT :batch
      FOR UPDATE SKIP LOCKED)
    RETURNING id, type, recipient, payload, attempts;
    ```
  - `markSent(id)` → `status='sent', sent_at=now(), last_error=NULL`.
  - `markFailed(id, error)` → `status='failed', last_error=error` (dead-letter).
  - `recordRetry(id, error)` → `last_error=error` (stays `pending`;
    `next_attempt_at` already set by the claim).
- **`outbox/outbox-drain.service.ts`** — `drain()`: claim a batch → for each row
  render + `EmailPort.send`; on success `markSent`; on failure, if the (already
  incremented) `attempts >= EMAIL_MAX_ATTEMPTS` → `markFailed` (dead-letter,
  logged at error for ops alerting, NFR-OBS-003) else `recordRetry`. Loops until
  no rows are claimed or a safety cap of iterations. Returns and logs
  `{ sent, retried, deadLettered }` (NFR-OBS-001).
- **`main.ts`** — runs `OutboxDrainService.drain()` (replacing
  `CleanupService.runOnce`); **`worker.module.ts`** — providers wired;
  **`config.ts`** — `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM`, `PUBLIC_APP_URL`,
  `EMAIL_MAX_ATTEMPTS` (default 5), `EMAIL_BATCH_SIZE` (default 50),
  `EMAIL_BACKOFF_BASE_SECONDS` (default 60), `EMAIL_BACKOFF_CAP_SECONDS` (3600).

**Stub replaced:** `CleanupService` (no-op) removed; `main.ts` now runs the real
drain. (FEAT-020 will add the soft-delete purge alongside it.)

Design note — **at-least-once, no lock held across the network send**: the claim
pre-increments `attempts` and sets `next_attempt_at` *before* sending, then
releases the row lock; the send happens outside any transaction. A crash after
send but before `markSent` means the row retries and the recipient may get a
duplicate — accepted (ADR-007 outbox semantics; duplicates are benign for
verification/reset). This avoids holding a DB connection open during provider I/O.

## 6. Acceptance criteria

- **AC-1 (FR-AUTH-005 delivery, SW-001):** Given a `pending` `verification` row,
  When `drain()` runs with a working EmailPort, Then the port receives one
  message to that recipient whose body contains the verification link built from
  `payload.token`, and the row becomes `status='sent'` with `sent_at` set.
- **AC-2 (SW-002, UC-001 exc-5a / UC-005 exc-3a):** Given the EmailPort throws,
  When `drain()` runs, Then the row is **not** `sent`: `attempts` incremented,
  `next_attempt_at` set to a future time, `status` stays `pending`, `last_error`
  recorded — the message is retained for retry, not lost.
- **AC-3 (ADR-007 dead-letter, NFR-OBS-003):** Given repeated send failures,
  When `attempts` reaches `EMAIL_MAX_ATTEMPTS`, Then the row is moved to
  `status='failed'` (dead-letter), no longer claimed, and the event is logged at
  error level for ops.
- **AC-4 (backoff):** `next_attempt_at` grows with `attempts` (exponential,
  capped) — a row that just failed is not immediately re-claimed.
- **AC-5 (idempotency / due-gating):** A `sent` row is never re-sent; a row whose
  `next_attempt_at` is in the future is not claimed until due; concurrent claims
  don't double-process a row (`FOR UPDATE SKIP LOCKED`).
- **AC-6 (FR-AUTH-013 delivery):** Given a `pending` `password_reset` row, When
  `drain()` runs, Then the port receives a message whose body contains the reset
  link, and the row is marked `sent`.
- **AC-7 (SW-001 / C-7 swappable port):** Delivery goes through `EmailPort`; with
  `EMAIL_PROVIDER=log` the pipeline runs end-to-end with no external service;
  `SmtpEmailPort` sends via nodemailer over TLS when configured.
- **AC-8 (observability, NFR-OBS-001):** Each run emits a structured summary
  `{ sent, retried, deadLettered }`.

## 7. Decisions

- **D1 — EmailPort with Log (default) + SMTP (nodemailer) adapters.** Driver:
  SW-001 + C-7 (swappable port) and Q7 (provider TBD). Log lets the pipeline run
  in dev/CI with no account; SMTP is the portable real sender (C-6 — no vendor
  SDK, TLS per COM-003). A vendor-API adapter is a future drop-in. Rejected:
  hard-coding a specific provider before Q7 is answered.
- **D2 — At-least-once, claim-then-send, no lock across I/O.** Driver: ADR-007
  (retry/backoff/dead-letter) + avoiding long transactions on the pooler. Pre-
  increment attempts + backoff on claim; send outside the tx; `SKIP LOCKED` for
  overlap safety. Accepts rare duplicates (benign). Rejected: holding
  `FOR UPDATE` across the network send (long locks), and exactly-once (needs
  provider idempotency keys — overkill at MVP volume).
- **D3 — Links built from `PUBLIC_APP_URL` + a path convention.** Driver:
  decoupling from routes other features own. Verify link → `/verify` (FEAT-002),
  reset link → `/reset-password` (FEAT-005). Recorded as a forward contract (§8).

## 8. Escalations & open items

- **No architecture amendment.** `email_outbox`/EmailOutbox and the `email` port
  are in the architecture (§5, ADR-007); this is physical realization only.
- **OPEN — email provider (SW-001, SRS Appendix B Q7).** The concrete production
  provider is undecided. FEAT-007 ships the swappable port with a working SMTP
  adapter and a log default; choosing a provider is a config/ops step (or a small
  new adapter), not a redesign. Flagged, not blocking.
- **Forward contract (D3):** the verification link targets `${PUBLIC_APP_URL}/verify?token=…`
  — **FEAT-002 must serve `/verify`**; the reset link targets `/reset-password?token=…`
  — **FEAT-005 must serve it** (the Sign Up page already links there). Recorded so
  those features honor the path.
- **NOTE — FR-AUTH-013 delivery is testable now but not producible yet:** no
  feature enqueues `password_reset` rows until FEAT-005. AC-6 is verified with a
  synthetic row; real end-to-end reset delivery completes when FEAT-005 lands.
