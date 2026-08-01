# UI Design: FEAT-018 — Delete account (confirm + password re-entry)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-017 (Delete Account), SCR-WEB-014 (Settings — Security & Account, extension) · Mode: per-feature · Status: Draft · Date: 2026-08-01
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-018 adds the **third and last leaf** under the Security & Account hub, in
the shape SCR-WEB-015 and SCR-WEB-016 established: back link, `h1`, one `card`.
Both screens compose from existing design.md primitives — **no new component, no
design-system amendment**.

What makes this screen different from its two siblings is that it is the only
place in the product where a user destroys something they cannot get back. Three
things follow, and they are what the states below are actually about: the screen
must say plainly *what* disappears (not just "your account"), it must make the
irreversible step deliberate without making it tedious, and — hardest — it must
still be able to speak to the user in the instant **after** their session stops
existing.

## SCR-WEB-017 — Delete Account

- **Strategy & source:** code-native (this section is the design). Served at
  **`/settings/security/delete`** inside the app shell — the leaf route pattern
  `/settings/security/password` set (FEAT-006 D1) and `/settings/security/export`
  followed; an unresolved session redirects to `/signin` server-side (the
  guarded-zone convention, FEAT-006 ui-design D4).
- **Purpose (ux-foundations):** "Confirm + password re-entry + delete"
  (inventory states: `default`, `password-error`, `confirmed`). Realizes UC-016
  steps 1–5 and alternates 2a, 3a.
- **Composition:** `app-shell` (sidebar, `Settings` selected) › back `link`
  "← Security & account" › `h1` "Delete your account" › lead paragraph (`body`,
  `--color-text-muted`) › one `card` (`--color-surface`, 1px `--color-border`,
  `--radius-lg`, `--shadow-sm`, `--space-5` padding) holding, in order: a danger
  `inline-alert` (the permanence notice), a "What gets deleted" `ul`, an
  export-first `link`, the password `field`, and the `button-danger`
  **"Delete my account"**. The final step is a `confirm-dialog` over the screen
  (D1) — the component design.md §4 names for exactly this action.
- **Content & data mapping:**
  - `POST /account/delete` (technical-design §3.1) — body
    `{ currentPassword, confirm: true }`; the `confirm` literal is supplied by
    the dialog's confirm button, never by the page's submit (D2). Responses the
    screen renders: `200` → `confirmed`; `400 current_password_invalid` →
    `password-error`; `400 validation_failed` → the same field slot;
    `429 rate_limited` → `error` with the wait message; `401` → redirect to
    `/signin`; anything else → `error`.
  - `GET /lists` (FEAT-009's contract, cited in this feature's technical-design
    §5.2 / D8) — the counts in the alert and the dialog body:
    `lists.length` and the sum of `lists[].taskCount`. **`taskCount` includes
    soft-deleted tasks**, which is precisely correct here: they are destroyed
    too (D4).
- **Conformance:** pass — `card`, `inline-alert`, `field`, `input`,
  `button-danger`, `button-secondary`, `confirm-dialog`, `link`, `h1`, app-shell
  layout; all themed by tokens. No off-system colour, component or pattern;
  nothing escalated. Pairings measured in **both themes** before writing (D6
  carries the table).

### default

The card, top to bottom:

> ⚠ **This is permanent.** Deleting your account removes everything in it. We
> can't undo it, and we can't get it back for you.
>
> **What gets deleted**
> - **5 lists and 42 tasks** — including the ones you've deleted but not yet
>   purged
> - Your account details — email, display name, timezone and theme
> - Every device you're signed in on will be signed out
>
> Want a copy first? **Export your data** →
>
> **Confirm your password**
> [ password input ]
> We ask for it because this can't be undone.
>
> [ **Delete my account** ]

