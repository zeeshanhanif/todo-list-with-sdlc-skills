# UI Design: FEAT-009 — List management

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-007 (App Shell — lists sidebar), SCR-WEB-011 (Create/Edit List) · Mode: per-feature · Status: Draft · Date: 2026-07-27
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-009 turns the app shell's sidebar from placeholder text into the product's
**primary navigation**: the user's real lists, each with its active-task count,
plus the affordances to create, rename, reorder and delete them. Two screens are
in scope — SCR-WEB-007's third extension (after FEAT-004's sign-out control and
FEAT-006's Settings item) and SCR-WEB-011, a new dialog whose three inventory
states map one-to-one onto UC-008's create / rename / delete paths.

Both compose entirely from existing design.md primitives — **no new component,
no design-system amendment**. One long-standing gap *is* closed here: the shell's
responsive drawer (design.md §3), which becomes load-bearing the moment the
sidebar carries navigation rather than decoration (D3).

## SCR-WEB-007 — App Shell — lists sidebar

- **Strategy & source:** code-native (this section is the design). Extends the
  existing manifest entry (FEAT-004 → sign-out control; FEAT-006 → Settings
  item), as both of those entries anticipated. The shell renders at `/` and
  every authenticated route.
- **Purpose (ux-foundations):** "Sidebar + content + detail host" (inventory
  states: `loading`, `ready`). This extension realizes UC-008 main 1 (view lists
  with counts) and hosts the entry points for main 2–4.
- **Composition:** `app-shell` (§3) › `nav` sidebar, top to bottom:
  - **Smart views** — the existing `Today / Upcoming / Overdue` placeholders,
    untouched (FEAT-016 makes them real).
  - **Lists section** — a section header row: `caption` `--color-text-muted`
    label "Lists" + an `icon-button` "New list" (`aria-label="New list"`,
    text `+` until the icon library lands — see Escalations) opening SCR-WEB-011
    in its `create` state.
  - **One `sidebar-nav-item` per list**, in `position` order — the component
    design.md §4 specifies for exactly this ("icon + label + optional **count
    badge**; selected state uses `--color-primary-subtle` bg + `--color-primary`
    text + left accent bar"): list name (`body`, truncated with ellipsis at one
    line, full name as `title`) + a trailing count `badge` (`caption`,
    `--radius-full`, `--color-surface-sunken` bg + `--color-text-muted` text)
    carrying `activeTaskCount`. The badge is **omitted when the count is 0** —
    an empty list shows no "0", which is noise (D2).
  - **A per-row `dropdown-menu`** (`icon-button` "⋯", `aria-label="List actions:
    {name}"`, revealed on row hover/focus and always present on touch):
    **Rename** → SCR-WEB-011 `rename`; **Move up** / **Move down** (disabled at
    the ends); **Delete** (`--color-danger` text) → SCR-WEB-011 `delete-confirm`.
    The default (Inbox) list's menu shows **no Delete item at all** rather than a
    disabled one (D1).
  - **Settings** nav item and the sign-out control keep their existing footer
    placement (FEAT-004/FEAT-006).
  Rows are semantic `ul`/`li` inside `nav` (§5), 44px minimum height on touch,
  standard `focus-visible` ring, hover `--color-surface-sunken`.
- **Content & data mapping:** the shell resolves the session server-side
  (`GET /auth/session` via `lib/session.ts`) and fetches
  **`GET /api/lists` → `GET /lists`** (technical-design §3.1); rows ←
  `lists[]` in returned order, label ← `name`, badge ← `activeTaskCount`,
  Delete visibility ← `!isDefault`, menu order actions → **`POST /lists/reorder`**
  (§3.5) with the full reordered id vector. Create / rename / delete are
  SCR-WEB-011's bindings.
- **Conformance:** pass — `app-shell`, `sidebar-nav-item`, `badge`,
  `icon-button`, `dropdown-menu`, all design.md components themed by tokens. The
  count badge is the component's own documented slot, used as specified.

