# Acceptance Report: FEAT-019 — Realtime cross-device sync

> Verdict: **Accepted, with AC-1b explicitly open** · Date: 2026-07-29
> AC-1b run attempted 2026-07-30 against a staging hybrid — **partial, still
> open**, deferred to first deploy by user decision. Verdict unchanged; see
> "AC-1b run log" at the end of this report and `staging-checklist.md`.
> Audited against: docs/features/FEAT-019-realtime-sync/technical-design.md §6
> (AC-1..AC-12 + AC-1b), docs/srs.md (NFR-PERF-004 and the binding NFRs),
> docs/use-cases.md (UC-009/010/011, sync aspect), ui-design.md and
> docs/design-manifest.json
> Suites re-run in this audit, not reported from the build: api **241**
> (serial), worker **20**, web **23**, e2e **30**; boundaries, lint, build clean.

## Verdict summary

FEAT-019 is **accepted**. Every criterion holds under observation, and the
feature is verified *in the configuration it actually ships in* —
`REALTIME_PROVIDER=none`, where the adaptive fallback carries NFR-PERF-004 with
no socket at all. Three measurement gaps were found in the implementation's own
coverage and **corrected by this audit** (`b9996fd`, test artifacts only); all
three passed once written, so none became rework.

**One criterion is open and stays open: AC-1b, the Realtime socket transport.**
That is not a defect and not an oversight — it is the design's own recorded
limit (§8), because the transport cannot be exercised without a provisioned
Supabase project. This report accepts the feature *with* that criterion
outstanding, and is explicit that **AC-1 does not cover it**: AC-1 drives the
client from the provider's signal entry point, which is everything downstream of
a delivered signal, never the delivery itself. `staging-checklist.md` closes it
in nine steps; until it is run, sync-over-Realtime is unproven and only
sync-over-fallback is verified.

The strongest evidence in the feature's favour is that its *degraded* path is
the tested one. A feature whose headline mechanism is unverifiable would
normally be a thin acceptance; here the fallback is not a stub but the shipped
behaviour, measured end to end in a real browser with two devices.

## Criteria

| AC | Source | Evidence (re-run in this audit) | Verdict |
| :- | :--- | :--- | :--- |
| AC-1 | NFR-PERF-004; UC-009/010/011 | `e2e/tests/realtime-sync.spec.ts` "AC-1" — two contexts, one account; a create and a completion cross inside 5 s with no interaction and no navigation (URL asserted unchanged) | pass |
| **AC-1b** | ADR-006 transport | **Partially run 2026-07-30** against a staging hybrid (see run log at the end): token acceptance, publish `202` and timed delivery all proven; private-channel authorization refused for every topic, cause isolated to an RLS predicate on the Supabase side | **open (deferred to first deploy)** |
| AC-2 | NFR-PERF-004, NFR-REL-004 | e2e "AC-2" on the **unconfigured** stack: convergence < 5 s with no socket, no seam, nothing clicked; focus converges < 2 s. Back-off asserted directly at the scheduler (`sync-schedule.spec.ts`) and through the island (`sync-provider.spec.tsx`) | pass |
| AC-3 | ADR-006; FR-AUTHZ-002 | `change-signal.interceptor.spec.ts` — all **ten** mutating routes enumerated, each exactly one signal to the session user; 400/401/404 and every GET signal none; a stranger's 404 signals nothing | pass |
| AC-4 | NFR-PERF-001, NFR-REL-004 | `supabase-realtime.publisher.spec.ts` — 500 / refused / hang all resolve without throwing and within the cap; breaker opens after 3 and probes after the window; **p95 measured** (corrected, below). Interceptor spec: a rejecting or slow publisher leaves status and body untouched | pass |
| AC-5 | FR-AUTHZ-001; NFR-MAINT-003 | `realtime.controller.spec.ts` + `realtime-token.service.spec.ts` — claims/TTL/`expiresAt`/channel agree; `{enabled:false}` with a secret present in env still mints nothing; 401 byte-identical; revoked session stops minting | pass |
| AC-6 | FR-AUTHZ-002/003 | `realtime.controller.spec.ts` — three shapes naming another user (two query forms, a header) all mint the caller's own channel; the token is rejected as both bearer and cookie against a data endpoint | pass |
| AC-7 | ADR-006 | `supabase-realtime.publisher.spec.ts` — the serialized body asserted **whole**: only `messages[0].{topic,event,payload.cursor}`, cursor an ISO instant. No id, title, or change type | pass |
| AC-8 | NFR-MAINT-003, NFR-SEC | Controller spec (no secret on the wire, publishable key present); publisher spec (no key in any log line); **and directly in this audit**: `grep` over the built `apps/web/.next` output finds neither secret name nor value | pass |
| AC-9 | NFR-USE-003; ui-design D2 | e2e "AC-9" ×3 — composer text **and caret** survive; delete-confirm dialog stays open; **list dialog** keeps its half-typed name and focus; **an optimistic checkbox mid-write is not rolled back** by a refresh. Coalescing (2+ signals → 1 refresh) in `sync-provider.spec.tsx`. The last two were added by this audit | pass |
| AC-10 | ADR-006 scope | e2e "AC-10" — no seam, no token request, no polling on `/signin`, `/signup`, `/reset-password`; unmount test asserts everything stops with the shell | pass |
| AC-11 | NFR-OBS-001, NFR-SCAL-001 | `supabase-realtime.publisher.spec.ts` — one structured line per failure carrying reason **and userId**, none on success, no secret and no payload in it. The userId/payload half was added by this audit | pass |
| AC-12 | regression | api 241 serial, worker 20, web 23, e2e 30, boundaries/lint/build clean; `migrations/` untouched; no exported contract changed shape; API and worker gained no dependency | pass |

