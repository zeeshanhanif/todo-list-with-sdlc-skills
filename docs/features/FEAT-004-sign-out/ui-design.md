# UI Design: FEAT-004 — Sign out

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-007 (App Shell — sign-out control) · Mode: per-feature · Status: Draft · Date: 2026-07-25
> Strategy: code-native (project fallback policy; no design tool holds this screen)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-004 adds **one control** to the existing app shell (SCR-WEB-007), it does
not design a new screen. The shell frame — sidebar + content (+ detail host) —
is the foundations/skeleton (`apps/web/src/app/page.tsx`); this feature places a
**sign-out control in the sidebar footer**, where ux-foundations §navigation
locates account/settings ("Settings is a distinct area reached from the sidebar
footer"). A composition of existing primitives — **no new component, no
escalation**.

## SCR-WEB-007 — App Shell (sign-out control)

- **Strategy & source:** code-native (this section is the design). Scope: the
  sign-out control only; the shell frame and its `loading`/`ready` states are the
  foundations skeleton, and later slices (sidebar lists FEAT-009, smart views
  FEAT-016, settings link SCR-WEB-014) extend this same manifest entry.
- **Purpose (ux-foundations):** end the session from within the app. Realizes
  UC-004. **Composition:** a sidebar-footer `button-tertiary` (ghost —
  transparent, `--color-text-muted` label, hover `--color-surface-sunken`) with a
  leading Lucide **`LogOut`** icon (decorative, `aria-hidden`) and the label
  "Sign out". Pinned to the bottom of the `aside` sidebar (`margin-top:auto` in
  the sidebar's flex column), separated from the nav list. 44px min touch target
  (§5). It is a small **client-component island** (`SignOutButton`) inside the
  otherwise server-rendered shell.
- **Content & data mapping:** click → `POST /api/auth/login`'s sibling
  `POST /api/auth/logout` (BFF → API `POST /auth/logout`, technical-design §3.1).
  On `200 { status:"signed_out" }` the BFF has cleared the session cookie; the
  client routes to `/signin` (SCR-WEB-004). Logout is idempotent, so the control
  never shows a failure state — a network error still routes to `/signin` (the
  local session is being abandoned regardless).
- **Conformance:** pass — `button-tertiary` + Lucide icon + sidebar layout are all
  design.md components/tokens; no off-system color/spacing/component.

### default
The ghost "Sign out" row with the `LogOut` icon, at the sidebar footer. Keyboard
focusable with the standard 2px `--color-focus-ring` focus-visible ring (§5);
`aria-label`/visible label "Sign out".

### signing-out
On click the control disables and shows its loading affordance (label →
"Signing out…", reduced opacity, `cursor: not-allowed`, per design.md §4 Actions
loading), while `POST /api/auth/logout` is in flight; then the client navigates
to `/signin`. (No error state — see the idempotency note above.)

- **Responsive notes:** the sidebar is a drawer below `md` (ux-foundations
  §navigation); the sign-out control sits in the same footer position within the
  drawer. No control-specific responsive behavior beyond the shell's.
- **Decisions:**
  - **D1 — Sign-out in the sidebar footer, not a user/avatar menu.** ux-foundations
    puts account/settings at the sidebar footer, and no profile/avatar surface
    exists yet (FEAT-008). A footer `button-tertiary` is the conforming, minimal
    placement; it can later move into a Settings/account menu (SCR-WEB-014) without
    changing the contract.
  - **D2 — No failure state.** Logout is idempotent server-side (technical-design
    D1); the client always ends on `/signin`, so the control has only
    default/signing-out, never an error state.

## Cross-screen decisions

- **Reuses the app-shell frame** (SCR-WEB-007, foundations skeleton) rather than
  introducing a screen; this is the first feature to register a designed control
  on the shell. The manifest entry is scoped to the sign-out control and will be
  extended by later shell-touching features.

## Escalations & open items

- **No design-system amendment.** The control composes from existing design.md
  components (`button-tertiary`, Lucide icon, sidebar layout) themed by tokens.
- **Source-trace note (carried from technical-design §8, not resolved here).**
  The plan/ux-foundations inventory tag **SCR-WEB-010 (Task Detail)** with UC-004;
  Task Detail has no sign-out role. FEAT-004's only presentation touchpoint is the
  **SCR-WEB-007** control designed above. Flagged for a ux-foundations touch-up
  (a likely inventory typo); non-blocking. No manifest entry is created for
  SCR-WEB-010 under this feature.
