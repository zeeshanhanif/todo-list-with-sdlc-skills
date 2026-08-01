# API capability modules (modular monolith — ADR-001)

Each capability area from the architecture (§5) becomes a NestJS module under
`src/modules/<area>/`. They are **stubs until their slices are built**. Built so
far: `auth`, `profile`, `lists`, `tasks`, `search`, `account-data` (plus `infra`
+ `health` from the walking skeleton, and the cross-cutting `common/realtime`
and `common/preferences`). With `account-data` minted by FEAT-017, **every
capability module the architecture named now exists**.

`account-data` is the only module that reads `users`, `lists` **and** `tasks`
without owning any of them — the export is a cross-entity read by nature, and
FEAT-018's deletion is the same shape in reverse (one `DELETE FROM users`, with
the schema's cascades doing the rest). That is not a boundary violation (the
rule forbids importing another module's *code*, which it does not do); see
FEAT-017 technical-design §2.

It is also why `PasswordHasher` lives in `common/crypto/` rather than in `auth`:
deletion re-verifies the caller's password (FR-DATA-004), and one Argon2id
configuration must serve both modules (FEAT-018 D2).

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
| `account-data` | FR-DATA-* | FEAT-017 ✅ built (export); FEAT-018 ✅ built (delete account) |

Cross-cutting concerns live under `src/common/` (`authz` ownership guard →
FR-AUTHZ-*, foundations; `audit` security log → NFR-SEC-009, foundations;
`realtime` change signal → ADR-006, FEAT-019; `preferences` read-only access to
a stored user preference a query needs → FEAT-015 D1, minted under FEAT-010 D8's
"the third cross-module read should be an interface" rule) and
`src/infra/` (DB, config — live in the skeleton).
