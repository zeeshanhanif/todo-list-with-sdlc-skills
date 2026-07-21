# To-Do List Application — agent guide

Monorepo for a private, multi-user personal task manager. This file is an index;
follow the pointers.

## Pipeline documents (source of truth — read before building)
- Requirements: `docs/srs.md` · use cases: `docs/use-cases.md`
- Architecture (the *how*, ADRs): `docs/architecture.md`
- Implementation plan (build order, slices, first slice): `docs/implementation-plan.md`
- Traceability: `docs/rtm.md`
- **Design system (read for ALL UI work): `docs/design.md` + `docs/tokens.json`**
- UX structure & screens: `docs/ux-foundations.md`
- How this repo was scaffolded (generators, decisions, stubs): `docs/scaffold-notes.md`

## Layout (npm workspaces)
- `apps/web` — Next.js 16 web tier (ADR-002). UI shell + design tokens.
- `apps/api` — NestJS 11 modular monolith (ADR-001/002). Capability modules in
  `src/modules/*` (stubs until their slices); cross-cutting in `src/common/*`;
  DB/config in `src/infra/*`.
- `apps/worker` — NestJS standalone Cloud Run Job (ADR-007).
- `packages/shared` — shared TS contracts (`@todo/shared`).
- `e2e` — Playwright system suite (seeded by the skeleton test).
- `migrations` — node-pg-migrate. `docker-compose.yml` — local Postgres.
- `deploy/` — Cloud Run config (written, not applied).

## Design system wiring (do not bypass)
`docs/tokens.json` → `scripts/build-tokens.mjs` → `apps/web/src/styles/tokens.generated.css`
(runs on web predev/prebuild). Components consume `var(--color-*)`, `var(--space-*)`,
etc. **Never hand-copy token values** — edit `docs/tokens.json` and rebuild.
Component framework: shadcn/ui; icons: Lucide (per `docs/ux-foundations.md`).

## Module boundaries (enforced)
`npm run boundaries` (dependency-cruiser) fails the build on: cross-app imports,
cross-module imports inside the API monolith, `packages/shared` importing an app,
or circular deps. Respect the seams.

## Commands
- Install: `npm install` (once, at root)
- Local DB: `npm run db:up` then `npm run db:migrate`
- Dev: `npm run dev:api` and `npm run dev:web` (web on :3000, api on :3001)
- Unit tests: `npm test` · Boundaries: `npm run boundaries` · Lint: `npm run lint`
- Build everything: `npm run build`
- End-to-end (needs Docker + DB up): `npm run test:e2e`

## Status
Walking skeleton only — auth, all domain logic, email delivery, and Supabase
Realtime are **stubbed**. First slice to build: **FEAT-001 (registration)** — see
`docs/implementation-plan.md` §5. Per-slice work: detailed-design (contracts) +
ui-design (screens) then build.
