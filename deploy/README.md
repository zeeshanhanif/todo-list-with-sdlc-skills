# Deployment config (written, not executed)

Target: **Google Cloud Run** (ADR-004), one service per deployable unit plus a
Cloud Run **Job** for the worker, against **Supabase** Postgres + Realtime
(external, ADR-003/006). Environments dev/staging/prod share images, differ by
config/secrets, each with its own Supabase project (architecture §7).

**Nothing here is applied.** First deploy is the user's step — provisioning
(GCP project, Cloud Run services, Cloud Scheduler, Supabase projects) happens
then. These files are the skeleton of that config.

| File | Unit | Notes |
| :--- | :--- | :---- |
| `cloudrun-web.yaml` | web | Knative Service; image + PORT 3000; `API_URL` from config |
| `cloudrun-api.yaml` | api | Knative Service; image + PORT 3001; `DATABASE_URL` as a Cloud Run env var |
| `cloudrun-worker-job.yaml` | worker | Cloud Run **Job**; triggered by Cloud Scheduler (~1 min) |
| `supabase/realtime-authorization.sql` | (Supabase) | RLS policy scoping each Realtime topic to its own user — **applied by hand**, per project (FEAT-019) |

## Cross-device sync (FEAT-019, ADR-006)

Sync ships **off**: `REALTIME_PROVIDER=none` publishes no signal and mints no
token, and the web client falls back to an adaptive refetch schedule that still
meets NFR-PERF-004 (4 s while a tab is active, 30 s idle, immediate on
focus/visibility/online). Nothing has to be provisioned for the product to sync.

To turn it on, per environment:

1. Create the Supabase project (it is already the Postgres host — architecture §7).
2. Apply `supabase/realtime-authorization.sql` to it **once**. Without it,
   private channel subscriptions are refused (the safe direction).
3. Set on the API service: `REALTIME_PROVIDER=supabase`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY` (public), and the two **secrets**
   `SUPABASE_SERVICE_ROLE_KEY` (broadcast auth) and `SUPABASE_JWT_SECRET`
   (token signing). The web tier needs **no** new config — it receives the URL,
   the publishable key and its short-lived token from `GET /realtime/token`.
4. Run `docs/features/FEAT-019-realtime-sync/staging-checklist.md` to close
   **AC-1b**, the one acceptance criterion that cannot be verified without a
   real project.

Secrets (`DATABASE_URL`, `EMAIL_API_KEY`, `SUPABASE_JWT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`) are set as
**Cloud Run environment variables** at deploy time (`--set-env-vars` or the
service config) — never committed to source (NFR-MAINT-003). Trade-off vs
Secret Manager: env-var values are visible to anyone with Cloud Run viewer
access, with no per-secret access control, rotation, or audit. This diverges
from `docs/architecture.md` §8 (which chose Secret Manager) — see
`docs/scaffold-notes.md`; the architecture doc should be amended to record it.
Image URIs are placeholders (`REGION-docker.pkg.dev/PROJECT/...`) filled by the
deploy pipeline.