- The permanence notice is an `inline-alert`, danger variant:
  `--color-danger-subtle` background, text `--color-danger-text` — **never**
  `--color-danger` on that tint (§2's pairing rule; DEF-006 fixed seven shipped
  instances of exactly that mistake). It carries an icon as well as colour
  (design.md §7: never convey meaning by colour alone).
- The counts line renders `--color-text` (not muted) so the number is the most
  legible thing in the list. While `GET /lists` is in flight the line reads
  "Loading what's in your account…"; if that request *fails*, the line degrades
  to "your lists and tasks" — a failed count must never block the delete path
  or, worse, imply the account is empty (D5).
- "Export your data →" is a `link` to `/settings/security/export` (SCR-WEB-016).
  It is here because the product has no import path (FEAT-017 §8 watch item 3):
  the export is the only copy a user can ever hold, and the moment before
  deletion is the last moment it can be made.
- The password `field` is the standard form composition — label (`caption`,
  `--color-text`), `input type="password"` with `autoComplete="current-password"`,
  help line (`small`, `--color-text-muted`) — matching SCR-WEB-015's treatment
  so a signed-in password re-entry looks the same everywhere in the product.
- **"Delete my account"** is `button-danger` (`--color-danger` fill, white text,
  4.5:1 per §2). It does **not** submit: it validates the field and opens the
  dialog. An empty field skips the dialog entirely and shows the field error
  "Enter your password to continue" — a destructive confirmation must never be
  raised for a request that is already going to fail.

**The confirm-dialog** (design.md §4 `confirm-dialog`, `dialog` shell: centered
card, `--radius-lg`, `--shadow-lg`, `--color-overlay` scrim, focus-trapped, Esc
and scrim-click close):

> **Delete your account?**
> This permanently deletes your account, **5 lists and 42 tasks**. It can't be
> undone.
>
> [ Cancel ] [ **Yes, delete everything** ]

Cancel is `button-secondary` and **holds initial focus** (D3). Confirm is
`button-danger` and is what sends `confirm: true`. Cancel, Esc and the scrim all
close the dialog with nothing sent (UC-016 alt 2a), restoring focus to the
"Delete my account" button.

### deleting

*(state supplement — see D7.)* The dialog stays open; its confirm button enters
design.md §4's button loading state (spinner in-button, disabled), Cancel
disables with it, and Esc/scrim-close are suspended for the duration. Nothing
else on the screen changes. The window is short, but it must exist: without it a
second click could fire a second `POST /account/delete`, whose only possible
answer is a `401` that would look to the user like the deletion failed.

### password-error

The `400 current_password_invalid` path (UC-016 alt 3a). The dialog **closes**
— the destructive confirmation is spent and must be re-earned — and the error
lands on the field it belongs to, per design.md's validation convention (one
error per field, beneath it):

> [ password input, border `--color-danger` ]
> That password doesn't match. **Nothing has been deleted.**

`--color-danger` `small` on the card's `--color-surface` (4.8:1 light / 6.2:1
dark). Focus returns to the password input, which is `aria-describedby` the
error. The typed value is preserved, not cleared — the same choice SCR-WEB-015
made (NFR-REL-004), and the correction is usually one character.

The second sentence is not padding. This is the one screen where a user who
sees an error has to wonder whether they half-destroyed their account; the
answer is in the same breath as the error.

### error