## Corrections made by this audit

Three, all test artifacts, committed as `b9996fd`. Each passed as soon as it was
written, which is why the verdict is acceptance rather than rework — but each
was a real hole in the measurement, and two of them cover the failure modes a
reviewer would worry about most.

1. **AC-9 was half-covered.** The criterion names four clauses; the suite
   exercised two (composer, delete-confirm). Added: the **list dialog** — a
   different component with its own state, so covering one dialog does not cover
   the other — and **a refresh arriving mid-write over an optimistic control**,
   which nothing in the suite exercised. That second one is the sharpest failure
   mode in the feature: the checkbox is optimistic with rollback, so a refresh
   landing between click and server answer is exactly where a naive
   implementation snaps the box back to stale truth. It does not.
2. **AC-11's log contents were partly unasserted.** The test checked `msg` and
   `reason` but not that the line names *whose* signal was lost, nor that the
   payload stays out of it. Both now asserted.
3. **AC-4's measurement clause was never measured.** "p95 write latency stays
   inside 300 ms" had no number behind it. Added a 20-sample p95 against the
   stub server (**< 50 ms**, and the test says plainly that a loopback stub is
   not a production round trip — what it rules out is the publisher itself being
   expensive).

## Requirements verified directly

- **NFR-PERF-004 (Should) — met, with a margin worth stating.** In the shipped
  (unconfigured) configuration, worst-case convergence is one poll interval plus
  the coalesce window plus the refetch: **4 000 + 250 + read**. The read is
  FEAT-010 AC-8's already-measured bound (< 300 ms locally, asserted in
  `tasks.controller.spec.ts:314`), giving **≈ 4.55 s worst case against a 5 s
  requirement — roughly 450 ms of headroom.** Observed convergence in the E2E is
  comfortably inside that. This is fine and it is deliberate (4 s was chosen over
  5 s precisely to leave room), but it is thin enough to record: if the list read
  ever slows past ~750 ms, the fallback path breaches NFR-PERF-004 while the
  Realtime path would not notice. Environment caveat: local Docker Postgres,
  single user, 113 tasks.
- **FR-AUTHZ-001/002/003** — observed at the endpoint, not only in tests: no
  request shape mints another user's channel, and the minted token authenticates
  nothing against the API.
- **NFR-SCAL-003** — confirmed by inspection: the API holds no connection state;
  the socket is Supabase's. Nothing this feature adds makes the tier stateful.
- **Screens** — `SCR-WEB-007/008/010` manifest entries spot-checked: all three
  delta-spec locators resolve to real headings in `ui-design.md`; the "renders
  nothing" claim is verified by the unit test (`container` empty) and by the E2E
  finding no indicator; states arrays are unchanged, correctly — this feature
  adds no state, it makes two existing ones newly reachable.

## Anti-fake-green review

The feature's test diff was reviewed for weakened, skipped, deleted or
mocked-away behaviour. Findings: **none.** No `.skip`, no `.only`, no deleted
cases, no loosened assertion in a pre-existing spec. Two things were checked
specifically because they are where a shortcut would hide:

- **The `NEXT_PUBLIC_SYNC_TEST_HOOK` seam** is a legitimate test affordance, not
  a bypass: it exposes the provider's *own* signal entry point, so everything
  downstream of a delivered signal is the real code path. It is env-gated and
  absent from production builds (verified: `grep` over `.next` output). It is
  also honestly scoped — the design says in three places that it does not prove
  the transport, and AC-1b exists precisely because it does not.
