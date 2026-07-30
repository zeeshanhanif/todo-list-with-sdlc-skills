# FEAT-019 — AC-1b staging checklist (the Realtime transport)

> Closes: **AC-1b** (technical-design §6) — the one acceptance criterion that
> cannot be verified in this repo, because it needs a provisioned Supabase
> project. Everything else in FEAT-019 is verified locally: the fallback path
> (AC-2) in the shipped configuration, the publisher and its breaker (AC-3/4/7),
> the token endpoint (AC-5/6/8), and the client's signal→refresh path through
> the test seam (AC-1).
> Status: **NOT RUN** · Result: _(fill in below)_
> Written: 2026-07-29

## Why this exists as a checklist rather than a test

Three things can only be observed against real Supabase infrastructure: that it
accepts a JWT **we** minted (rather than one Supabase Auth issued), that the RLS
policy in `deploy/supabase/realtime-authorization.sql` actually scopes a topic to
its owner, and that delivery is sub-second. Stubbing any of them would test our
stub. So this is a short manual run with a recorded result — and until it is run,
AC-1b stays open and should be reported open (design §8).

## Preconditions

1. A Supabase project exists for the environment under test.
2. `deploy/supabase/realtime-authorization.sql` has been applied to it **once**.
3. The API is running with:
   `REALTIME_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
4. Two browsers (or one browser and one private window) signed into the **same**
   account, both on the same list view.

## Steps

| # | Step | Expected | Result |
| :- | :--- | :------- | :----- |
| 1 | `GET /api/realtime/token` in the browser, signed in | `200 { enabled: true, url, publishableKey, token, channel: "user:<your id>", expiresAt }` | |
| 2 | Paste the token into jwt.io (or `RealtimeTokenService.verify`) | `sub` = your user id, `role` = `authenticated`, `exp - iat` = the configured TTL | |
| 3 | On device B, open devtools → Network → WS | A WebSocket to `<SUPABASE_URL>/realtime/v1/websocket` reaches **open**, and the channel `user:<id>` reports `SUBSCRIBED` (not `CHANNEL_ERROR`) | |
| 4 | **The transport, timed.** On device A add a task; watch device B | The row appears on B **within 5 s** (expect well under 1 s) with no interaction and no navigation. Record the observed latency | |
| 5 | Repeat step 4 for a completion, a delete, and a list rename | Each converges on B; sidebar counts follow | |
| 6 | **The policy.** Mint a token as user A (step 1 in one account), then in a devtools console on a *second* account's page, subscribe to `user:<A's id>` using A's token | Subscription is **refused** (`CHANNEL_ERROR`). If it succeeds, the policy in step 2 of the preconditions was not applied — stop and apply it | |
| 7 | Kill the socket (devtools → offline, or block the WS host) for ~10 s, then restore | B keeps converging while offline-ish via the fallback (4 s while active), and the socket re-subscribes on restore. No error is shown to the user — sync failure is silent by design (ui-design D1) | |
| 8 | Watch the API logs during steps 4–7 | Nothing per successful publish; on the induced failure in step 7, at most one structured `realtime publish failed` line per attempt and one `realtime breaker open` after three (AC-11) | |
| 9 | Leave a tab open past the token TTL (default 30 min) | The socket stays subscribed — the client re-minted at 80% of the lifetime rather than being dropped (D5) | |

## Result

- **Date run:**
- **Environment / project ref:**
- **Observed latency (step 4):**
- **Step 6 (cross-account subscription refused):**
- **Verdict:** AC-1b passed / failed / partially — with notes:

## If a step fails

- **Steps 3 or 6** → the authorization policy or the JWT secret is wrong. The
  secret must be the *project's* JWT secret; the policy must exist on
  `realtime.messages`. This is configuration, not a code defect.
- **Step 4 slow (> 5 s)** → check whether the socket is actually connected
  (step 3). If it is, the signal is arriving but the refetch is slow — that is a
  NFR-PERF-001 question about the read path, not about this feature.
- **Step 9** → the re-mint timer; `tokenRefreshDelay` in
  `apps/web/src/lib/sync-schedule.ts` is unit-tested, so suspect the token's
  `expiresAt` or a tab that was hidden (timers throttle in background tabs —
  acceptable: the socket re-subscribes on visibility).
- Anything that looks like a **code** defect rather than configuration → it is a
  defect on a verified feature: `docs/defects.md`, the maintenance route.
