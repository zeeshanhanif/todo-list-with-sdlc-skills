# Acceptance Report: FEAT-018 — Delete account (confirm + password re-entry)

> Verdict: **Accepted** · Date: 2026-08-02
> Standard: technical-design.md §6 @ `e8d34f1` · Sources: srs.md (FR-DATA-003..006, NFR-USE-002, NFR-COMP-001, NFR-SEC-009, NFR-SCAL-002), use-cases.md (UC-016)
> Repo state audited: `40d48d8`

## Verdict summary

All nineteen criteria hold, and every suite was observed green in this run —
api 526, worker 24, web 96, e2e 69, the feature's own 36. The standard itself
audits clean against its sources: every FR in the feature's trace carries at
least one criterion, and both of UC-016's alternate paths (cancel, wrong
password) are represented.

The audit went beyond re-running: **five mutations were injected into the
production code and every one was caught** — removing the outbox purge (2 red),
writing the audit row the naive way D6 warns about (2 red), accepting
`confirm: false` (1 red), not clearing the session cookie (1 red), and
accepting any password at all (6 red). Migrations were applied to a dropped and
rebuilt schema, and the foreign-key delete rules were read back from
`pg_constraint` directly — `lists`/`tasks`/`sessions` = `CASCADE`,
`audit_log` = `SET NULL` — which is the claim §4's "no migration needed" rests
on, now independently confirmed rather than assumed.

Four minor findings are recorded, none blocking: one criterion (AC-15) is
worded more narrowly than the FR it encodes, three ACs trace by prose rather
than by reference, one manifest-claimed screen state had no automated check
(verified here by observation), and the E2E suite's known rate-limit fragility
resurfaced. **The feature is verified**; the RTM's Test ref is appended for
FR-DATA-003 through FR-DATA-006.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-DATA-003; UC-016 main 4–5 | `account-delete.controller.spec` (200 + clearing `Set-Cookie`) | faithful — asserts the cookie is *cleared*, not merely present | green; mutation 4 (drop `clearCookie`) → red |
| AC-2 | FR-DATA-003 | `account-delete.repository.spec`, `account-delete.controller.spec`, `delete-account.spec` (e2e) | faithful — counts asserted **per table**, not inferred from the cascade; includes a soft-deleted task | green |
| AC-3 | FR-DATA-005 | `account-delete.controller.spec`, e2e (two browser contexts) | faithful — a *second* session is proven live before the deletion, then 401 after | green |
| AC-4 | FR-DATA-005 | `account-delete.controller.spec`, e2e | faithful — re-registration returns 201 **and** the new row's id differs | green |
| AC-5 | FR-DATA-004; UC-016 alt 3a | `account-delete.service.spec`, `account-delete.controller.spec` (×2) | faithful — asserts the 400 code, the `fields[]` shape, that nothing was deleted, **and** that the caller's session still authenticates | green; mutation 5 (accept any password) → 6 red |
| AC-6 | FR-DATA-004; NFR-USE-002 | `account-delete.controller.spec` (`it.each`, 5 cases) | faithful — covers omitted / `false` / string `"true"` / missing / empty | green; mutation 3 (drop `@Equals(true)`) → red on exactly the `false` case |
| AC-7 | FR-AUTHZ-001 | `account-delete.controller.spec` (×3), e2e | faithful — missing, revoked and expired cookies, each with the account asserted intact | green |
| AC-8 | FR-AUTHZ-002/003 | `account-delete.repository.spec` | faithful — a bystander's rows checked on every table | green |
| AC-9 | FR-DATA-003; NFR-COMP-001 | `account-delete.repository.spec` | faithful — pending **and** sent rows, queried by both `payload->>'userId'` and `recipient` | green; mutation 1 (drop the purge) → 2 red |
| AC-10 | ADR-003; NFR-REL-004 | `account-delete.repository.spec` (rollback), `account-delete.controller.spec` (500) | faithful — the repository half proves nothing is partially deleted; the contract half proves the 500 **and** that no audit row claims a deletion that did not happen | green |
| AC-11 | NFR-SEC-009 | `account-delete.service.spec` (×3), `account-delete.controller.spec`, e2e | faithful — including the half no unit test can reach: the row *survives* the cascade, queried by `detail` because `user_id` cannot hold the id | green; mutation 2 (naive audit shape) → 2 red |
| AC-12 | NFR-SEC-009; UC-016 alt 3a | `account-delete.service.spec`, `account-delete.controller.spec` | faithful — asserts the reason category and that the submitted password appears nowhere in the row | green |
| AC-13 | NFR-SEC-006; D9 | `account-delete.controller.spec` | faithful — drives past `authRateLimitMax`, asserts `retryAfterSeconds`, and asserts the account survived; a sibling case pins the export as deliberately *unthrottled* | green |
| AC-14 | NFR-SCAL-002 | `account-delete.scale.spec` | faithful — the fixture's size is asserted before the deletion is timed | green — **26 ms** at 100 lists / 5,000 tasks (budget 2 s) |
| AC-15 | FR-DATA-006; UC-016 main 2, 5 | e2e `delete-account.spec` | **narrower than its FR** — see minor finding 1; the shipped copy nonetheless satisfies FR-DATA-006 (direct verification below) | green |
| AC-16 | UC-016 alt 2a, 3a; NFR-USE-003 | e2e `delete-account.spec` | faithful — cancel (Esc) asserted against row counts, not just a hidden dialog; the retry path is then driven to a real deletion | green |
| AC-17 | FR-DATA-006; D10 | e2e `delete-account.spec` | faithful — the confirmation is asserted **with the session cookie already gone**, then the next navigation lands on `/signin` | green |
| AC-18 | UC-016 main 1; SCR-WEB-014 | e2e `delete-account.spec` | faithful — the row is reached **by keyboard** (a click would pass on a non-focusable div), and the mark is measured as the danger token while the label is measured as *not* it | green |
| AC-19 | NFR-USE-004; DEF-006/009/011/012 | e2e `delete-account.spec` (both themes) | faithful — composited backgrounds, both themes, theme asserted before measuring | green |