### loading
Server-rendered: the shell's list section arrives with its data, so there is no
client-side spinner in the common path. Where a client refetch is in flight
(after a create/rename/delete/reorder), rows keep their current content and the
section takes design.md's `skeleton` treatment only if the collection is not yet
known — never a blank sidebar (§4 data-view state conventions).

### ready
The populated state described above. **There is no `empty` state**: FR-LIST-003
guarantees every account has an Inbox, so the collection is never empty — a
deliberate absence, recorded in the manifest rather than invented.

### error
`GET /lists` failing leaves the lists section showing an `inline-alert`
(`--color-danger-subtle`) — "Couldn't load your lists." — with a "Retry"
`button-tertiary`. The rest of the shell (smart views, Settings, sign out) stays
operable: a data failure must not strand the user in a dead frame (§4). A `401`
in this zone redirects to `/signin` instead (FEAT-006 D4 convention, unchanged).

- **Responsive notes:** **≥ lg** — persistent 280px sidebar (`--sidebar-width`)
  + centered `--content-max` column. **< md** — the sidebar becomes a **full
  drawer** opened by a `hamburger` `icon-button` in a slim top bar, and the main
  column goes full-width, per design.md §3. This is newly implemented here (D3);
  the drawer is focus-trapped and Esc-closable like any overlay (§5), and
  selecting a row closes it. **md** — the design system permits an icon rail or a
  toggled drawer; the drawer is used at both sizes for one behavior instead of
  three.
- **Decisions:** D1, D2, D3 below.

## SCR-WEB-011 — Create/Edit List

- **Strategy & source:** code-native (this section is the design). A `dialog`
  over the current route — **not** a route of its own (D4).
- **Purpose (ux-foundations):** "Create, rename, delete a list (dialog)"
  (inventory states: `default`, `validation-error`, `delete-confirm`). Realizes
  UC-008 main 2–3 and 4, alt 3a, alt 4a, and exc-4b.
- **Composition:** design.md §4 `dialog / modal` — centered card, `--radius-lg`,
  `--shadow-lg`, `--color-overlay` scrim, focus-trapped, Esc + scrim-click to
  close, focus restored to the invoking control on close (§5). Two shapes behind
  one screen ID:
  - **Create / Rename** — `dialog` › title (`h3`: "New list" / "Rename list") ›
    `field`( **Name** — `input type=text`, `maxLength` from
    `LIST_NAME_MAX_LENGTH` (`@todo/shared`, so the client bound can never drift
    from the server rule — the constant-sharing convention SCR-WEB-001/015 set),
    autofocus; on rename, pre-filled with the current name and text selected ) ›
    `button-tertiary` "Cancel" + `button-primary` "Create list" / "Save".
    Enter submits.
  - **Delete** — design.md's **`confirm-dialog`**, which the system names for
    exactly this case ("Used for **delete list**, delete account, …"): title
    ("Delete "{name}"?"), body, `button-secondary` "Cancel" +
    `button-danger` "Delete list".
- **Content & data mapping:** create → **`POST /api/lists` → `POST /lists`**
  `{ name }`, `201 { list }` (technical-design §3.2); rename →
  **`PATCH /api/lists/{id}`** `{ name }`, `200 { list }` (§3.3); delete →
  **`DELETE /api/lists/{id}`**, `200 { status, deletedTaskCount }` (§3.4). The
  confirmation body reads `taskCount` from the row's `ListSummary` (§3 shared
  element) — the field the contract exposes for precisely this warning
  (technical-design D8). Errors: `400 validation_failed` (field `name`),
  `409 list_not_deletable`, `404 list_not_found`, `401 unauthenticated`.
- **Conformance:** pass — `dialog`, `confirm-dialog`, `field`, `input`,
  `button-primary`/`-secondary`/`-tertiary`/`-danger`, `inline-alert`,
  `toast`; all design.md components themed by tokens.

