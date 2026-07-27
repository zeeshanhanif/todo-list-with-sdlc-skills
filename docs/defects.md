# Defect Ledger

Append-only record of defects found after a feature was verified. Owned by the
sdlc-orchestrator (the maintenance route); IDs are sequential, immutable, never
recycled.

| DEF | Reported | FR / Feature | Symptom (one line) | Fixed by | Re-verified |
| :-- | :------- | :----------- | :----------------- | :------- | :---------- |
| DEF-001 | 2026-07-27 | *(no FR — test infrastructure)* / FEAT-003, FEAT-005, FEAT-006 suites | Specs sharing an IP range delete each other's `auth_rate_buckets` rows mid-test, breaking `429` assertions | `24ae0d3` (disjoint ranges + `rate-limit-isolation.spec.ts` guard) | 2026-07-27 — guard red before / green after; flake rate ~25% → ~8% |
| DEF-002 | 2026-07-27 | *(no FR — test infrastructure)* / api suite | **Open.** Residual ~7% parallel-run flakiness after DEF-001: a *different* test fails each run, always "a row that should exist doesn't". Cross-worker DB interference **ruled out** — per-worker databases were tried and reverted | _open_ | _open_ |

## DEF-001 — parallel specs wipe each other's rate-limit buckets

**Reported:** 2026-07-27, by FEAT-010's acceptance verification (recorded there as
finding 1; also observed during FEAT-010's implementation).

**Classification — read this before treating it like a product bug.** This is a
**test-infrastructure defect, not a product defect**: no FR is violated, and no
shipped behavior is wrong. It is recorded here because the maintenance route is
where the pipeline tracks "something verified is now unreliable", and an api
suite that fails a quarter of the time makes *every* future feature's
verification gate untrustworthy — the gate is the thing that broke.

