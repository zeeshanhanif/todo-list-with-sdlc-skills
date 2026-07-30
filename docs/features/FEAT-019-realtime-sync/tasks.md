# Tasks: FEAT-019 — Realtime cross-device sync

> Executes: docs/features/FEAT-019-realtime-sync/technical-design.md
> Status: **all tasks done — developer-done** · Last updated: 2026-07-29
> **AC-1b is OPEN**, as the design said it would be: the Realtime socket
> transport needs a provisioned Supabase project. `staging-checklist.md` is
> written and unrun. Everything else is demonstrated (map below). Do not read
> AC-1 as covering AC-1b — AC-1 drives the client from the provider's signal
> entry point; the transport underneath it is what remains unproven.
> Notes: **No migration** (design §4) — this feature stores nothing. The one piece
> of SQL it delivers (`deploy/supabase/realtime-authorization.sql`, T8) must **not**
> go into `migrations/`: that chain runs against the local docker Postgres, which
> has no `realtime` schema, and must stay plain-Postgres portable (D9). If you find
> yourself writing a migration, stop and re-read D9.
> **The five design subtleties to hold onto:** (1) The default configuration is
> `REALTIME_PROVIDER=none` and **must keep working** — no Supabase project exists
> (§8), so the fallback path in T6 is what makes NFR-PERF-004 hold today, not a
> nicety (D4). (2) The publish is **awaited with a 250 ms cap and a breaker**, never
> fire-and-forget — Cloud Run may throttle CPU after the response, which is how a
> signal silently stops arriving in production while working locally (D3). (3) The
> signal is emitted by a **controller-level interceptor**, not by ten service calls,
> so FEAT-014/008/016 inherit it without remembering (D8). (4) The broadcast payload
> is `{ cursor }` and **nothing else** — no id, no title, no change type (§3.2,
> AC-7). (5) Signals are **coalesced, never dropped**: a duplicate refresh costs a
> refetch, a dropped one leaves a stale screen (D6).
> **AC-1b is not satisfiable in this repo today.** The socket transport needs a
> provisioned Supabase project. T8 writes the staging checklist; do **not** fake it,
> stub it into a pass, or quietly widen another criterion to cover it — an open
> AC-1b is the honest outcome (design §8) and acceptance verification is told to
> expect it.
> **The web unit runner now exists — use it.** Stood up 2026-07-29 as foundations
> work *before* this slice (user decision), which resolves design §8's
> recommendation: **Jest 30 + `next/jest` + Testing Library + jsdom** in
> `apps/web`, specs beside the code as `src/**/*.spec.ts[x]`, wired into the root
> `npm test` (see `docs/scaffold-notes.md` § Deviations). So `lib/sync-schedule.ts`
> and the client island's non-DOM logic are **unit-tested, not deferred to
> Playwright** — AC-2's back-off half in particular. Limit to respect: async Server
> Components are not unit-testable (Next's own guidance); E2E still owns those.
> Behavioral API tasks follow the established Jest + supertest patterns
> (`modules/tasks/task-item.controller.spec.ts` is the closest model for T4/T5;
> `common/audit/audit.service.spec.ts` for T3's swallow-and-log contract).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression.
> **Known harness trap (FEAT-009 acceptance, minor 2):** the E2E webServer sets no
> `AUTH_RATELIMIT_MAX`, so repeated local runs exhaust the per-IP register limiter
> and fail the *whole* suite with an unrelated-looking error. T7 registers **two**
> users per run, which brings that closer — if it fires, clear `auth_rate_buckets`
> for `::1`; do not "fix" it by weakening a test.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [x] T1 — Shared contracts (`@todo/shared`, design §3): a FEAT-019 block with
      `REALTIME_TOKEN_PATH` (`/realtime/token`), the discriminated
      `RealtimeTokenResponse` (`{ enabled: false }` | `{ enabled: true, url,
      publishableKey, token, channel, expiresAt }`), and `userChannel(userId)`
      (`user:${userId}`) so the API and the client cannot drift on the topic
      string. **No existing exported shape changes.**
      Done when: `npm run build:shared` succeeds and api + web typecheck against
      the new symbols with no change to any existing export.

- [x] T2 — API config + token minting (design §5; AC-5, AC-8): `infra/config.ts`
      gains `realtimeProvider` (default `none`), `supabaseUrl`,
      `supabaseServiceRoleKey`, `supabasePublishableKey`, `supabaseJwtSecret`,
      `realtimeTokenTtlMinutes` (30), `realtimePublishTimeoutMs` (250), each with
      a safe local default and no committed secret; `common/realtime/realtime-token.service.ts`
      mints HS256 with `node:crypto` (`createHmac`, base64url) — claims
      `{ sub, role: "authenticated", iat, exp }` — and exposes a `verify` helper
      for tests. **No JWT dependency** (D5).
      Done when: unit tests show the token verifies under the configured secret
      and fails under a wrong one; `sub` is the passed user id and nothing else can
      set it; `exp - iat` equals the configured TTL and `expiresAt` agrees with
      `exp`; the header/payload are base64url with no padding; and with
      `REALTIME_PROVIDER=none` the signing secret is **never read** (assert on a
      config object whose secret getter throws if touched, or equivalent).

- [x] T3 — The publisher: port + both adapters + breaker (design §5; AC-4, AC-7,
      AC-11). `realtime.publisher.ts` (interface + `ChangeSignal`),
      `noop-realtime.publisher.ts` (the default — returns immediately),
      `supabase-realtime.publisher.ts` (one `fetch` to
      `POST {url}/realtime/v1/api/broadcast`, `apikey` header, single-element
      `messages` array with `topic`/`event: "changed"`/`payload: { cursor }`/
      `private: true`, `AbortSignal.timeout(...)`, 3-consecutive-failure breaker
      with a 30 s open window and one probe), and the factory binding provider →
      adapter. **Re-check the endpoint and header shape against Supabase's current
      docs before writing it** (design §8 — an external party owns this contract).
      Never throws (the `AuditService` contract, §2).
      Done when: against a local stub HTTP server, tests assert the **exact
      serialized body** carries only topic/event/`{cursor}`/private and no id,
      title or change type (AC-7); a `500`, a connection refusal and a hang past
      the timeout each resolve without throwing and within the cap (AC-4); the
      breaker opens after 3 consecutive failures, skips publishes for 30 s, then
      probes once (AC-4); failures and breaker transitions emit exactly one
      structured JSON line each, carrying no secret and no payload, while a healthy
      publish logs nothing (AC-11); and the noop adapter performs no I/O at all.

- [x] T4 — `ChangeSignalInterceptor` + wiring (design §5/D8; AC-3, AC-12):
      publish `req.user.id` on a non-`GET` request that completes without
      throwing, awaited before the response is released; class-level
      `@UseInterceptors` on `ListsController`, `TasksController` and
      `TaskItemController`; `RealtimeModule` imported by `ListsModule` and
      `TasksModule`. **No service, repository or handler changes.**
      Done when: with a fake publisher, each of the **ten** mutating routes
      publishes exactly one signal to `user:{session user id}` after success, and
      `400` / `401` / `404` / every `GET` publish **none** (AC-3, asserted route by
      route); a publisher that rejects or hangs leaves every write's status and
      body unchanged (AC-4 at the controller surface); `npm run boundaries` is
      clean; and the full FEAT-009..013 api suite passes unmodified (AC-12).

- [x] T5 — Contract: `GET /realtime/token` on `RealtimeController`
      (`common/realtime`, design §3.1) behind `SessionGuard`, taking **no
      parameter of any kind**.
      Done when: supertest tests pass for AC-5 (configured → `200 { enabled: true,
      … }` with the claims/TTL/channel assertions from T2 and `channel ===
      "user:" + sub`; unconfigured → `200 { enabled: false }` with **no `token`
      key present**; no/expired/revoked cookie → `401 unauthenticated`
      byte-identical to the other guarded routes'), AC-6 (with user B's session the
      channel is B's, and no request shape — query, body, header — makes it mint
      A's; the minted token presented as a bearer token **and** as a `sid` cookie is
      rejected `401` by a data endpoint), and AC-8 (neither secret appears in any
      response body or log line).

- [x] T6 — Web: the sync island (design §5; AC-1, AC-2, AC-9, AC-10).
      `app/api/realtime/token/route.ts` (BFF proxy — cookie forwarded, status +
      JSON relayed verbatim); `lib/sync-schedule.ts` **pure** (`{ connected,
      visible, msSinceActivity }` → `null` when connected or hidden, 4 s while
      visible and active, 30 s after 2 min idle); `lib/realtime-client.ts` (the
      only Supabase-coupled file: `@supabase/supabase-js` added to
      `apps/web/package.json`, `setAuth` + `channel(..., { config: { private: true } })`
      + `on('broadcast', { event: 'changed' })`, re-mint at 80% of TTL, backoff on
      `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, behind a factory so it can be faked);
      `components/sync-provider.tsx` (renders nothing — 250 ms coalescing,
      `router.refresh()`, immediate refresh on `visibilitychange`/`focus`/`online`,
      activity tracking, fallback timer, and the `NEXT_PUBLIC_SYNC_TEST_HOOK`-gated
      `window.__todoSync.signal()` seam, absent from production builds); mounted
      **once** in `components/shell-frame.tsx`.
      Done when: with `{ enabled: false }` no socket is opened and the fallback
      alone runs (AC-2); the scheduler's four cases are asserted directly (4 s
      active / 30 s idle / `null` hidden / `null` connected — AC-2); a signal while
      typing in the quick-add leaves the input text and focus untouched, one with
      the delete-confirm or list dialog open leaves it open with its state, and two
      signals inside 250 ms cause **one** refresh (AC-9); and nothing mounts,
      mints or polls on `/signin`, `/signup`, `/verify` or `/reset-password`
      (AC-10). Screens are ui-design's manifest; this feature adds no visual
      surface (D7) — if you find yourself adding an indicator, stop and re-read D7.
      **Completed in two steps (2026-07-29), recorded because the box did not
      flip with its commit:** the code and its unit-level done-when landed first
      (23 web tests: the four schedule cases, coalescing, no socket when
      disabled, resume-on-drop, close-on-unmount, silent fallback on a failed
      token fetch), and the box stayed unchecked until **T7** demonstrated the
      rest — AC-9's preservation items (typing, open dialog) and AC-10's route
      scope are only observable in the real app, since jsdom's `router.refresh()`
      is a mock and cannot prove what a real refresh preserves.

- [x] T7 — E2E: two signed-in browser contexts as two devices
      (`e2e/tests/realtime-sync.spec.ts`; AC-1, AC-2). Separate storage state per
      context, same account. Pass 1 (signal path, via the T6 test seam): a task
      created / completed / deleted and a list renamed in context A appear in
      context B **within 5 s with no user action and no full navigation**, sidebar
      counts included (AC-1). Pass 2 (fallback, `REALTIME_PROVIDER=none`): the same
      convergence within 5 s while B is visible and active, and **immediately**
      (< 1 s) when B is focused after being blurred and on the `online` event
      (AC-2). [UC-009/010/011 sync aspect]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB up)
      with the FEAT-009..013 specs still green. Two registrations per run push the
      per-IP limiter — see the harness trap above.

- [x] T8 — Provisioning artifacts and the AC-1b checklist (design §4/§8/D9):
      `deploy/supabase/realtime-authorization.sql` (the topic-scoped RLS policy on
      `realtime.messages`, with a header comment stating it is applied by hand
      against a provisioned project and why it is not a migration); the four new
      env values documented wherever the repo already documents env
      (`deploy/cloudrun-api.yaml`'s env block, `deploy/README.md`, and
      `.env.example` if the repo carries one) with **no secret values committed**;
      and `docs/features/FEAT-019-realtime-sync/staging-checklist.md` — the
      ordered steps to verify **AC-1b** against a real project (mint a token, open
      the socket, observe `changed`, attempt user A's token against user B's
      channel and be refused, measure end-to-end latency), with a result line to
      fill in.
      Done when: the SQL and the checklist exist and are self-contained enough to
      execute cold, the env documentation lists every new variable with its default
      and whether it is a secret, and `git grep` finds no committed key.

- [x] T9 — Verify: acceptance criteria **AC-1..AC-12** (design §6) demonstrably
      pass, with **AC-1b recorded as open** unless a Supabase project was
      provisioned and the T8 checklist was actually run — in which case record its
      result. Confirm: `migrations/` is unchanged and `npm run db:migrate` is a
      no-op at head; with `REALTIME_PROVIDER` unset the system behaves exactly as
      before this feature plus the fallback refresh (AC-12); no existing exported
      contract changed shape; the API gained no dependency and `@supabase/supabase-js`
      appears only in `apps/web` (D10); `npm run boundaries`, `npm run lint`,
      `npm run build`, and the api + shared + web + e2e suites green — the api
      suite **serially** while DEF-002 is open, with any parallel failure
      re-checked serially before it is attributed to this feature.
      Done when: the full feature suite passes, the checklist above is satisfied,
      and AC-1b's status is written down rather than assumed.

## Verification record (T9, 2026-07-29)

Run at head with `REALTIME_PROVIDER` unset — the shipped default — so every
number below is the configuration users actually get.

| AC | Demonstrated by | Result |
| :- | :--- | :--- |
| AC-1 (signal → converge < 5 s) | `e2e/tests/realtime-sync.spec.ts` "AC-1", two contexts | pass |
| **AC-1b (socket transport)** | `staging-checklist.md` — needs a Supabase project | **OPEN, not run** |
| AC-2 (fallback converges; focus/online immediate; back-off) | e2e "AC-2" (real stack, no socket) + `sync-schedule.spec.ts` + `sync-provider.spec.tsx` | pass |
| AC-3 (ten routes signal once; failures/reads none) | `change-signal.interceptor.spec.ts`, route by route | pass |
| AC-4 (write untouched by 500 / refusal / hang; breaker; latency) | `supabase-realtime.publisher.spec.ts` + interceptor spec | pass |
| AC-5 (token claims, TTL, `{enabled:false}`, 401) | `realtime.controller.spec.ts`, `realtime-token.service.spec.ts` | pass |
| AC-6 (no request shape mints another channel; token is no API credential) | `realtime.controller.spec.ts` | pass |
| AC-7 (content-free body) | `supabase-realtime.publisher.spec.ts` — whole body asserted | pass |
| AC-8 (secret hygiene) | controller + publisher specs; `git grep` for committed keys | pass |
| AC-9 (typing, open dialog, coalescing) | e2e "AC-9" + `sync-provider.spec.tsx` | pass |
| AC-10 (authenticated zone only) | e2e "AC-10" + unmount test | pass |
| AC-11 (structured logs, silent on success) | `supabase-realtime.publisher.spec.ts` | pass |
| AC-12 (no regression) | api 240 (serial), worker 20, web 23, e2e 28; boundaries, lint, build clean | pass |

Also confirmed: `migrations/` untouched and `db:migrate` a no-op at head; no
existing exported contract changed shape; the API and worker gained **no**
dependency and `@supabase/supabase-js` appears only in `apps/web`.

One transient: during T5 a single unidentified api test failed once and did not
reproduce across four subsequent serial runs. Consistent with DEF-002's known
residual flakiness but **not confirmed** as such — recorded rather than
attributed.
