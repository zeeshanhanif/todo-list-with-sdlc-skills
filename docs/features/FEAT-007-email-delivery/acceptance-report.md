# Acceptance Report: FEAT-007 — Email delivery pipeline

> Verdict: **Accepted** · Date: 2026-07-22
> Standard: technical-design.md §6 @ 865dfd6 · Sources: docs/srs.md, docs/use-cases.md
> Repo state audited: 865dfd6 (+ acceptance correction commit)

## Verdict summary

FEAT-007 is **accepted — verified**. The eight criteria faithfully scope
FR-AUTH-005/FR-AUTH-013 to their *delivery* side (enqueue and single-use
consumption belong to FEAT-001/002/005) and cover SW-001/002 and the OBS NFRs;
all suites were re-run fresh and observed green (worker 20/20, api 24/24, e2e
4/4), and every behavior was additionally verified by running the **real worker
binary** against Postgres — verification and reset delivery, a real SMTP failure
degrading to a scheduled retry, and dead-letter at the attempt cap. One coverage
gap (AC-5's concurrency sub-claim was untested) was closed by an added test.
No rework or design-defect findings. RTM Test ref appended for both FRs (partial).

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-005 (delivery), SW-001 | outbox-drain.service.spec | faithful | green + live: log shows /verify?token link, row→sent |
| AC-2 | SW-002; UC-001 exc-5a / UC-005 exc-3a | outbox-drain.service.spec | faithful | green + live: real SMTP ECONNREFUSED → pending, attempts=1, backoff, last_error |
| AC-3 | ADR-007 dead-letter, NFR-OBS-003 | outbox-drain.service.spec | faithful | green + live: max=1 + SMTP fail → status=failed, logged |
| AC-4 | backoff schedule | outbox.repository.spec | faithful | green: next_attempt_at ≈ now+60s at attempts=1 |
| AC-5 | idempotency / due-gating / SKIP LOCKED | outbox.repository.spec (+ **added** concurrency test), outbox-drain.service.spec | was partial → **corrected** | green: sent/future not claimed; concurrent claims disjoint |
| AC-6 | FR-AUTH-013 (delivery) | outbox-drain.service.spec | faithful | green + live: log shows /reset-password?token link, row→sent |
| AC-7 | SW-001 / C-7 swappable port | email.provider.spec, log/smtp port specs | faithful | green + live: log & smtp providers both exercised |
| AC-8 | observability summary, NFR-OBS-001 | outbox-drain.service.spec | faithful | green + live: `{sent,retried,deadLettered}` returned + logged |

Standard audit: FR-AUTH-005 → AC-1, FR-AUTH-013 → AC-6, SW-001 → AC-1/AC-7,
SW-002 → AC-2/AC-3, UC-001 exc-5a / UC-005 exc-3a → AC-2, NFR-OBS-001 → AC-8,
NFR-OBS-003 → AC-3. Criteria faithful to the delivery scope; no misencoding, no
tombstoned references.

## Corrected tests

- **Added AC-5 concurrency test** (`outbox.repository.spec.ts`): AC-5's third
  sub-claim — concurrent claims never double-process a row (`FOR UPDATE SKIP
  LOCKED`) — was asserted only by SQL inspection. Added an integration test racing
  two `claimDue` calls and asserting disjoint claimed id sets. Correction is toward
  the criterion (verifies what AC-5 states); no production code changed. Commit:
  "FEAT-007 acceptance: add concurrency test for AC-5 (SKIP LOCKED)".

## Independent execution (repo @ 865dfd6 + correction, harness commands)

- **Unit suites** (`npm test`): worker **20/20** (7 suites, incl. added test),
  api **24/24** — green.
- **E2E** (`npm run test:e2e`): **4/4** — feature broke nothing.
- **Boundaries** clean (51 modules); **lint** clean (web+api — see Findings re: worker).
- **Migration 003**: `down` drops the retry columns + due-index, `up` restores — clean.
- No flakiness observed.

## Direct verification (real worker binary, real SmtpEmailPort)

- **Verification delivery (EMAIL_PROVIDER=log):** pending `verification` row →
  LogEmailPort logs the message with `http://localhost:3000/verify?token=vtok`;
  row `pending → sent` (FR-AUTH-005 delivery, AC-1).
- **Reset delivery:** pending `password_reset` row → log shows
  `/reset-password?token=rtok`; row → `sent` (FR-AUTH-013 delivery, AC-6).
- **Failure → retry (EMAIL_PROVIDER=smtp, unreachable SMTP_URL, max=5):** real
  `connect ECONNREFUSED` → row stays `pending`, `attempts=1`, `next_attempt_at` in
  the future, `last_error` recorded — retained, not lost (SW-002, AC-2).
- **Dead-letter (smtp fail, max=1):** row → `status=failed` (AC-3).
- **NFRs:** no hard performance bound binds the worker (a scheduled batch job; the
  architecture sets no latency SLA on delivery — ADR-007 accepts up-to-interval
  latency). Nothing pending environment.
- **Screens/contracts:** none — FEAT-007 has no HTTP surface or screens (SW-003).

## Findings

**Rework:** none.
**Design defect:** none.
**Minor (non-blocking):**
- **Worker code is not covered by `npm run lint`** — the scaffold's root lint
  targets only web + api, and the worker has no ESLint config. Pre-existing
  scaffold gap (recorded by implementation), not a FEAT-007 defect. Recommend a
  worker lint config in a future foundations pass.
- FR-AUTH-005/FR-AUTH-013 are delivered **partially** by FEAT-007 (the delivery
  side); enqueue is FEAT-001/FEAT-005 and single-use *consumption* is FEAT-002.
  Test refs marked `(partial)`.
- Open item carried from design §8: the concrete email **provider is Q7 (TBD)** —
  the SMTP adapter works today; a vendor adapter is a drop-in. Not blocking.
- (Not this feature) e2e signup tests leave `email_outbox` rows uncleaned; the
  worker legitimately delivers them during runs — benign, a FEAT-001 test-hygiene item.

## RTM

Accepted → Test ref appended (Test ref column only, append-only):
- FR-AUTH-005 → `features/FEAT-007-email-delivery/acceptance-report.md (partial)`
  (joins the FEAT-001 partial; both features in its Plan ref now have accepted
  reports → the FR is fully verified by computation).
- FR-AUTH-013 → `features/FEAT-007-email-delivery/acceptance-report.md (partial)`
  (remains partially verified — FEAT-005, the enqueue side, is not yet built).