**Symptom.** `npm test -w @todo/api` fails ~2/8 runs, always on
`reset-password.controller.spec.ts` AC-7 ("forgot and reset are per-IP
rate-limited"), expecting `429` and receiving `400` (or `200`). Never fails
under `--runInBand`; never fails when the spec runs in isolation.

**Root cause (measured, not inferred).** The rate-limit guard was temporarily
instrumented to log `(ip, route, count, max)` and a failing run captured:

```
ip=192.0.2.16 route=POST /auth/reset count=1 max=2
ip=192.0.2.16 route=POST /auth/reset count=2 max=2
ip=192.0.2.16 route=POST /auth/reset count=1 max=2   ← counter reset mid-test
```

The third request created a *fresh* bucket row, so `count` never exceeded `max`
and no `429` was thrown. The row had been deleted between the second and third
request by another spec's `afterEach`, which runs
`DELETE FROM auth_rate_buckets WHERE ip LIKE '<prefix>%'` — in a different jest
worker, against the same database.

Two spec pairs shared a prefix where at least one side deletes it:

| Prefix | Specs | Deletes the prefix |
| :-- | :-- | :-- |
| `192.0.2.` | sign-in, reset-password, sign-out | sign-in ✅, reset-password ✅ |
| `198.51.100.` | change-password, rate-limit.guard, lists.controller | change-password ✅, rate-limit.guard ✅ |

Only the first pair had been observed failing; the second is the same defect and
would have surfaced later.

**Fix.** Every spec owns a **disjoint** IP range, and the invariant is enforced by
a test rather than a comment (`rate-limit-isolation.spec.ts`) so it cannot
regress silently as specs are added.

**Not the cause** (ruled out during diagnosis, recorded so it isn't re-litigated):
a leaked `AUTH_RATELIMIT_MAX` between suites in a reused worker. That leak was
real and was fixed during FEAT-010, but the instrumented trace shows `max=2`
correct at the moment of failure — the count was wrong, not the limit.

## DEF-002 — residual parallel-run flakiness (open)

**Reported:** 2026-07-27, while fixing DEF-001. Recorded separately because the
evidence shows it is a **distinct cause**, not leftover DEF-001.

**Symptom.** With DEF-001 fixed, `npm test -w @todo/api` still fails roughly
**8% of parallel runs** (measured ~5 failures across ~65 runs; the pre-DEF-001
rate was ~25%). `--runInBand` is deterministically green (142/142, repeatedly).
A **different test fails each time**, which is why this is not a per-test bug:

| Observed failure | Expected → received |
| :-- | :-- |
| `sign-in` AC-3 (unverified → 403) | 403 → 401 |
| `change-password` AC-1 (login in the helper) | 200 → 401 |
| `lists` AC-4 (rename the default list) | assertion failed |
| `tasks × lists` AC-7 (create task in a fresh list) | 201 → 404 |

The common shape: **something that was just created cannot be found** — a user
that cannot authenticate, a list that reports `list_not_found`.

**Ruled out** (each checked, so the next session does not repeat the work):

- *DEF-001's bucket collisions* — fixed and guarded; the failures above are not
  rate-limit assertions.
- *`AUTH_RATELIMIT_MAX` leaking between suites in a reused worker* — real, fixed
  during FEAT-010; the instrumented DEF-001 trace showed the limit correct at the
  moment of failure.
- *Connection-pool exhaustion* — peak observed **14** connections against
  `max_connections = 100` during a full 14-worker run.
- *Broadly-scoped cleanup* — every `DELETE` in every spec is keyed on a unique
  email, id, or IP; `globalSetup` only runs migrations, once.
- *Capping jest workers* — `maxWorkers: 4` was tried and **reverted**: an initial
  0/12 looked promising but is statistically unremarkable at an 8% rate, and a
  25-run measurement with the cap in place still produced 2 failures. It was not
  demonstrated to help, so it was not kept.
- *Per-worker databases* — **tried and reverted (2026-07-27).** `globalSetup`
  created one migrated database per jest worker (via a TEMPLATE copy) and a
  `setupFiles` hook pointed each worker's `DATABASE_URL` at its own, with **no**
  production change. The reasoning was sound — workers share no memory and no
  environment, so Postgres was the last shared mutable resource, which is why
  `--runInBand` is green. It did not work: a **clean 30-run measurement produced
  2 failures (6.7%)**, statistically indistinguishable from the ~8% baseline.
  Reverted under the same standard applied to the worker cap. This is the most
  valuable entry in this list: it rules out *cross-worker database interference*
  as the cause, which was the leading hypothesis, and points the next
  investigation at something **within** a worker.

  *Measurement hygiene note, learned the hard way:* two earlier measurements of
  this change were run concurrently (~26 jest workers against one Postgres) and
  produced misleading numbers — including an apparent regression that was pure
  contention. Measure one thing at a time on a quiet machine.

**Best remaining hypotheses (after per-worker databases were ruled out).** Since
database isolation did not help, the cause is very likely **inside** a worker
rather than between workers:

1. *Fixture preconditions that are never asserted.* The one failure whose
   mechanism was fully traced was a helper reading `res.headers['set-cookie'][0]`
   after a login that had failed — surfacing as a `TypeError` rather than naming
   the real problem. FEAT-010's specs now assert `201`/`200` on their fixtures;
   **the auth specs' own helpers still do not**, and several observed failures
   (`sign-in` AC-3, `change-password` AC-1/AC-3/AC-4) sit exactly there. Adding
   those assertions would not fix the flake but would make the next failure say
   what actually went wrong, which is the current blocker.
2. *Wall-clock coupling.* The rate-limit window is a 15-minute fixed window
   (`floor(now / 900000)`); several specs assume the whole test runs inside one
   window, and `auth_rate_buckets` rows persist across runs within it.
3. *Session-rotation ordering* in change-password specs, where a successful
   change revokes prior sessions and a later assertion reuses a stale cookie.

Recommended next step: land (1) across the auth specs first — cheap, no
behavior change, and it converts the remaining flakes from mysteries into
readable failures.

**Impact and workaround.** The gate is trustworthy when run serially
(`npm test -w @todo/api -- --runInBand`, ~9 s vs ~4 s). Feature verification
should use serial execution until this is fixed, and the report should say so.
