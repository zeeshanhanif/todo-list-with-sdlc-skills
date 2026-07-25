# Acceptance Report: FEAT-004 — Sign out

> Verdict: **Accepted** · Date: 2026-07-25
> Standard: technical-design.md §6 @ 73f94f2 · Sources: srs.md (v1.0), use-cases.md (UC-004)
> Repo state audited: 26de65e

## Verdict summary

FEAT-004 is **accepted — verified**. The standard was re-derived from FR-AUTH-011
("allow a signed-in user to log out, terminating their **current** session") and
UC-004; the three criteria fully and faithfully cover it — AC-3 correctly encodes
the FR's *current*-session scope (not all sessions). All criteria were observed
green this run (feature suite 6 tests; whole-repo api 68, worker 20); boundaries
and lint pass; no migration (logout reuses FEAT-003's `sessions` table). The
decisive criteria (AC-1 server-side revoke, AC-3 single-session scope) were
mutation-checked: making `revoke` a no-op turned AC-1 and AC-3 red across service
and contract suites, restored to green — the tests genuinely guard revocation. No
rework or design-defect findings; one implementation divergence (decorative icon
omitted) reviewed and accepted.

## Audit table

| AC | Encodes | Test(s) | Audit | Observed |
| :- | :------ | :------ | :---- | :------- |
| AC-1 | FR-AUTH-011, UC-004 main | sign-out.controller.spec AC-1 | faithful (200 signed_out; clear-cookie sid=; past-expiry; session row deleted; old cookie → 401); **mutation-checked** | green |
| AC-2 | FR-AUTH-011 idempotency (design D1) | sign-out.controller.spec AC-2; session-revoke.service.spec AC-2 (×2) | faithful (200 with no cookie and with an invalid cookie; domain no-op for empty/unknown token) | green |
| AC-3 | FR-AUTH-011 (*current* session), ADR-005 | sign-out.controller.spec AC-3; session-revoke.service.spec AC-3 | faithful (only the presented session revoked; the user's other session still authenticates); **mutation-checked** | green |

## Corrected tests

None — each criterion's test asserted the criterion faithfully on first audit.

## Independent execution

- **Feature suite** (`session-revoke`, `sign-out` specs), fresh from repo head:
  **2 suites, 6 tests — green.**
- **Whole-repo suite** (`npm test`): **api 19 suites / 68 tests, worker 6 / 20 —
  green.** (The `[Audit] audit write failed` / `[SkeletonService] db round-trip
  failed` log lines are the intentional negative-path tests from earlier
  features, not failures.)
- **Boundaries** (`npm run boundaries`): no violations (72 modules). **Lint**
  (`npm run lint`, api+web): pass.
- **Migrations**: none in this feature (verified — no new file under
  `migrations/`; logout is a `DELETE` on FEAT-003's `sessions` table).
- **Mutation check**: `SessionService.revoke` forced to a no-op → AC-1 + AC-3
  (service and contract) red; restored → green.
- **E2E**: architecture names no critical E2E flows / frameworks → none owed
  (legitimate skip, consistent with FEAT-001/002/003).

## Direct verification

- **FR-AUTH-011 side effect** — the AC-1 contract test queries the `sessions`
  table directly and observes 0 rows for the user after logout; `GET /auth/session`
  with the revoked cookie returns `401 unauthenticated`. Server-side termination
  confirmed by observation, not just the 200.
- **Cookie clearing** — the logout response's `Set-Cookie` is `sid=;` with a
  1970/`Max-Age=0` expiry (asserted in AC-1); the BFF relays it.
- **Contract vs §3** — `POST /auth/logout` is **unguarded** (no `@UseGuards` on
  the route — confirmed by inspection) and idempotent, returning
  `200 { status:"signed_out" }` — matches technical-design §3.1 / D1.
- **Screen (SCR-WEB-007 sign-out control)** — the `SignOutButton` realizes the
  manifest states `default` ("Sign out") and `signing-out` ("Signing out…",
  disabled); conformance holds — only design tokens (`--color-text-muted`,
  `--font-size-small`), no raw hex/px (the `44` min-height is the design.md §5
  a11y touch-target constant). No error state by design (logout is idempotent,
  ui-design D2) — a deliberate absence, not a coverage gap.
- **Reviewed divergence (accepted).** Implementation omitted ui-design's
  decorative Lucide `LogOut` icon (realized text-only). Rationale is sound: the
  web has no icon library wired and every prior auth screen is text-only; the
  icon is `aria-hidden`/decorative, so behavior, states, and the contract are
  unaffected. Recorded in the manifest note and the T4 code comment. Not a
  finding — a design-consistent realization choice. (When Lucide is later wired,
  the icon can be added without touching the contract.)
- **Pending environment** — none. No NFR binds logout (no rate-limit, no audit
  event per design D3; architecture §8's audited-event list excludes logout).

## Findings

**Rework:** none.

**Design defect:** none.

**Minor (non-blocking):**
- **Source-trace typo (carried forward, not introduced here).** The plan's
  FEAT-004 row and ux-foundations' inventory tag SCR-WEB-010 (Task Detail) with
  UC-004; Task Detail has no sign-out role. FEAT-004 correctly scoped its only
  presentation touchpoint to SCR-WEB-007 (technical-design §8, ui-design
  §escalations). Recommend a ux-foundations touch-up to drop the SCR-WEB-010 /
  UC-004 tag. Non-blocking; no code impact.

## RTM

Accepted → Test ref appended for **FR-AUTH-011** (full — FEAT-004 wholly delivers
it): `features/FEAT-004-sign-out/acceptance-report.md`.
