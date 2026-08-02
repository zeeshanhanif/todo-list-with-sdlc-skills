# Acceptance Report: FEAT-017 — Export personal data (JSON)

> Verdict: **Accepted** · Date: 2026-08-01
> Audited against: docs/features/FEAT-017-export-data/technical-design.md §6
> (AC-1..AC-15), docs/srs.md (FR-DATA-001, FR-DATA-002, NFR-COMP-001 and the
> binding NFRs), docs/use-cases.md (UC-015), ui-design.md and
> docs/design-manifest.json
> Suites re-run in this audit, not reported from the build: api **490**
> (serial), worker **24**, web **88**, e2e **60**; boundaries, lint, build clean.
> Two tests were **corrected by this audit** (`7c0d4d9`); both then passed
> against unchanged production code.

## Verdict summary

FEAT-017 is **accepted**. Every criterion holds under observation, the export
was driven end to end against a running API and its output inspected by hand,
and the two requirements it implements are satisfied on the reading the design
recorded.

The feature's strongest property is that the file itself is what gets asserted.
The E2E reads the **downloaded bytes** rather than the API response, so a screen
that reported success while handing the browser an empty or malformed blob would
fail — which is the failure this feature could most plausibly have shipped.

**One finding is recorded and routed, and it is a requirements question rather
than a code defect:** the design excludes *all* soft-deleted tasks, while
FR-DATA-002's note draws its line at *purged* ones. Details in "Findings" — it
does not block acceptance, and the reasoning for that is given there.

**One criterion is satisfied by a deliberate non-implementation:** UC-015's
alternate 2a (background processing) is not built. That is D9's recorded
decision, and this audit verified the measurement it rests on rather than taking
it on trust — see AC-10.

## Criteria

| AC | Source | Evidence (re-run or observed in this audit) | Verdict |
| :-- | :-- | :-- | :-- |
| AC-1 | FR-DATA-001; UC-015 1–3 | `service.spec` (top-level key set is exactly the four; JSON round-trip), `controller.spec` (200, unwrapped body, `application/json`), e2e. **Observed directly**: a real `curl` export returned `['account','exportedAt','formatVersion','lists']`, `formatVersion: 1` | ✅ |
| AC-2 | FR-DATA-002 | `repository.spec` (all lists incl. an empty one; `created_at` tiebreak), `service.spec` (`tasks: []` present, not a missing key), e2e. **Observed**: `[('Inbox',default,0,2 tasks),('Work',1,0 tasks)]` | ✅ |
| AC-3 | FR-DATA-002 | `repository.spec`, `service.spec`, `controller.spec`, e2e. **Observed**: `Active one → completedAt: null`; `Finished one → 2026-08-01T14:10:15.128Z` | ✅ |
| AC-4 | FR-DATA-002 (note); D7 | `repository.spec` (incl. the completed-**and**-deleted case), `controller.spec`, e2e (absent from the serialized file). **Observed**: `'Deleted one' present in file: False`. *See Finding 1 on the reading being tested* | ✅ (reading noted) |
| AC-5 | FR-DATA-001; FR-AUTHZ-002/003 | `repository.spec` (both reads), `controller.spec` — asserted over the **serialized** body, so a stray id anywhere fails rather than passing an array-shaped check | ✅ |
| AC-6 | FR-AUTHZ-001 | `controller.spec` ×4 — missing, garbage, revoked-by-sign-out and expired cookies, each `401 unauthenticated` with no data; e2e (signed-out redirect). **Observed**: pre-login `curl` → `401` | ✅ |
| AC-7 | FR-DATA-001; NFR-LOC-001 | `service.spec` — every stamp `null` or an ISO-8601 `Z` string that round-trips through `new Date().toISOString()`; `exportedAt` bounded by the call | ✅ |
| AC-8 | FR-DATA-001; NFR-COMP-001; D4 | `service.spec` (stored `displayName`, asserted **not** to be the email-derived fallback; key set exhaustive), e2e. **Observed**: `displayName: None` for an account whose fallback would have been `audit-1785593414`; no `password`/`token`/`verified_at` substring in the file | ✅ |
| AC-9 | UC-015 2; D8 | `repository.spec` isolation test — **proven to discriminate**: the implementation log records it going red under `READ COMMITTED` and green under `REPEATABLE READ`, and it asserts the concurrent writes really committed. Plus `service.spec`'s orphan-mapping cases and the scale spec's nesting check | ✅ |
| AC-10 | NFR-SCAL-002; D9 | `scale.spec` at the ceiling — 100 lists / 5,000 tasks: **39 ms** against the 2,000 ms budget, 1.30 MB serialized, all 5,000 tasks present. Completeness asserted before the clock | ✅ |
| AC-11 | NFR-SEC-009; D6 | `controller.spec` ×3 (exactly one row; no titles or list names; an audit write that throws still returns 200). **Observed in the database**: `data_exported`, `has_user: t`, `detail: NULL` | ✅ |
| AC-12 | UC-015 3; FR-DATA-001; D5 | `filename.spec` (the zone rule), `controller.spec` (Kiritimati + the UTC fallback), e2e (downloaded filename, `preparing → ready`, counts). **Observed**: at `14:10 UTC on 2026-08-01` the real endpoint returned `todo-export-2026-08-02.json` for a Kiritimati account — a UTC-derived name would have been wrong at that moment | ✅ |
| AC-13 | UC-015 1; SCR-WEB-014 | e2e — **corrected by this audit** to reach the row by keyboard (tab to focus, Enter) instead of by click; back link asserted | ✅ (test corrected) |
| AC-14 | NFR-USE-003; NFR-REL-004 | e2e — **corrected by this audit** to read the message rather than only assert visibility; nothing downloaded, session intact, retry succeeds | ✅ (test corrected) |
| AC-15 | NFR-USE-004; DEF-006/009/011 | e2e — computed contrast ratios in **both themes** (with alpha compositing), focus ring width/style after establishing keyboard modality, and ≥44px boxes at a 390×844 viewport for the hub row, the export button and the retry control | ✅ |

