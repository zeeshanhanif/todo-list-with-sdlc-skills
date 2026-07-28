# UI Design: FEAT-010 — Create task + list view

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-008 (List View), SCR-WEB-018 (First-run / Onboarding), SCR-WEB-007 (sidebar rows become navigational) · Mode: per-feature · Status: Draft · Date: 2026-07-27
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

The product's main working surface. SCR-WEB-008 is the screen users will spend
their time in; SCR-WEB-018 is the first thing a new account sees. They are one
component with two empty-state variants (D1), which is why they are designed
together, and they finally give the app shell a content column instead of
FEAT-009's placeholder.

The honest constraint shaping every decision below: **this slice has titles and
nothing else.** Completion (FEAT-012), due dates and priority (FEAT-011),
deletion (FEAT-013) and manual ordering (FEAT-014) each own a piece of
design.md's `task-row` and `quick-add` specs. The rule applied throughout is
**render what the slice can actually do, omit what it can't** — a control that
looks live but isn't is worse than an absent one (D2). No design-system
amendment is needed; the components are used as specified, with parts that have
no data yet left out rather than faked.

## SCR-WEB-008 — List View

- **Strategy & source:** code-native (this section is the design). Served at
  **`/lists/{id}`**, and at **`/`** for the caller's default list
  (technical-design D2) — one component, two routes.
- **Purpose (ux-foundations):** "Tasks within a selected list + quick-add"
  (inventory states: `loading`, `empty`, `populated`, `error`). Realizes UC-009
  main 1/3/4 and alt 3a; UC-010/011/012 attach to this screen with FEAT-011/012/013.