## Corrected tests

**None.** No test failed the fidelity or exercised checks, so this skill
corrected nothing.

## Independent execution

All commands are the harness's own, run from `40d48d8`:

| Run | Command | Observed |
| :-- | :------ | :------- |
| Feature suite | `npm test -w @todo/api -- --runInBand modules/account-data` | 9 suites, **84 passed** |
| Delete-only subset | `… modules/account-data/account-delete` | **36 passed** (the mutation baseline) |
| Whole repo — api | `npm test` (serial, DEF-002) | 55 suites, **526 passed** |
| Whole repo — worker | `npm test` | 7 suites, **24 passed** |
| Whole repo — web | `npm test` | 11 suites, **96 passed** |
| E2E | `npm run test:e2e` | **69 passed** (was 65 before this feature) |
| Migrations | `DROP SCHEMA public CASCADE` + `npm run db:migrate` | clean to head (013 rows applied); all 8 tables present |
| Boundaries / lint / build | `npm run boundaries` · `npm run lint` · `npm run build` | clean |

**Mutation checks** (injected, observed red, reverted; working tree confirmed
clean afterwards):

| # | Mutation | Expected to break | Observed |
| :- | :-------- | :---------------- | :------- |
| 1 | Remove the `email_outbox` purge | AC-9 | 2 failed |
| 2 | Audit row written with `userId` on the column (D6's trap) | AC-11 | 2 failed |
| 3 | Remove `@Equals(true)` | AC-6 | 1 failed — precisely the `confirm: false` case (`@IsBoolean` still rejects the others), which is the correct blast radius |
| 4 | Remove `res.clearCookie` | AC-1 | 1 failed |
| 5 | `const ok = true` — accept any password | AC-5 | 6 failed |

**Flakiness observed.** The first E2E attempt of this audit failed 59 of 69 on
`429` at fixture registration. Diagnosed as the environment, not the code: the
per-IP window had been exhausted by the preceding manual runs, and the
harness's `AUTH_RATELIMIT_MAX: "100000"` only applies to servers Playwright
starts itself — a reused orphan API from an earlier run keeps the
production-shaped limit. After killing the orphan and clearing
`auth_rate_buckets`, the suite ran 69/69 twice. Recorded as minor finding 4;
not laundered into green.

## Direct verification

**FR-DATA-003 / FR-DATA-005 — observed, not inferred.** A real account was
registered, signed in, and deleted over HTTP against the running API; the
database was then read directly:
`users=0 lists=0 tasks=0 sessions=0 outbox=0`.

**§3 contract shapes — observed against the document.** All three match
technical-design §3.1 exactly:
- wrong password → `400 {"code":"current_password_invalid", fields:[{field:"currentPassword"}]}`
- `confirm` omitted → `400 {"code":"validation_failed", fields:[{field:"confirm"}]}`
- success → `200 {"status":"account_deleted"}` with
  `Set-Cookie: sid=; …; Expires=Thu, 01 Jan 1970 …; HttpOnly; SameSite=Lax`

**NFR-SEC-009 — the audit log inspected as it actually stands.** After the
deletion, three rows survive for that session's IP:

| event | user_id | detail |
| :---- | :------ | :----- |
| `sign_in_success` | *(null)* | — |
| `account_delete_failure` | *(null)* | `{"reason": "wrong_password"}` |
| `account_deleted` | *(null)* | `{"userId": "7365b9d1-…"}` |

This is §8 watch item 1 moving from prediction to observation: the cascade's
`SET NULL` anonymized the account's **earlier** rows, so the deletion event is
the only one that stays attributable — and only because D6 put the id in
`detail`. NFR-SEC-009's requirement (record + retain) is met; the attribution
loss is the deliberate, recorded consequence.

**Schema claim verified independently.** `pg_constraint` read back after a
fresh migrate: `lists`, `tasks`, `sessions` → `c` (CASCADE); `audit_log` → `n`
(SET NULL). §4's "no migration, and here is why" is accurate.

**Screens — spot-checked against the manifest.** SCR-WEB-017's entry claims
five covered states. Four are exercised by tests; the fifth, `deleting`, had no
automated check, so it was observed directly by holding the request open:
dialog stays open, confirm reads "Deleting…" and is disabled, cancel is
disabled, and Esc does **not** dismiss — exactly the spec. The spec locator
resolves, and the feature's UI diff contains zero raw hex or px values where
tokens exist.

**FR-DATA-006 — copy read in the rendered screens.** Before: "**This is
permanent.** Deleting your account removes everything in it. We can't undo it,
and we can't get it back for you," plus the dialog's "It can't be undone."
After: "Your lists, your tasks and your account details have been
**permanently removed**." Both halves of the FR are satisfied in substance;
see minor finding 1 on the criterion's wording.

**NFR measurements.** AC-14 measured at 26 ms against a 2 s budget for
100 lists / 5,000 tasks (local Docker Postgres — indicative, not production
hardware). No NFR for this feature is **pending environment**.

## Findings

### Rework
**None.**

### Design defect
**None.**

### Minor

1. **AC-15's "after" clause is narrower than FR-DATA-006.** The FR requires
   informing the user "before **and after** deletion, that the action is
   permanent and their data cannot be recovered." AC-15's after-half asks only
   for "a confirmation that the account and data have been removed" — as
   written it would admit a bare "Done." The shipped copy says "permanently
   removed" and does satisfy the FR (observed above), so this is a wording gap
   in the standard, not a product defect. Worth tightening if FEAT-018's design
   is ever amended.
2. **AC-15, AC-16 and AC-18 trace by prose, not by reference.** They are
   genuinely covered inside the e2e UC-016 test, but their AC references live
   in comments rather than the `AC-N:` form the api specs use, so a
   reference-based sweep under-reports them. Traceability note only.
3. **`deleting` was a manifest claim with no automated check.** Verified by
   direct observation in this audit rather than by a test. Acceptable for a
   transient in-flight state; if the dialog's in-flight behaviour changes
   (particularly the suspended Esc), nothing would catch a regression.
4. **The E2E rate-limit fragility is sharper than the config comment implies.**
   The harness raises `AUTH_RATELIMIT_MAX` only for servers it starts, and
   `reuseExistingServer` means an orphan API left by a previous run silently
   keeps the production-shaped limit — which is how a 59-failure run happens
   with correct code. E2E runs also leave that orphan behind. This is the
   carried FEAT-009 acceptance minor, not FEAT-018's, but this audit paid its
   cost twice and it will keep costing.

## RTM

Test ref appended for **FR-DATA-003, FR-DATA-004, FR-DATA-005, FR-DATA-006** —
`features/FEAT-018-delete-account/acceptance-report.md`, with no `(partial)`
marker, since the plan's FEAT-018 touchpoint claims all four in full.

With FR-DATA-003 and FR-DATA-006 verified here, and FR-DATA-001/002 verified by
FEAT-017, **EPIC-G's requirement set is closed**.
