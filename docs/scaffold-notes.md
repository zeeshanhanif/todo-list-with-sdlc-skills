# Scaffold Notes — To-Do List Application

> The project's own record of how the walking skeleton was scaffolded.
> Written as work proceeds. Consumers: future coding sessions, the build phases.
> Last updated: 2026-07-20

## Scaffold plan (confirmed)

- **Repo shape:** monorepo, in-place in this folder, **npm workspaces** (user
  choice — simplicity driver, zero extra tooling; no pnpm/Turborepo). Layout:
  `apps/*` (deployable units) + `packages/*` (shared).
- **Units** (each traces to an architecture container, arch §5):
  - `apps/web` — Next.js + TypeScript (ADR-002). UI surface → token wiring.
  - `apps/api` — NestJS + TypeScript modular monolith (ADR-001/002).
  - `apps/worker` — NestJS standalone app / Cloud Run Job (ADR-007).
  - `packages/shared` — shared TypeScript types/contracts (ADR-002).
- **Store:** standard Postgres (ADR-003, C-6) — local via docker-compose.
  Supabase Realtime is stubbed at skeleton stage (ADR-006).
- **Skeleton path** (plan §2): web shell → `GET /healthz` (api) → domain stub →
  `SELECT 1` (Postgres) → back.
- **Stubbed** (plan §2): auth, all domain logic, email delivery, Realtime.
- **CI:** GitHub Actions (lint + test + build). **Deploy:** Dockerfiles + Cloud
  Run config, written not executed (ADR-004).

## Environment preflight (2026-07-20)

| Tool | Version | Notes |
| :--- | :------ | :---- |
| node | v22.18.0 | OK (Next 16 / Nest 11 need ≥ 20) |
| npm | 10.9.3 | workspace manager |
| corepack | 0.33.0 | present (pnpm was available but not chosen) |
| npx | 10.9.3 | |
| git | 2.50.1 | |
| docker | 28.3.0 | installed |
| docker compose | v2.38.1 | installed |
| **docker daemon** | — | **DOWN at preflight — must be started (Docker Desktop) before the skeleton test can run against local Postgres** |

## Generators (verified live against `--help`, 2026-07-20)

| Unit | Generator | Version | Flags / basis |
| :--- | :-------- | :------ | :------------ |
| apps/web | `create-next-app` | 16.2.10 | `--ts --app --src-dir --tailwind --eslint --use-npm --skip-install --disable-git --import-alias "@/*" --yes` — TS/App Router/Tailwind are design-system aligned (shadcn/ui); skip-install + disable-git because deps install once at monorepo root and git is the root repo. |
| apps/api | `@nestjs/cli new` | 11.0.24 | `new api --directory apps/api --skip-git --skip-install --package-manager npm --strict` — strict TS per maintainability goal. |
| apps/worker | manual (no dedicated generator) | — | Minimal NestJS **standalone application** (`NestFactory.createApplicationContext`) — documented NestJS convention for a non-HTTP batch entrypoint (Cloud Run Job). Lighter than a full HTTP scaffold; shares `packages/shared`. |
| packages/shared | manual | — | Plain TS library (tsc), documented workspace convention. |

Testing frameworks — **architecture named none** (no explicit cross-cutting
Testing entry with framework choices). Fallback per skeleton-guide: **Jest**
(Nest default) for api/worker unit tests, **Playwright** for the `e2e/`
workspace. *Flagged as a candidate architecture amendment: the architecture
should name the unit runner and E2E framework.*

## Deviations & decisions

- **Next 16 uses Turbopack for `next build`.** It treated `apps/web` as its root
  and could not resolve the hoisted workspace package `@todo/shared` (in the
  root `node_modules`). Fix: set `turbopack.root` (and `outputFileTracingRoot`)
  to the monorepo root in `apps/web/next.config.ts`. Also enriched
  `@todo/shared` `exports` with `import`/`require` conditions. `transpilePackages`
  was tried and removed — unnecessary once the root was set (the package ships
  compiled `dist`). Node resolution always worked; this was Turbopack-specific.
- **`@todo/shared` ships compiled `dist` (CommonJS + d.ts).** api/worker (tsc/
  nest) and web (Turbopack) all consume the built output, so `build:shared` runs
  before the app builds (encoded in the root `build` script and CI).
- **Web fonts:** dropped create-next-app's `next/font/google` (Geist) in
  `layout.tsx` — the design system uses Inter via the token font stack, and
  removing the Google Fonts fetch keeps the build network-free/offline-safe.

## Boilerplate removed

- `apps/api/src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`
  (Nest demo controller) — replaced by the `health` module.
- `apps/web/src/app/page.tsx` demo content and `globals.css` demo variables —
  replaced by the app-shell + health card consuming design tokens.
- Kept (neutral/useful): `apps/web/AGENTS.md` (+ its `CLAUDE.md` pointer) — Next
  16 agent guidance; the root `CLAUDE.md` is the authoritative project index.
  Unused `apps/web/public/*.svg` demo assets left in place (harmless).

## Verification results (2026-07-20 — empirical, run on this machine)

| Check | Result |
| :---- | :----- |
| Clean install (`npm install`) | ✅ exit 0; workspace symlinks + `package-lock.json` created |
| Build all (`npm run build`) | ✅ shared + tokens + api + worker + web all compile |
| Unit tests (`npm test`) | ✅ api 2/2, worker 1/1 (Jest) |
| Module boundaries (`npm run boundaries`) | ✅ clean; **proven**: a probe `worker→web` import → depcruise exit 1; removed → exit 0 |
| Design tokens wired | ✅ 90 root + 34 dark CSS vars generated from tokens.json; shell renders them; `.generated.css` is gitignored + rebuilt on predev/prebuild (delete tokens.json → prebuild fails → shell breaks) |
| DB migration | ✅ migration 001 created `skeleton_ping`; mechanism (`pgmigrations`) initialized |
| **E2E skeleton test** (`npm run test -w @todo/e2e`) | ✅ **1 passed** — web shell → API `/healthz` → Postgres write+read → back; DB shows ping rows written |
| Dockerfiles | ✅ `docker build --check` clean for api/web/worker (not built) |
| docker-compose | ✅ `docker compose config` valid |
| Secrets | ✅ `.env` gitignored & untracked; no committed secrets |
| CLAUDE.md paths | ✅ all referenced docs resolve |

**Done-when (plan §2), local half: MET.** A request flows end-to-end in a running
local environment and the token-styled shell renders it.
**Pending first deploy:** the deployed half of done-when, the first CI run (GitHub
Actions config written, not yet pushed), and Cloud Run / Supabase provisioning.
GitHub Actions and Cloud Run YAML were validated by inspection (no local
GH-Actions/gcloud validator available); `docker-compose.yml` validated by
`docker compose config`.

## Run commands (README truth)

```
npm install                         # once, at repo root
npm run db:up && npm run db:migrate  # local Postgres (Docker) + schema
npm run dev:api                      # API  → http://localhost:3001
npm run dev:web                      # web  → http://localhost:3000
npm run build                        # build all units
npm test                             # unit tests (api, worker)
npm run boundaries                   # module-boundary enforcement
npm run test:e2e                     # Playwright end-to-end (Docker + DB up)
```

Note: a local `.env` (copied from `.env.example`) is required for `db:migrate`
and the API; it is gitignored. Postgres image `postgres:16-alpine` is pulled on
first `db:up`.
