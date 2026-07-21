# To-Do List Application

A private, multi-user, web-based personal task manager. **This repo is currently
the walking skeleton** — the architecture wired end-to-end and proven to run
locally, ready for feature slices. It is deploy-*ready*; the first deploy is a
manual step.

Stack (from `docs/architecture.md`): Next.js web + NestJS API + NestJS worker
(TypeScript), Postgres (Supabase in cloud; docker-compose locally), Cloud Run.

## Prerequisites
- Node.js ≥ 20 (tested on 22), npm 10+
- Docker + Docker Compose (for local Postgres)

## Quick start
```bash
npm install                 # install all workspaces (once, at the root)
npm run db:up               # start local Postgres (Docker)
npm run db:migrate          # apply migrations
npm run dev:api             # API on http://localhost:3001  (in one terminal)
npm run dev:web             # web on http://localhost:3000  (in another)
```
Open http://localhost:3000 — the shell shows API + DB health end-to-end.

## Verify the skeleton
```bash
npm run build               # shared + tokens + all units build
npm test                    # unit tests (api, worker)
npm run boundaries          # module-boundary enforcement
npm run test:e2e            # Playwright end-to-end (Docker + DB must be up)
```

## Layout
`apps/web` · `apps/api` · `apps/worker` · `packages/shared` · `e2e` ·
`migrations` · `deploy` · `docs`. See `CLAUDE.md` and `docs/scaffold-notes.md`.

## What's stubbed
Auth, all domain logic, email delivery, and Supabase Realtime sync. Build order
and the first slice (registration) are in `docs/implementation-plan.md`.
