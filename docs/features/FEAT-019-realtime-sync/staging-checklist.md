# FEAT-019 — AC-1b staging checklist (the Realtime transport)

> Closes: **AC-1b** (technical-design §6) — the one acceptance criterion that
> cannot be verified in this repo, because it needs a provisioned Supabase
> project. Everything else in FEAT-019 is verified locally: the fallback path
> (AC-2) in the shipped configuration, the publisher and its breaker (AC-3/4/7),
> the token endpoint (AC-5/6/8), and the client's signal→refresh path through
> the test seam (AC-1).
> Status: **RUN PARTIALLY 2026-07-30 — AC-1b still OPEN, deferred to first deploy**
> (user decision). Four of the six things this checklist exists to prove are
> proven; the private-channel authorization and a region-representative latency
> are not. Details in Result, below.
> Written: 2026-07-29 · Run: 2026-07-30

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
2b. **Verify the policy actually landed** — do not assume it did. Applying it
   needs rights the SQL editor's default `postgres` role may not have on the
   `realtime` schema (`ERROR 42501: permission denied for schema realtime`); if
   so, wrap it in `set role supabase_admin;` … `reset role;`. Confirm with:

   ```sql
   select policyname, cmd, roles, qual from pg_policies
    where schemaname = 'realtime' and tablename = 'messages';
   ```

   **One row expected. Zero rows means RLS default-deny, and every private
   subscription will fail with `Unauthorized` — including the legitimate user's
   own topic.** Added 2026-07-30 after the first run of this checklist lost time
   to exactly that: a missing policy looks like a broken policy, and a
   first-connection `MissingPartition` error (partitions were in fact present)
   sent the diagnosis further astray. Check this before interpreting any
   `Unauthorized`.
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
| 6 | **The policy.** Mint tokens for two accounts, then subscribe to `user:<A's id>` using **B's** token | Subscription is **refused** — `CHANNEL_ERROR: Unauthorized: You do not have permissions to read from this Channel topic`. If it succeeds, the policy was not applied — stop and apply it. *(Corrected 2026-07-30: this step originally said to use **A's** token, which would legitimately succeed and proved nothing.)* | |
| 7 | Kill the socket (devtools → offline, or block the WS host) for ~10 s, then restore | B keeps converging while offline-ish via the fallback (4 s while active), and the socket re-subscribes on restore. No error is shown to the user — sync failure is silent by design (ui-design D1) | |
| 8 | Watch the API logs during steps 4–7 | Nothing per successful publish; on the induced failure in step 7, at most one structured `realtime publish failed` line per attempt and one `realtime breaker open` after three (AC-11) | |
| 9 | Leave a tab open past the token TTL (default 30 min) | The socket stays subscribed — the client re-minted at 80% of the lifetime rather than being dropped (D5) | |

## Result

### Run 1 — 2026-07-30 · partial · AC-1b remains open

**Topology caveat, and it matters more than any single step below.** This run was
NOT against the deployed topology. Architecture §7 puts our data *and* Realtime in
one Supabase project; this run used **local docker Postgres for all data** and a
**separate, empty Supabase project as a message bus only**. That is legitimate for
the transport question — the signal is content-free, so nothing needs our rows to
live in Supabase, and the policy compares a JWT *claim*, not a table row — but it
means the deployed configuration (one project, Supavisor pooler, in-region
latency) is still unexercised. A faithful run belongs at first deploy.

| # | Step | Result |
| :- | :--- | :--- |
| 1 | token endpoint | **PASS** — `enabled: true`, `channel: user:<caller's id>`, project URL returned |
| 2 | token claims | **PASS** — `sub` = the session user, `role: authenticated`, `exp - iat` = 1800 s |
| — | *(added)* platform accepts our HS256 token | **PASS** — proven by contrast: a garbage token and a valid-but-wrong-secret token both get `401 PGRST301 "JWT cryptographic operation failed" / "None of the keys was able to decode the JWT"`, while ours passes verification. This is the ADR-006 assumption that mattered most: Supabase accepts a JWT *we* minted, with no Supabase Auth involved |
| — | *(added)* our publish path | **PASS** — `POST /realtime/v1/api/broadcast?private=true` → **202** |
| — | *(added)* delivery end-to-end, timed | **PASS on a public topic — 726 ms** laptop→region over the public internet. Representative of the *mechanism*, **not** of deployed latency (a Cloud Run service in-region would be far faster; 726 ms would be alarming as a deployed number) |
| 3 | private channel subscribes | **FAIL** — `CHANNEL_ERROR`. First attempt returned `MissingPartition: Realtime was unable to find the expected messages partition`, which proved to be a **red herring** (the partitions for 07-28..08-01 exist). Every subsequent attempt: `Unauthorized: You do not have permissions to read from this Channel topic` |
| 4, 5 | delivery on the real `user:{id}` topic, timed | **NOT RUN** — gated by step 3 |
| 6 | cross-account subscription refused | **INCONCLUSIVE, and this is the correction that matters.** B's token on A's topic *is* refused — but so is **A's own token on A's own topic**. A policy that denies everything produces the same observation as a policy that scopes correctly, so this step proves nothing on its own until step 3 passes. The run initially recorded this as a PASS; that reading was wrong |
| 7, 8, 9 | degradation, logs, token re-mint | **NOT RUN** — gated by step 3 |

**Where step 3 was left.** The denial is an authorization-predicate problem, not a
transport, token, key or partition problem (each of those is independently
excluded above). Two candidate causes, both untested when the run stopped:
`current_setting('request.jwt.claims', true)` returning NULL in Realtime's
authorization context — `'user:' || NULL` is `NULL`, which denies universally and
matches the observation exactly — and `realtime.messages.extension in
('broadcast')` not matching the synthetic row Realtime evaluates the policy
against. The proposed next move was to re-create the policy using
`auth.jwt() ->> 'sub'` and without the `extension` clause, still topic-scoped.

Confusing signal worth carrying forward: `select … from pg_policies where
schemaname='realtime'` returned **zero rows**, while `create policy` on the same
table reported **"already exists"**. Trust the catalog (`pg_policy` joined to
`pg_class`) over the view, and resolve that contradiction before interpreting any
`Unauthorized`.

**Verdict: AC-1b remains OPEN**, deferred to first deploy by user decision —
where it will be run against the real topology instead of a hybrid. Nothing in
FEAT-019's *code* is implicated: the token, the publish, the delivery mechanism
and the fallback are all verified. What is unverified is one line of
Supabase-side RLS configuration, plus deployed-region latency.

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
