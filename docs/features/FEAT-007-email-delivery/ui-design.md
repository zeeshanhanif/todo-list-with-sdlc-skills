# UI Design: FEAT-007 — Email delivery pipeline

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: **none** · Mode: per-feature · Status: N/A (no screens) · Date: 2026-07-22

## No screens — nothing to design

FEAT-007 is a **backend-only** feature: the Cleanup/Outbox Worker (Cloud Run Job)
that drains `email_outbox` and sends email via the swappable `EmailPort`. It has
no HTTP surface (SW-003) and no user-facing screens — the plan's Screens column is
"—" and technical-design.md lists Screens: none.

Consequences for this skill:
- **No SCR IDs** to resolve → no strategy resolution, no code-native/registered/
  generated screen specs.
- **`docs/design-manifest.json` unchanged** — no entries added or updated.
- **No RTM Design-ref append** — this skill appends only for FRs whose *screens*
  it designs, and FEAT-007 designs none. (FEAT-007's FR-AUTH-005/013 Design refs
  were already appended by detailed-design.)
- **No design-system conformance check / escalation** — there is nothing to
  conform.

This file exists only to record the resolution, so the loop's "next feature
needing ui-design" computation skips past FEAT-007 cleanly.

**Any user-facing effect of email delivery is surfaced by other features'
screens**, not this one — e.g. SCR-WEB-002 (the "check your email" notice,
FEAT-001) and SCR-WEB-003 (Verify Email — Result, FEAT-002), which the delivered
link lands on. Those are designed with their own features.

**Handoff:** proceed directly to **feature-implementation** for FEAT-007.
