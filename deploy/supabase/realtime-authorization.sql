-- Realtime channel authorization for cross-device sync (FEAT-019, ADR-006).
--
-- APPLIED BY HAND against a provisioned Supabase project — NOT by node-pg-migrate.
-- `migrations/` runs against the local docker Postgres on every dev, CI and E2E
-- run and must stay plain-Postgres portable (C-6); there is no `realtime` schema
-- there, so this statement would fail every migration run. Putting it under
-- deploy/ keeps the portable chain portable and this provider-specific step
-- visible instead of hidden behind an `IF EXISTS` that silently does nothing.
-- (FEAT-019 technical-design D9.)
--
-- Run once per Supabase project (dev / staging / prod), e.g. in the SQL editor
-- or via psql against the project's connection string. Idempotent: re-running
-- drops and recreates the policy.
--
-- WHAT IT DOES
-- The web client subscribes to the PRIVATE channel `user:{id}` with a token our
-- API mints (HS256 over the project JWT secret, `sub` = our user id, `role` =
-- authenticated). Supabase authorizes a private subscription by running RLS on
-- `realtime.messages`; this policy says a subscriber may only read the topic
-- that matches their own `sub`. Without it, private subscriptions are REFUSED —
-- the safe failure direction, and why AC-1b is the criterion that proves this
-- file was applied.
--
-- Defense in depth, not the only defense: the signal is content-free by design
-- (a cursor and nothing else), so even a mis-scoped channel leaks no task data.
-- What this policy protects is activity TIMING — when a given account is
-- writing — which is worth protecting on its own.
--
-- NOTE ON OUR DATA: this is RLS on Supabase's own `realtime` schema only. It
-- does NOT put RLS on `users`, `lists` or `tasks` — ownership stays enforced in
-- the NestJS API, which remains the sole data path (ADR-005, ADR-006).

drop policy if exists "own user channel only" on realtime.messages;

create policy "own user channel only"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) =
    'user:' || ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  and realtime.messages.extension in ('broadcast')
);
