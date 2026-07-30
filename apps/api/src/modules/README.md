# API capability modules (modular monolith — ADR-001)

Each capability area from the architecture (§5) becomes a NestJS module under
`src/modules/<area>/`. They are **stubs until their slices are built**. Built so
far: `auth`, `profile`, `lists`, `tasks`, `search` (plus `infra` + `health`
from the walking skeleton, and the cross-cutting `common/realtime` and
`common/preferences`).

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
| `search` | FR-SRCH-* | FEAT-015 ✅ built, FEAT-016 (smart views) |
| `account-data` | FR-DATA-* | FEAT-017, FEAT-018 |

Cross-cutting concerns live under `src/common/` (`authz` ownership guard →
FR-AUTHZ-*, foundations; `audit` security log → NFR-SEC-009, foundations;
`realtime` change signal → ADR-006, FEAT-019; `preferences` read-only access to
a stored user preference a query needs → FEAT-015 D1, minted under FEAT-010 D8's
"the third cross-module read should be an interface" rule) and
`src/infra/` (DB, config — live in the skeleton).