*(state supplement — see D7.)* Network failure, `500`, or `429 rate_limited`.
The dialog closes and a form-level danger `inline-alert` appears at the top of
the card (design.md's form-level error convention), above the permanence notice:

- Network / `500` → "Couldn't delete your account just now. **Nothing has been
  deleted** — try again." with a "Try again" `button-tertiary` that re-opens the
  dialog with the password still filled.
- `429` → "Too many attempts. Wait a moment and try again." (the wait comes from
  the envelope's `retryAfterSeconds`, rendered the way FEAT-003's screens
  already render it).

Same tint pairing as the permanence notice: `--color-danger-subtle` +
`--color-danger-text`.

### confirmed

The terminal state, and the constraint that shapes the whole screen: it renders
**from client state, with no navigation and no server round-trip** — by the time
it appears the session no longer exists, so a `router.refresh()` or a push to any
authenticated route would resolve no session and replace this message with the
sign-in form (technical-design D10, AC-17).

The card's entire contents are replaced by:

> **Your account has been deleted**
> Your lists, your tasks and your account details have been permanently removed.
> **you@example.com** is free to use for a new account whenever you like.
>
> [ Go to sign in ]

- The panel is neutral — plain `card`, `h2` in `--color-text`, body in
  `--color-text-muted` — deliberately **not** the success tint. The user did not
  achieve something; they finished something. A green "success" chip on the
  removal of someone's data reads as tone-deaf.
- The address comes from the session the server already resolved when it
  rendered the page (`requireSession().email`), passed to the island as a prop —
  no post-deletion read exists, and none is needed.
- "Go to sign in" is `button-primary` → `/signin`. It is the only affordance;
  the surrounding shell's nav is now stale and every one of its links resolves
  to the same redirect (recorded as an open item below).
- The panel is a `role="status"` `aria-live="polite"` region so the transition is
  announced, not merely drawn — the same reasoning as SCR-WEB-016's `ready`
  state (FEAT-017 D2).

- **Responsive notes:** the card is full-width below `md` (design.md §3's
  breakpoints), as the sibling settings leaves are. The dialog is
  `min(90vw, 420px)` — the width `ListDialog` already ships. Both dialog buttons
  are ≥ 44px tall and stack full-width below `sm`, so the destructive button is
  never a thumb-slip from Cancel; on wider viewports they sit right-aligned with
  Cancel first. Any icon-only control is ≥ 44×44 at a coarse pointer (DEF-011's
  rule).
- **Decisions:** D1–D7 below (all are cross-screen or screen-local to this one;
  kept together rather than split).

## SCR-WEB-014 — Settings — Security & Account (this feature's extension)

- **Strategy & source:** **registered** — this screen already has a manifest
  entry (`FEAT-006`, code-native, spec at
  `features/FEAT-006-change-password/ui-design.md#scr-web-014--settings--security--account`),
  extended by FEAT-008 (settings sub-nav) and FEAT-017 (the Export row). This
  section is the **delta spec** only; the base spec and both prior extensions
  stand unchanged.
- **What changes:** one additional generic `list-row` in the existing `card` —
  **third and last**, the position the base spec and FEAT-017's extension both
  reserved for it:

  > **Delete account** — help: "Permanently delete your account and everything
  > in it."
  > → `/settings/security/delete` (SCR-WEB-017)

  Same row treatment as its two siblings: label (`body`, `--color-text`) over one
  line of help (`small`, `--color-text-muted`), a real `<Link>` covering the full
  row, 1px `--color-border` top rule, hover `--color-surface-sunken`, 44px
  minimum height, standard focus ring.
- **How it is marked destructive** (D6): a leading `Trash2` (Lucide) icon in
  `--color-danger`, plus the copy, plus last position — **not** a red label.
  Colour alone never carries the meaning (design.md §7), and the label token
  stays `--color-text` for a measured reason: `--color-danger` on
  `--color-surface-sunken` — which is what the row's own hover state puts behind
  it — measures **4.41:1**, under §5's 4.5:1. The icon is a UI graphic and needs
  ≥ 3:1, which it clears in every state and both themes (4.4:1 / 6.5:1 hovered).
- **Order:** Change password → Export data → Delete account. Least to most
  consequential, top to bottom; the irreversible action is last, and the row
  above it is the one that lets a user keep their data first.
- **Content & data mapping:** unchanged — the hub stays pure navigation and
  consumes no endpoint, so it still has no loading / empty / error states (not
  gaps).
- **Conformance:** pass — no new component; the row pattern is the one already
  registered for this screen, plus an icon slot that composes within it.

### default
The card now renders three rows instead of two. Nothing else on the screen moves.

## Cross-screen decisions

**D1 — SCR-WEB-017 *does* get a `confirm-dialog` — the deliberate opposite of
FEAT-017 D1.**
*Decision:* the final step is a modal confirmation over the screen.
*Driver:* design.md §4 scopes `confirm-dialog` to destructive actions and names
**"delete account"** explicitly; NFR-USE-002 requires explicit confirmation for
destructive actions; FR-DATA-004 requires it of the system. FEAT-017 refused a
dialog for the export precisely so that this one still means something — a
product that asks "are you sure?" before harmless actions has trained its users
to click through the one that matters.
*Rejected:* page-only confirmation (the button press alone), which would make the
export and the deletion feel identically weighty.

**D2 — the password is entered on the page; the dialog is a pure yes/no.**
*Decision:* the `field` lives in the card; the dialog carries only title, body and
two buttons, and contributes the `confirm: true` literal.
*Driver:* FR-DATA-004 asks for two distinct things — password re-entry *and*
explicit confirmation — and this composition gives each its own moment. It also
keeps `confirm-dialog` exactly as design.md defines it: "title, body,
`button-secondary` cancel + `button-danger` confirm". A password input inside the
dialog would be a new variant of a system component, i.e. a fork, for no gain.
*Rejected:* password-in-dialog (forks the component; also puts a text field
behind a focus trap in the one flow where a password manager is most likely to
be involved).

**D3 — the dialog opens with focus on Cancel, not Confirm.**
*Decision:* initial focus is the `button-secondary`.
*Driver:* `ListDialog`'s delete mode focuses Confirm, which is right for deleting
a list (recoverable in effect, small in blast radius). Here a stray Enter — the
key the user just pressed to submit a password field — would destroy the account.
The extra Tab is the cheapest safety this screen can buy.
*Consequence:* a deliberate, recorded divergence from the existing dialog's
behaviour, not an inconsistency to be "fixed" later.

**D4 — the counts include soft-deleted tasks, and the copy says so.**
*Decision:* the number shown is `ListSummary.taskCount` summed — which counts
soft-deleted tasks — with the phrase "including the ones you've deleted but not
yet purged".
*Driver:* those rows really are destroyed (technical-design §4), and FEAT-013's
30-day restore window means some users have tasks alive in exactly that state.
A count that quietly excluded them would understate the loss on the one screen
that exists to state it accurately. Note the deliberate contrast with
SCR-WEB-016, whose export *excludes* them and says so for the same reason.
*Rejected:* `activeTaskCount` (understates); a new counts endpoint
(technical-design D8 rejects it).

**D5 — a failed count degrades the copy; it never blocks the action.**
*Decision:* if `GET /lists` fails, the alert reads "your lists and tasks" instead
of numbers, and everything else works.
*Driver:* the counts are an aid to informed consent (FR-DATA-006), not a
precondition of it. A user who cannot load a number is not thereby forbidden from
deleting their account — and rendering "0 lists and 0 tasks" from a failed
request would be the worst possible outcome: a warning that understates the loss.

**D6 — the hub's destructive row is marked by icon, copy and position, not by a
red label.**
*Decision:* `Trash2` in `--color-danger` beside a `--color-text` label.
*Driver:* measured, in both themes — `--color-danger` on `--color-surface`
is 4.8:1 (light) / 6.2:1 (dark) and would pass at rest, but the row's hover
state is `--color-surface-sunken`, where it drops to **4.41:1** (light), under
§5's 4.5:1. That is the same family as the rule design.md §2 already states for
`--color-text-muted` on the sunken tint. An icon is a UI graphic at ≥ 3:1 and
clears every state. Also design.md §7: never colour alone.
*Consequence:* recorded as an open item toward ux-foundations below — the stated
rule covers `--color-text-muted` only, and the next screen to reach for a danger
label on a hoverable row will hit the same 4.41:1.

**D7 — `deleting` and `error` are state supplements, recorded not escalated.**
*Decision:* the inventory's three states (`default`, `password-error`,
`confirmed`) describe the happy path plus one alternate; the screen also needs an
in-flight state and a non-password failure state, and both are recorded in the
manifest's `covered` list with this note.
*Driver:* neither introduces anything new — `deleting` is design.md §4's button
loading state, `error` is its form-level inline-alert convention, which NFR-USE-003
requires of any screen consuming an endpoint. The same call FEAT-017 made for
SCR-WEB-016's `error`.

