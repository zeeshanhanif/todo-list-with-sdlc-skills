# API capability modules (modular monolith — ADR-001)

Each capability area from the architecture (§5) becomes a NestJS module under
`src/modules/<area>/`. They are **stubs until their slices are built** — the
walking skeleton activates none of them (only `infra` + `health` are live).

Boundary rule (enforced by `npm run boundaries`, `.dependency-cruiser.cjs`):
a module must **not** import another module's internals. Cross-module needs go
through shared contracts (`@todo/shared`) or explicit domain interfaces added
per-slice.

| Module | FR area | Built by |
| :----- | :------ | :------- |
| `auth` | FR-AUTH-* | FEAT-001..006 |
| `profile` | FR-PROF-* | FEAT-008 |
| `lists` | FR-LIST-* | FEAT-009 |
| `tasks` | FR-TASK-* | FEAT-010..014 |
| `search` | FR-SRCH-* | FEAT-015, FEAT-016 |
| `account-data` | FR-DATA-* | FEAT-017, FEAT-018 |

Cross-cutting concerns live under `src/common/` (`authz` ownership guard →
FR-AUTHZ-*, foundations; `audit` security log → NFR-SEC-009, foundations) and
`src/infra/` (DB, config — live in the skeleton).
