# API capability modules (modular monolith — ADR-001)

Each capability area from the architecture (§5) becomes a NestJS module under
`src/modules/<area>/`. They are **stubs until their slices are built**. Built so
far: `auth`, `profile`, `lists`, `tasks`, `search` (plus `infra` + `health`
from the walking skeleton, and the cross-cutting `common/realtime` and
`common/preferences`).

`search` serves **two** controllers: `GET /search` (FEAT-015) and
`GET /views/{view}` (FEAT-016). The smart views are the same query with fixed
criteria rather than a second query builder, which is why they live here and not
in a module of their own — see FEAT-016 technical-design D1 for the reasoning,
including why a `views` module would have cost a copy of the SQL.

Boundary rule (enforced by `npm run boundaries`, `.dependency-cruiser.cjs`):
a module must **not** import another module's internals. Cross-module needs go
through shared contracts (`@todo/shared`) or explicit domain interfaces added
per-slice.

| Module | FR area | Built by |
| :----- | :------ | :------- |
| `auth` | FR-AUTH-* | FEAT-001..006 ✅ built |
| `profile` | FR-PROF-* | FEAT-008 ✅ built |
| `lists` | FR-LIST-* | FEAT-009 ✅ built |
| `tasks` | FR-TASK-* | FEAT-010..014 (010..013 built) |
| `search` | FR-SRCH-* | FEAT-015, FEAT-016 ✅ built (search + smart views) |
| `account-data` | FR-DATA-* | FEAT-017, FEAT-018 |

Cross-cutting concerns live under `src/common/` (`authz` ownership guard →
FR-AUTHZ-*, foundations; `audit` security log → NFR-SEC-009, foundations;
`realtime` change signal → ADR-006, FEAT-019; `preferences` read-only access to
a stored user preference a query needs → FEAT-015 D1, minted under FEAT-010 D8's
"the third cross-module read should be an interface" rule) and
`src/infra/` (DB, config — live in the skeleton).