### default
Create: empty name field, "Create list" enabled (the server is authoritative on
emptiness — the client may also disable on blank per the validation convention).
Rename: pre-filled and selected, so typing replaces. On submit the primary button
takes the Actions **loading** affordance (spinner + disabled) while in flight;
the input stays disabled-but-visible so nothing typed disappears (NFR-REL-004).
On success the dialog closes and the sidebar reflects the change immediately
(the response carries the created/renamed `ListSummary`); no toast for create or
rename — the visible sidebar change *is* the feedback (§7 do's and don'ts, and
voice §6: don't narrate what the user can see).

### validation-error
`400 validation_failed` with `fields[].field = "name"` (UC-008 alt 3a): the
`input` takes the error state (`--color-danger` border) with the server's
message beneath it in `small` `--color-danger` — one error, under its field, per
design.md's validation convention. The dialog stays open with the typed value
intact and focus returned to the field. Empty / whitespace-only / over-length all
render identically; the client's `maxLength` makes the over-length case rare
rather than impossible (paste still reaches it).

### delete-confirm
The destructive path (NFR-USE-002, UC-008 alt 4a). Body, in the system's plain
voice (§6): **"This will permanently delete "{name}" and its {taskCount}
tasks. This can't be undone."** — with the sentence reduced to
**"This will permanently delete "{name}". This can't be undone."** when
`taskCount` is 0, since a warning about zero tasks is noise. No request is issued
until "Delete list" is pressed; Cancel and Esc close with nothing sent
(technical-design D8 — confirmation is a client obligation the contract supports,
not a server handshake). On success the dialog closes, the row disappears from
the sidebar, and a neutral `toast` confirms — "Deleted "{name}"" — the one place
a toast *is* warranted, because the evidence of the action is a thing that
vanished. **No Undo affordance:** the deletion is irreversible by design
(technical-design D4), and offering the task-delete undo-snackbar pattern here
would promise a restore that cannot happen.

Two error branches inside this state: `409 list_not_deletable` (a default list
reached the endpoint anyway — a client bug or a stale menu) renders a
`--color-danger-subtle` `inline-alert` in the dialog, "The Inbox list can't be
deleted."; `404 list_not_found` (deleted on another device) closes the dialog and
refetches the sidebar, which is the honest resolution — the user's goal is
already met.

- **Responsive notes:** the dialog is a centered card at `--content-max`-bounded
  width ≥ `sm`; below `sm` it spans the viewport with `--space-4` insets and the
  buttons stack (primary/destructive first), keeping 44px targets. When opened
  from the mobile drawer, the drawer closes first so the dialog is not stacked
  over a second overlay.
- **Decisions:** D4 below.

## Cross-screen decisions

- **D1 — The Inbox row omits Delete rather than disabling it.** Driver:
  FR-LIST-004 makes deletion of the default list impossible, and design.md's
  disabled treatment (45% opacity) is for *temporarily* unavailable actions —
  a permanently impossible one reads as a bug the user keeps prodding. Rename
  stays present, because FR-LIST-004 explicitly permits it. Rejected: a disabled
  item with a tooltip (explains a rule the user never needed to learn); hiding
  the whole menu on Inbox (rename would go with it). Consequence: `409
  list_not_deletable` is unreachable through the UI and exists as the
  server-authoritative backstop (FR-AUTHZ-005) — SCR-WEB-011 still renders it
  (above) rather than assuming the client is perfect.
- **D2 — The count badge is hidden at zero, not rendered as "0".** Driver:
  FR-LIST-005 requires the count be *shown*; a "0" badge on every empty list is
  visual noise on the product's densest, most-glanced surface, and the absence
  of a badge already reads as "nothing to do here". Rejected: always rendering
  the badge (noisier, and makes a real "1" harder to spot). Consequence: the
  count's *presence* carries meaning, so the badge must appear the instant the
  first task lands in a list (FEAT-010's concern, noted for it).
- **D3 — The shell's responsive drawer is implemented here rather than carried
  as debt again.** Driver: design.md §3 specifies it ("< md: sidebar becomes a
  full drawer (hamburger); main column is full-width"), FEAT-006 §8 recorded it
  as unbuilt (a ~115px content column at 390px) and named FEAT-009 as the
  natural owner. Until now the sidebar held placeholders; from this feature on it
  is the product's primary navigation *and* the only surface where lists can be
  managed, so the missing drawer stops being cosmetic debt and becomes a
  functional defect in this feature's own screens on mobile — **NFR-COMPAT-002**
  requires usability from 320px up, and UI-001 restates it. Rejected: deferring it again to a foundations task —
  the third deferral of a spec'd behavior on the surface this feature owns.
  Consequence: FEAT-009's shell work includes the drawer and its focus
  trap/Esc/close-on-select behavior; implementation should read this as part of
  realizing SCR-WEB-007's spec (technical-design T5), not as an extra.
- **D4 — SCR-WEB-011 is a dialog over the current route, with no URL of its
  own.** Driver: ux-foundations types the screen as "(dialog)" and its three
  states are momentary decisions taken *about a row the user is looking at*;
  putting them on routes would make browser-back a partially-completed rename and
  make a deep link to "delete this list" shareable, which is the last thing a
  destructive action needs. Rejected: `/lists/new` + `/lists/{id}/edit` routes
  (addressability nothing needs); an inline-editable sidebar row (no room for
  validation messaging at 280px, and no natural place for the confirm). Diverges
  deliberately from FEAT-006 D1's "authenticated zone gets depth" — that reasoning
  was about *destinations*; these are transient decisions.
- **D5 — Reorder is menu-driven (Move up / Move down), not drag-and-drop.**
  Driver: design.md §5 requires that "drag-reorder has a keyboard alternative
  (move up/down)", and §4 specifies a drag handle only on `task-row`, never on
  `sidebar-nav-item` — so the keyboard alternative is the *only* affordance the
  system actually specifies for lists. It is fully accessible, needs no drag
  library, and maps cleanly onto `POST /lists/reorder`'s full-vector contract
  (technical-design D2): each press sends the whole order with two entries
  swapped. Rejected: adding drag-and-drop now (a dependency and a keyboard
  fallback to build, for a **Should**-priority requirement — FR-LIST-008).
  Consequence: if drag is wanted later it is additive over the same endpoint,
  and the menu items remain as the required keyboard path.

## Escalations & open items

- **No design-system amendment.** Every element above is an existing design.md
  component used as specified — including `confirm-dialog`, which the system
  documents for "delete list" by name, and `sidebar-nav-item`'s count-badge slot.
  Nothing was forked, nothing off-token was needed.
- **Carried deviation (not new, not escalated): no icon library.** design.md §4
  specifies Lucide icons; none is wired in the web app, so the "New list", row
  "⋯" and hamburger controls are realized as text/glyph `icon-button`s with
  `aria-label`s — the same carried deviation FEAT-004's sign-out control and
  FEAT-006's Settings item record. This feature adds the **hamburger** to that
  list, which is the most icon-dependent control yet (a labelled text trigger is
  acceptable but visibly not the spec). Wiring Lucide remains a foundations task;
  when it lands, these get `Plus` / `MoreHorizontal` / `Menu` / `ChevronUp` /
  `ChevronDown` with no spec change.
- **`/`'s content column is an interim placeholder, not a screen.** SCR-WEB-008
  (List View) and SCR-WEB-018 (first-run / onboarding) are **FEAT-010's** and
  were deliberately not designed here (technical-design §8). Until then `/`
  renders a plain centered `card` — "Pick a list to see its tasks." — with no
  manifest entry, because it is scaffolding for one slice rather than a designed
  screen. Sidebar rows are correspondingly **not navigational** in this slice
  (no `/lists/{id}` route exists yet): a row's label is not a link, and the
  selected state is unused until FEAT-010 makes rows destinations. Flagged so
  acceptance does not read either absence as a gap.
- **Contract bindings are all to endpoints this feature defines**
  (`GET/POST /lists`, `PATCH/DELETE /lists/{id}`, `POST /lists/reorder`) plus the
  already-live `GET /auth/session` used for the zone guard. No forward
  dependencies.
- **For FEAT-010 (noted, not owed here):** D2 makes the count badge's *presence*
  meaningful, so creating the first task in a list must make the badge appear;
  and when rows become navigational, the `sidebar-nav-item` selected state
  (already specified in design.md) comes into use.