**Measured pairings** (both themes, composited — the discipline DEF-012 forced):

| Pairing | Light | Dark | Rule |
| :-- | :-- | :-- | :-- |
| `--color-danger-text` on `--color-danger-subtle` (alerts) | 6.8:1 | 7.8:1 | §5 ≥ 4.5:1 ✓ |
| `--color-danger` `small` on `--color-surface` (field error) | 4.8:1 | 6.2:1 | §5 ≥ 4.5:1 ✓ |
| white on `--color-danger` fill (`button-danger`) | 4.5:1 | per §2 ✓ | §5 ≥ 4.5:1 ✓ |
| `--color-danger` icon on `--color-surface-sunken` (hovered row) | 4.4:1 | 6.5:1 | §5 ≥ 3:1 (graphic) ✓ |
| ~~`--color-danger` *text* on `--color-surface-sunken`~~ | **4.41:1** | 6.5:1 | §5 ≥ 4.5:1 ✗ light — **not used**, see D6 |

**Settings leaf shape, inherited not re-decided:** back link + `h1` + card, no
`SettingsNav` sub-nav (that belongs to the two settings *sections*, not their
leaves) — the shape `/settings/security/password` and `/settings/security/export`
already ship.

## Escalations & open items

**Design-system amendments filed:** none. Both screens compose from existing
design.md components and tokens; every pairing used was measured against §5 in
both themes and passes.