## Requirements verified directly

Beyond the suites, against a running API and the live database:

- **FR-DATA-001** — a signed-in user's export returns JSON containing their
  lists and tasks, scoped to them. Driven with `curl` end to end; document
  inspected field by field (above).
- **FR-DATA-002** — the exported document contained the account's two lists and
  both its active and completed tasks; the soft-deleted one was absent.
- **NFR-SEC-009 (audit)** — `audit_log` inspected directly rather than through
  the test's own assertion: exactly the expected `data_exported` row, user id
  set, `detail` NULL.
- **NFR-COMP-001 (data minimization)** — no credential, token, lockout or
  verification field appears in the exported bytes.
- **NFR-SCAL-002** — measured (AC-10). **Indicative, environment-caveated**: a
  local Docker Postgres on a developer machine, not the Supavisor-pooled
  Supabase instance production uses. The 50× margin is wide enough that the
  conclusion (a synchronous export is right) survives a large environment
  penalty, but the *number* is not a production figure.
- **Screens** — `docs/design-manifest.json`'s two entries were spot-checked:
  both `source.spec` locators resolve to real headings, and all four states
  SCR-WEB-016 claims (`default`, `preparing`, `ready`, `error`) were exercised
  in this audit's E2E run.

## Test-diff review (anti-fake-green)

The feature's test diff is **1,664 insertions across 7 new files, zero
deletions**. No pre-existing spec was modified; no `.skip`, `.only`, `xit`,
`xdescribe` or `test.todo` appears anywhere in the feature's tests. No
production behaviour is mocked away in the integration or contract specs — the
repository and controller specs run against real Postgres, and the only stub is
`service.spec`'s repository double, which is appropriate for a mapping unit test
whose collaborator is covered by its own integration spec.

Two tests were rejected and corrected (`7c0d4d9`). Both were *measurement*
defects — they passed against unchanged production code once they asserted what
their criteria actually say:

1. **AC-13** asserted keyboard reachability by clicking. A `div` with an
   `onClick` would have passed. Now tabs to the row and presses Enter.
2. **AC-14** asserted only that the error alert was visible. A visible but empty
   alert would have passed. Now reads the message.

## Findings

### 1. FR-DATA-002's note says *purged*; the design excludes *all* soft-deleted tasks — routed as a requirements clarification

**Not blocking, and recorded here so the decision is the user's rather than
mine.**

FR-DATA-002 reads: *"…all of the user's current lists and their active and
completed tasks…"* with the note *"**Purged** soft-deleted tasks (FR-TASK-015)
are not included."*

D7 excludes every soft-deleted task, and AC-4 faithfully encodes that. But the
note's qualifier is doing visible work: if all soft-deleted tasks were out of
scope, "purged" would be redundant — the sentence would simply say "soft-deleted
tasks are not included". Read the other way, the note draws the line at
**purging**, which would put a task deleted three days ago (still inside
FEAT-013's 30-day restore window, still a row in the database) *inside* the
export.

Why this does **not** block acceptance:

- The design's reading is defensible on the FR's own body — "active and
  completed" is this product's two-state vocabulary, and a trashed task is
  presented as neither.
- D7 recorded the alternative reading and rejected it with reasons, rather than
  arriving at the behaviour by accident.
- **The UI discloses it.** SCR-WEB-016 tells the user in the card: *"**Not** the
  tasks you've deleted — restore one first if you want it included."* A user who
  wants those rows can act, inside the window that FEAT-013 guarantees.

Why it still deserves a ruling:

- **FEAT-018 (delete account) is the next feature**, and export-then-delete is
  the flow EPIC-G exists to support. If the user's reading is the other one, a
  person exporting before deleting their account permanently loses tasks they
  had deleted but not yet purged — the one context where the distinction becomes
  irreversible.
- The fix, if the reading changes, is small and local: drop
  `AND deleted_at IS NULL` from `TASKS_SQL`, add a `deletedAt` field to
  `AccountExportTask`, bump `ACCOUNT_EXPORT_FORMAT_VERSION`, and update AC-4 and
  the screen's copy.

**Ruled 2026-08-01 by the user: keep excluding them — the behaviour as built
stands.** "Active and completed" governs, and the screen's own copy already
tells users to restore a task first if they want it in the file. No amendment,
no code change. Recorded here rather than only in a conversation so the next
person to read FR-DATA-002's note finds the question already answered instead of
re-opening it — and so FEAT-018 inherits a settled scope rather than an open
one.

### 2. Carried, from the implementation: the standing contrast sweeps do not composite partial alpha

Recorded in technical-design §8 (watch item 4) during T8 and confirmed by this
audit. `control-contrast.spec.ts` and `inline-alert-contrast.spec.ts` read
`getComputedStyle(el).backgroundColor` and skip only *fully* transparent values.
Light-theme tints are opaque hex, so their numbers are sound; the **dark**
theme's tints are `rgba(…, 0.15)` over the surface, and measuring text against
that raw value computes a ratio no pixel ever had. FEAT-017's own guard
composites and went red on its first run for exactly this reason.

This concerns **already-verified screens**, so it is a defect-ledger question,
not FEAT-017's. **Route:** a DEF row and a re-measurement of those two sweeps
composited. It is unknown until then whether the older numbers are *wrong* or
merely *imprecise*.

### 3. Carried, minor: the export endpoint is unthrottled

D10's recorded consequence, restated here so it is visible outside the design
document: the heaviest authenticated read in the product has no rate limit. No
requirement asks for one, and the existing guard's per-IP axis and auth-tuned
thresholds would be the wrong mechanism. Recorded, not actioned — a per-user
throttle should arrive with a requirement behind it.

## RTM

Test ref appended for **FR-DATA-001** and **FR-DATA-002** —
`features/FEAT-017-export-data/acceptance-report.md` — completing Plan ref →
Design ref → Test ref for both.