- **Composition:** `app-shell` (sidebar + main column, `--size-content-max`
  centered) › main column:
  - **Header** — `h1` with the list name (`--font-size-h1`, `--color-text`), and
    beneath it a `small` `--color-text-muted` line with the active count
    ("3 tasks left" / "1 task left" / omitted at zero, since the empty state
    already says it).
  - **`quick-add`** — the persistent single-line composer design.md specifies,
    directly under the header: `input` (`--size-control-md`, placeholder "Add a
    task…") + `button-primary` "Add task". Enter submits (design.md §5: "Enter
    creates a task"). **Title-only in this slice** — the due-date and priority
    affordances design.md's `quick-add` also specifies arrive with FEAT-011
    (technical-design D6). Autofocused on the list view so AC-11's "one field,
    one action" holds.
  - **Active section** — a `list` of **`task-row`**s. In this slice a row is the
    title (`body`, `--color-text`) in a 44px-minimum row with a
    `--color-surface-sunken` hover and the standard focus ring; the
    complete-`checkbox`, due-date `chip`, priority dot and drag handle are
    omitted, each landing with the feature that makes it real (D2). Rows are
    semantic `ul`/`li`. Not yet clickable — SCR-WEB-010 (task detail) is
    FEAT-011's.
  - **Completed section** — the same rows, muted and struck through
    (design.md's `task-row`: "strikethrough + muted when completed"), under a
    `caption` heading "Completed". **Rendered only when it has rows** (D3).
  - No `card` wrapper around the sections: design.md reserves `card` for
    contained surfaces, and a full-column task list is the page's primary
    content, not an inset panel.
- **Content & data mapping:** the page fetches
  **`GET /api/lists/{id}/tasks` → `GET /lists/{listId}/tasks`**
  (technical-design §3.1) server-side; header ← `list.name` and
  `list.activeTaskCount`; active rows ← `active[]`; completed rows ←
  `completed[]`; each row's label ← `task.title`. The composer submits
  **`POST /api/lists/{id}/tasks`** `{ title }` → `201 { task }` (§3.2), after
  which the view re-renders from the server so the new row appears **last** in
  the active section (technical-design D4) and the sidebar badge increments.
  Errors: `400 validation_failed` (field `title`), `404 list_not_found`,
  `401 unauthenticated`.
- **Conformance:** pass — `app-shell`, `quick-add`, `task-row`, `list`,
  `inline-alert`, `button-primary`, `input`, all design.md components themed by
  tokens. The `task-row` subset is a deliberate partial realization of a
  specified component (D2), not a fork of it: no element is restyled, only
  deferred.

### loading
Server-rendered with its data, like SCR-WEB-007's sidebar — no spinner in the
common path, no layout shift. design.md's skeleton-rows convention applies only
where a client-side fetch could leave the section unknown, which this slice
does not create; recorded honestly rather than claimed as a rendered state.

### populated
The state described above: header, composer, active rows in append order, and
the completed section when non-empty.

### empty
A list with no tasks. design.md's empty convention — centered icon/illustration
slot + `h3` headline + one-line playful subtext + a primary action — with copy
per §6's voice: **"Nothing here yet"** / "Add your first task and get rolling."
The composer above stays present and focused, so the empty state's primary
action is the composer itself rather than a second competing control (D4).
When the account is new, this state is replaced by **SCR-WEB-018** (D1).

### error
The fetch failed: an `inline-alert` (`--color-danger-subtle`) in the content
column — "Couldn't load this list." — with a "Retry" `button-tertiary`. The
shell, its sidebar and the composer stay operable; a data failure never strands
the frame (NFR-USE-003). A `401` redirects to `/signin` instead (the
authenticated-zone convention FEAT-006 D4 set). A **submit** failure keeps the
typed title in the composer (NFR-REL-004) and shows the `title` field error
beneath it per design.md's validation convention.

### not-found
`/lists/{id}` for an id that is unknown **or** owned by someone else — the API
answers one uniform `404 list_not_found` (technical-design §3.1), and the screen
must not reveal which. An `inline-alert` in the content column: "That list
doesn't exist." plus a `link` back to the default list. **This is a supplementary
state beyond the inventory's four**, recorded as such in the manifest, and it is
deliberately *not* a route-level 404 page: SCR-WEB-019 (Error / Not Found) is an
unminted system screen (§escalations), and the shell with its sidebar is the more
useful place to land.

- **Responsive notes:** inherits the shell — below `md` the sidebar is the drawer
  FEAT-009 built and the content column is full-width. design.md §3 specifies a
  **bottom-anchored quick-add on mobile**; this slice keeps the composer under the
  header at every width (D5). Rows keep the 44px touch minimum; the header
  truncates a long list name to one line with the full name as `title`.
- **Decisions:** D2, D3, D4, D5 below.

## SCR-WEB-018 — First-run / Onboarding

- **Strategy & source:** code-native (this section is the design). Not a route of
  its own: it is the state SCR-WEB-008 renders at `/` for a brand-new account
  (D1).
- **Purpose (ux-foundations):** "New account with only Inbox — encourage first
  task" (inventory state: `default (empty)`). Realizes the tail of UC-001 and the
  head of UC-009 — the moment a verified user arrives with nothing.
- **Composition:** the same SCR-WEB-008 frame — header, composer, and in place of
  the task sections the empty treatment, with **first-run copy** rather than the
  generic one: `h3` **"Welcome — let's get you started"** + subtext "Add your
  first task below. Everything lands in Inbox unless you pick another list." The
  composer is autofocused, so the encouraged action is one keystroke away, which
  is what makes NFR-USE-001's two-minute target realistic (technical-design AC-11).
- **Trigger condition (precise, so implementation doesn't guess):** the caller
  has **exactly one list** (`GET /lists` returns a single `isDefault` entry) **and**
  it has no tasks. Any other empty list — including the Inbox once a second list
  exists — gets SCR-WEB-008's generic `empty` state. First-run is about the
  *account*, not the list (D1).
- **Content & data mapping:** same bindings as SCR-WEB-008 — `GET
  /lists/{id}/tasks` for the (empty) sections, `POST /lists/{id}/tasks` for the
  first task. No endpoint of its own.
- **Conformance:** pass — the `empty` data-view convention (§4) with first-run
  copy per the §6 voice; no new component.

### default (empty)
The state described above. On the first successful create it becomes
SCR-WEB-008's `populated` state with one row — the transition *is* the
onboarding's completion, and nothing needs dismissing.

- **Responsive notes:** as SCR-WEB-008.
- **Decisions:** D1 below.

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry** (its
  fourth extension — FEAT-004 sign-out, FEAT-006 Settings, FEAT-009 lists, and
  now navigation). The full sidebar spec stays at
  `features/FEAT-009-lists/ui-design.md#scr-web-007--app-shell--lists-sidebar`;
  this section records only the delta.
- **Delta:** sidebar list rows become **links** to `/lists/{id}` and gain the
  `sidebar-nav-item` **selected** state design.md already specifies
  (`--color-primary-subtle` background + `--color-primary` text + left accent
  bar) for the open list, with `aria-current="page"`. FEAT-009's ui-design
  recorded both as this feature's to take up. The row menu, the count badge and
  its hidden-at-zero rule (FEAT-009 D2) are unchanged — and the badge now moves
  on its own, since creating a task is finally possible.
  On mobile the drawer closes when a row is followed, as it already does for the
  Settings item.
- **Content & data mapping:** unchanged (`GET /lists`, `POST /lists/reorder`);
  the selected state derives from the active route, not from a new field.
- **Conformance:** pass — the selected treatment is design.md's own, used for the
  first time as specified.

## Cross-screen decisions

- **D1 — SCR-WEB-018 is a variant of SCR-WEB-008's empty state, not a separate
  screen.** Driver: ux-foundations types it as "New account with only Inbox —
  encourage first task" with a single `default (empty)` state, and its trace
  (UC-001/009) is the seam between arriving and acting — not a distinct
  destination. `/` already renders the default list (technical-design D2), so a
  separate route would duplicate the frame to change two lines of copy. Rejected:
  a dedicated `/welcome` route (a screen to dismiss, and a redirect to maintain
  forever); showing first-run copy on *any* empty list (the user who empties their
  Groceries list is not a new user). Consequence: the trigger condition above is
  explicit and testable, and both entries stay in the manifest with distinct
  states.
- **D2 — `task-row` renders only the parts this slice can honour.** Driver:
  design.md's `task-row` is complete-checkbox + title + due chip + priority dot +
  drag handle, and in FEAT-010 exactly one of those has data or behaviour behind
  it. A checkbox that does not complete anything, or a priority dot that is always
  "None", teaches the user something false and would have to be un-taught next
  slice. Rejected: rendering a disabled checkbox with a tooltip (explains an
  implementation schedule to a user); rendering the full row against placeholder
  values (a UI that lies about stored data — the presentation analog of
  technical-design D5). Consequence: FEAT-011/012/013/014 each **add** to this
  row rather than reworking it, and the manifest entry for SCR-WEB-008 records
  the deferred parts explicitly so acceptance reads them as scheduled, not
  missing.
- **D3 — The completed section renders only when it has rows.** Driver:
  FR-TASK-003 requires active and completed to be *separated*, which the contract
  does (`active[]` / `completed[]`); FR-TASK-011's collapsed presentation belongs
  to FEAT-012, which is also the feature that first makes a task completable. An
  always-present "Completed (0)" heading in this slice would be a section no user
  action can fill. Rejected: rendering an empty collapsed section now (dead
  furniture); omitting the section from the design entirely (it would then be
  unspecified when FEAT-012 needs it — the spec above is what FEAT-012 collapses).
  Consequence: the section is designed and implemented but invisible until a task
  is completed, which in this slice only a seeded fixture can do — exactly what
  technical-design AC-3 tests.
- **D4 — The composer *is* the empty state's primary action.** Driver: design.md's
  empty convention asks for "a primary action (e.g., 'Add your first task')", and
  the composer sitting directly above already is that control, focused. A second
  button that only moves focus to the composer adds a step and a thing to look at.
  Rejected: an "Add your first task" `button-primary` inside the empty block
  (duplicate affordance); hiding the composer when empty and showing only the
  button (the fastest path — type and press Enter — would then require a click
  first, working against NFR-USE-001). Consequence: the empty block is copy and
  illustration only; its "action" is the caret already blinking above it.
- **D5 — The composer stays under the header at every width; the mobile
  bottom-anchored variant is deferred.** Driver: design.md §3 specifies a
  bottom-anchored quick-add below `md`, which is a genuinely better mobile
  pattern — and also a fixed-position element that must coexist with FEAT-013's
  undo-snackbar (a `toast`, bottom-anchored) and FEAT-012's completion feedback,
  none of which exist yet. Building it now means designing that stacking against
  components that aren't specified. Rejected: implementing the bottom-anchored
  composer now (a layout decision made against imagined neighbours); silently
  dropping the requirement (design.md would rot). Consequence: an **honest gap
  recorded in the manifest** for SCR-WEB-008's responsive behaviour, to be closed
  by FEAT-013 at the latest, when the bottom-anchored region has all its tenants.
  Every other responsive rule (drawer, full-width column, touch targets) is met.

## Escalations & open items

- **No design-system amendment.** Every element is an existing design.md
  component used as specified — `quick-add`, `task-row` (partially realized per
  D2), the empty/error data-view conventions, `sidebar-nav-item`'s selected
  state, `inline-alert`, `button-primary`. Nothing off-token, nothing forked.
- **Recorded gap — the mobile bottom-anchored composer (D5).** design.md §3
  specifies it; this slice does not build it. Recorded in SCR-WEB-008's manifest
  entry as a state/responsive gap rather than glossed. Owner: FEAT-013 (or a
  foundations pass), when the bottom region's other occupants exist.
- **Carried deviation (not new, not escalated): no icon library.** design.md
  specifies Lucide throughout; none is wired, so the empty state's illustration
  slot renders as a typographic mark and the composer's button is text-only —
  the same carried deviation FEAT-004/006/009 record. The empty-state
  illustration is the most visible instance yet.
- **SCR-WEB-019 (Error / Not Found) remains unminted.** The inventory lists it as
  a system screen; the plan assigns it to the foundations shell (§2), and no
  feature owns it. FEAT-010 needs a not-found presentation *today* for
  `/lists/{id}`, so it specifies an in-shell state (above) rather than inventing
  the system screen. When SCR-WEB-019 is designed, this state should be
  re-checked against it — it may become a redirect. Flagged, not resolved.
- **Deferred to their owning features, by design:** the complete-checkbox
  (FEAT-012), due-date chip and priority dot (FEAT-011), row click → SCR-WEB-010
  detail (FEAT-011), drag handle (FEAT-014), undo-snackbar (FEAT-013), and the
  collapsed completed section (FEAT-012, FR-TASK-011). All are parts of components
  specified in design.md, listed here so the next features extend rather than
  rediscover.
- **Every binding is to a contract this feature defines** (`GET`/`POST
  /lists/{listId}/tasks`) plus the already-live `GET /lists`. No forward
  dependencies.
