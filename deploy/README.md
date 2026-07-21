# Deployment config (written, not executed)

Target: **Google Cloud Run** (ADR-004), one service per deployable unit plus a
Cloud Run **Job** for the worker, against **Supabase** Postgres + Realtime
(external, ADR-003/006). Environments dev/staging/prod share images, differ by
config/secrets, each with its own Supabase project (architecture §7).

**Nothing here is applied.** First deploy is the user's step — provisioning
(GCP project, Cloud Run services, Cloud Scheduler, Secret Manager entries,
Supabase projects) happens then. These files are the skeleton of that config.

| File | Unit | Notes |
| :--- | :--- | :---- |
| `cloudrun-web.yaml` | web | Knative Service; image + PORT 3000; `API_URL` from config |
| `cloudrun-api.yaml` | api | Knative Service; image + PORT 3001; `DATABASE_URL` from Secret Manager |
| `cloudrun-worker-job.yaml` | worker | Cloud Run **Job**; triggered by Cloud Scheduler (~1 min) |

Secrets (`DATABASE_URL`, `EMAIL_API_KEY`, `SUPABASE_JWT_SECRET`) are referenced
by name and resolved from **Secret Manager** at deploy time — never committed
(NFR-MAINT-003). Image URIs are placeholders (`REGION-docker.pkg.dev/PROJECT/...`)
to be filled by the deploy pipeline.