**Proposed clarification toward ux-foundations (non-blocking, no screen waits on
it):** design.md §2's sunken-tint rule is stated for `--color-text-muted` only —
"Text that sits on the sunken tint (chip backgrounds, inset wells, hovered rows)
takes `--color-text`." The measurement in D6 shows `--color-danger` fails the same
way in light (**4.41:1** on `--color-surface-sunken`), and `--color-danger-text`
is not a candidate either, since it is a tint partner rather than a
surface-colour. Suggested wording change: extend the rule from
`--color-text-muted` to *any* semantic text colour on the sunken tint, or state
plainly that a hoverable row's label is always `--color-text`. This feature needs
no such amendment — D6 designs around it — but the next feature to want a red
label on a row will not think to measure the hover state.

**Open items** (recorded, not actioned):

1. **The shell behind the `confirmed` state is stale.** After deletion the
   sidebar, the settings sub-nav and the back link are all still rendered from
   the pre-deletion server render, and every one of them now leads to `/signin`.
   The panel's single `button-primary` is the intended exit and the redirect is
   correct rather than broken — but a user who clicks "Lists" gets a sign-in
   screen with no explanation. Fixing it properly means the shell learning that
   the session ended, which is a shell concern (SCR-WEB-007) and not FEAT-018's
   to invent.
2. **Password managers may re-offer the deleted credential.** Nothing in the
   product can clear a browser's saved password, so a user who deletes their
   account and re-registers with the same address will likely be offered the old
   password. Out of scope, worth knowing when reading bug reports.
3. **No undo, anywhere in this flow.** Cancel and Esc are the only reversals, and
   they exist only before the confirm click. That is the requirement
   (FR-DATA-003: irreversible, no grace period), and the copy says so three
   times — alert, dialog, confirmation — because it is the single most important
   fact on the screen.
