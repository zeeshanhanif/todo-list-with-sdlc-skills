# UI Design: FEAT-006 — Change password (signed-in)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-014 (Settings — Security & Account), SCR-WEB-015 (Change Password) · Mode: per-feature · Status: Draft · Date: 2026-07-26
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-006 opens the **authenticated settings zone**: the first screens inside the
app shell that are not the skeleton content column. SCR-WEB-014 is the Security
& Account **hub** (a navigation surface — FEAT-017 and FEAT-018 add their rows to
it later), SCR-WEB-015 is the **change-password form**, the first *guarded* form
in the product. Both are compositions of existing design.md primitives —
**no new component, no design-system amendment**. Reachability comes from one
new sidebar nav item, which extends the existing SCR-WEB-007 shell entry
(anticipated by FEAT-004's ui-design: "later shell-touching features … settings
link SCR-WEB-014 extend this same manifest entry").

## SCR-WEB-014 — Settings — Security & Account

- **Strategy & source:** code-native (this section is the design). Served at
  **`/settings/security`** inside the app shell (authenticated zone, D1).
- **Purpose (ux-foundations):** the hub for change password, export, delete
  (inventory states: `default`). Realizes the entry point of UC-006 (step 1);
  UC-015/016 attach here with FEAT-017/018.
- **Composition:** `app-shell` (sidebar + main column, `--content-max` centered,
  `--space-8` page padding — the frame the skeleton already renders) › `h1`
  "Security & account" › one `card` holding generic **`list-row`**s, each a
  full-row navigation target: label (`body`, `--color-text`) over one line of
  help (`small`, `--color-text-muted`), 1px `--color-border` bottom rule between
  rows, hover `--color-surface-sunken`, 44px minimum height (§5), standard
  focus-visible ring. Rows are real links (keyboard-navigable, not click
  handlers).
  - **Change password** — help: "Update your password. Other devices will be
    signed out." → `/settings/security/password` (SCR-WEB-015).
  - *(Export data → SCR-WEB-016 and Delete account → SCR-WEB-017 are the same
    row pattern, added by FEAT-017 / FEAT-018. Not rendered now — an empty
    promise row is worse than a short list.)*
- **Content & data mapping:** none — the hub is pure navigation and consumes no
  endpoint. Reaching it requires a live session: server-side, an unresolved
  session (`GET /auth/session` → `401`) redirects to `/signin` (SCR-WEB-004);
  this is the guarded-zone convention FEAT-006 establishes (D4).
- **Conformance:** pass — `card`, generic `list-row`, `h1`, app-shell layout, all
  design.md components themed by tokens.

### default
Sidebar (with the new **Settings** nav item selected — `sidebar-nav-item`
selected state: `--color-primary-subtle` bg + `--color-primary` text + left
accent bar) and the card with the single "Change password" row. No data is
fetched, so the hub has **no loading / empty / error states** — the
`data-view state conventions` (§4) don't apply to a static navigation surface;
the only non-default outcome is the unauthenticated redirect above.

- **Responsive notes:** inherits the shell — below `md` the sidebar is a drawer
  and the card spans the full-width column; rows keep the 44px touch minimum.
- **Decisions:** see cross-screen D1/D2 (routes and reachability) — nothing
  screen-local.

## SCR-WEB-015 — Change Password

- **Strategy & source:** code-native (this section is the design). Served at
  **`/settings/security/password`** inside the app shell (D1).
- **Purpose (ux-foundations):** set a new password while signed in (inventory
  states: `default`, `error`, `success`). Realizes UC-006 main 2–5 + alt 3a/3b.
- **Composition:** `app-shell` › main column › `link` "← Security & account"
  (back to SCR-WEB-014) › `h1` "Change password" › `card` › form:
  - `field`( **Current password** — `input type=password`,
    `autocomplete="current-password"`, autofocus )
  - `field`( **New password** — `input type=password`,
    `autocomplete="new-password"`, help "At least {PASSWORD_MIN_LENGTH}
    characters." reading the shared constant from `@todo/shared` so the hint can
    never drift from the server rule — the convention SCR-WEB-001/006 set )
  - `button-primary` "Change password" + `button-tertiary` "Cancel" (→ the hub)
  - a top **`inline-alert`** slot for form-level notices (success, rate-limit)
  Per design.md's validation convention: one error per field, beneath it;
  form-level errors summarized in the top alert.
- **Content & data mapping:** submit → `POST /api/auth/change-password`
  `{ currentPassword, newPassword }` (BFF → API `POST /auth/change-password`,
  technical-design §3.1). Success `200 { status:"password_changed" }` arrives
  with a rotated `sid` cookie the BFF relays — the user stays signed in here
  (technical-design D1). Errors: `400 current_password_invalid` (field
  `currentPassword`), `400 validation_failed` (field `newPassword`, or missing
  fields), `429 rate_limited`, `401 unauthenticated`.
- **Conformance:** pass — `card`/`field`/`input`/`button-primary`/
  `button-tertiary`/`inline-alert`/`link`, all design.md components themed by
  tokens; the password-help pattern is reused, not reinvented.

### default
Both password fields empty, "Change password" enabled. Enter submits. On submit
the button takes design.md's Actions **loading** affordance (spinner/label change
+ disabled) while the request is in flight; both inputs stay disabled-but-visible
so nothing the user typed disappears.