- **Two production defects were fixed during the build rather than tested
  around** (a throwing publisher turning a committed 201 into a 500; a React
  purity violation). Both fixes are in production code with the tests that caught
  them intact.

## Findings that are not rework

- **DEF-002 pressure, and a new instance of the known harness trap.** The first
  full E2E run in this audit failed **23 of 30** specs — including
  long-green ones — because the per-IP register limiter was exhausted
  (`::1` at 53 hits against a limit of 30). Cleared `auth_rate_buckets` per the
  documented remedy and the suite went 30/30. FEAT-019 adds six specs that
  register **two** users each, so the harness now crosses the limit routinely
  rather than occasionally. This is the carried FEAT-009 acceptance minor
  (missing `AUTH_RATELIMIT_MAX` override in the E2E `webServer` env) becoming a
  practical blocker. **Recommended: set it in `e2e/playwright.config.ts` as a
  foundations item** — it is test-environment configuration, not a weakened
  assertion. Left unfixed here deliberately: prior features recorded it and chose
  clearing over changing config, and an auditor widening that scope would be the
  wrong precedent.
- **One unreproduced api failure during the build.** The implementation recorded
  a single unidentified failure during T5 that did not recur. It did not recur in
  this audit either (241 green, serial). Consistent with DEF-002; still
  unattributed, and correctly recorded as such rather than blamed.
- **DEF-006 remains open** and untouched by this feature, as it should be.

## Rework

**None.**

## Design defect

**None.** The criteria are faithful to NFR-PERF-004 and to ADR-006, including
the one that admits it cannot be met locally — AC-1b is a design that told the
truth about its own limits, which is the opposite of a defect.

## What "verified" means for this feature, precisely

Verified: the signal path from publisher to refreshed screen, the token and its
scoping, the interceptor's coverage of every write route, the failure and
degradation behaviour, and cross-device convergence **through the adaptive
fallback** — the configuration that ships today.

Not verified: that Supabase Realtime accepts our minted token, that the
topic-scoping policy refuses a stranger's subscription, and that delivery is
sub-second. Those are AC-1b, and they are the user's provisioning step followed
by a nine-step checklist. **This should be run before first deploy**, since
ADR-006 is a deploy-time dependency regardless.


## AC-1b run log — 2026-07-30 (verdict unchanged)

AC-1b was attempted after the user provisioned a Supabase project. It is **still
open**, and the verdict above is unchanged: FEAT-019 remains accepted with this
one criterion outstanding.

**What the attempt proved** (all new, all real, none of it previously verifiable):

- Supabase **accepts a JWT our API minted**, with no Supabase Auth involved —
  ADR-006's load-bearing assumption. Proven by contrast against invalid-token
  baselines, not by absence of an error.
- Our **publish path works against the real service**: the broadcast POST returns
  `202`, with the query-parameter form T3 corrected the design to.
- **Delivery works end to end and was timed** — 726 ms on a public topic, from a
  laptop to the project's region over the public internet.

**What it did not prove, and why:**

- **Private-channel authorization.** Subscriptions are refused for *every* topic,
  including the caller's own. Excluded as causes: the socket, the URL, the
  publishable key, the JWT and its secret, and the `realtime.messages`
  partitions. It is an RLS-predicate problem on the Supabase side — one line of
  configuration, no application code implicated.
- **Deployed latency.** 726 ms is the mechanism working, not a deployed number.

**A correction to this report's own reasoning.** The run initially read "B's
token is refused on A's topic" as proof the policy scoped correctly. It is not:
a policy that denies everything yields the identical observation. The legitimate
case failing the same way is what exposed it. Recorded because this report is
where a later reader would otherwise inherit the wrong inference.

**Topology caveat.** The attempt used local Postgres for data plus a separate
Supabase project as a message bus — valid for a content-free signal, but not
architecture §7's single-project topology. AC-1b should be closed at first
deploy, against the real thing.

**One defect filed, not FEAT-019's.** The run surfaced **DEF-007**: the API
resolves `.env` against the process CWD, so a workspace-script start silently
ignores the root `.env` and runs on defaults. Pre-existing since the walking
skeleton, affects every env-driven setting in `apps/api`/`apps/worker`, invisible
until now because the defaults were all deliberately safe and FEAT-019 is the
first feature whose behaviour visibly depends on an operator-set value. Local
development only — Cloud Run passes env vars directly. See `docs/defects.md`.
