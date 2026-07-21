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

Secrets (`DATABASE_URL`, `EMAIL_API_KEY`, `SUPABASE_JWT_SECRET`) are set as
**Cloud Run environment variables** at deploy time (`--set-env-vars` or the
service config) — never committed to source (NFR-MAINT-003). Trade-off vs
Secret Manager: env-var values are visible to anyone with Cloud Run viewer
access, with no per-secret access control, rotation, or audit. This diverges
from `docs/architecture.md` §8 (which chose Secret Manager) — see
`docs/scaffold-notes.md`; the architecture doc should be amended to record it.
Image URIs are placeholders (`REGION-docker.pkg.dev/PROJECT/...`) filled by the
deploy pipeline.