### success
On the `200`: clear both fields and show a success `inline-alert` at the top —
"Your password has been changed. You're still signed in on this device; any other
devices have been signed out." (voice §6; states the FR-AUTH-017 consequence in
plain language, and reassures about the rotation the user cannot see). The form
remains available; the "← Security & account" link is the natural exit. The user
is **not** bounced to `/signin` — the rotated cookie keeps this session alive
(D3).

### error
Three distinct failures, each preserving what the user typed (NFR-REL-004):
- **Wrong current password** (`400 current_password_invalid`, UC-006 alt 3a):
  the **Current password** `input` takes the error state (`--color-danger`
  border) with the `fields[].message` beneath it in `small` `--color-danger` —
  "That current password is incorrect." Focus returns to that field. The new
  password value is kept; nothing on the server changed.
- **New password fails the policy** (`400 validation_failed` field
  `newPassword`, UC-006 alt 3b): the **New password** `input` takes the error
  state with the server's specific requirement text (short, or too common) —
  same `fields[].message` rendering as SCR-WEB-001/006. (FR-AUTH-004,
  NFR-SEC-003.)
- **Rate-limited** (`429 rate_limited`): a warning `inline-alert` — "Too many
  attempts. Please wait a moment and try again." (NFR-SEC-006.)

Empty-field submits (`400 validation_failed` with `fields[]`) render on the named
field with the same treatment; the client may also block them on blur per the
validation convention, but the server response is authoritative.

### unauthenticated
`401 unauthenticated` on submit — the session was revoked while the form was
open (a password change or reset on another device, or expiry). The client routes
to `/signin` (SCR-WEB-004) rather than showing an inline error: there is nothing
actionable on a screen the user is no longer authenticated for (D4). This is a
supplementary state beyond the inventory's three, recorded as such in the
manifest.

- **Responsive notes:** the card is the full width of the content column below
  `md`; the two buttons stack (primary first) under `sm`, keeping 44px targets.
- **Decisions:** see cross-screen D3/D4 — the success-stays-signed-in treatment
  and the 401 redirect are the two real forks, both shared with the hub's zone
  behavior.

## Cross-screen decisions

- **D1 — Nested settings routes mirroring the IA:** `/settings/security` (hub) →
  `/settings/security/password` (form), matching ux-foundations' hierarchy
  (Settings → Security & Account → Change Password). Rejected: expanding the form
  inline on the hub — it would work for one row today, but SCR-WEB-015 is its own
  inventory screen with its own states, and FEAT-017/018 add siblings that each
  need to be addressable (and linkable from an email or a support answer). The
  flat public-auth routes (`/signin`, `/reset-password`) stay flat; the
  authenticated zone gets depth because its IA has depth.
- **D2 — Reachability via one sidebar nav item, extending SCR-WEB-007.** A
  `sidebar-nav-item` "Settings" is added to the shell's nav (above the
  sign-out control in the footer region), pointing at `/settings/security`.
  FEAT-004's manifest entry anticipated exactly this extension, so SCR-WEB-007's
  entry is updated rather than a new screen minted. Realized **text-only**: the
  design system specifies Lucide icons but no icon library is wired in the web app
  yet — the same carried deviation the sign-out control records (see Escalations).
  When FEAT-008 lands Profile & Preferences (SCR-WEB-013), "Settings" becomes a
  small section with two entries; nothing here blocks that.
- **D3 — Success keeps the user signed in and says so.** The endpoint rotates the
  caller's session instead of ending it (technical-design D1), so the screen's
  success state must not imply a sign-out; it names the part the user *should*
  care about — other devices were signed out — and stays put. Rejected: routing to
  `/signin` after success (would contradict UC-006's postcondition and punish the
  user for good hygiene).
- **D4 — `401` in the authenticated zone means redirect, not an inline error.**
  Both screens follow it: server-side on load (hub and form), client-side on
  submit (form). This is the first guarded-zone screen pair, so the convention is
  set here for FEAT-008 onward — it also matches why the API uses a distinct
  `current_password_invalid` code instead of `401` for a wrong current password
  (technical-design D3): a `401` must always be safe to read as "your session is
  gone".

## Escalations & open items

- **No design-system amendment.** Both screens compose from existing design.md
  components (`card`, `list-row`, `field`, `input`, `button-primary`,
  `button-tertiary`, `inline-alert`, `link`, `sidebar-nav-item`) themed by
  tokens; no off-system color, spacing, or pattern was needed.
- **Carried deviation (not new, not escalated): no icon library.** design.md §4
  specifies Lucide icons for nav items and controls; the web app has none wired,
  so the Settings nav item and the hub rows are realized text-only, consistent
  with the sign-out control (FEAT-004). When Lucide lands (a foundations task, not
  a feature one), these get their `Shield`/`KeyRound`/`ChevronRight` icons with no
  spec change. Recorded here so it stays visible rather than becoming folklore.
- **Hub rows deferred by design, not omitted:** Export data (SCR-WEB-016,
  FEAT-017) and Delete account (SCR-WEB-017, FEAT-018) use the same `list-row`
  pattern specified above; those features add their rows and their own manifest
  entries. SCR-WEB-014's entry will be updated (bindings stay empty; it remains a
  navigation surface).
- **Every state binding is to a contract that exists in this feature**
  (`POST /auth/change-password`) plus the already-live `GET /auth/session` used
  for the zone guard. No forward dependencies.
