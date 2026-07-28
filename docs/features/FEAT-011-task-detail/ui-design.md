# UI Design: FEAT-011 — Task detail (title, due date, priority, overdue)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-010 (Task Detail — **new**), SCR-WEB-008 (List View — `task-row`
> and `quick-add` extensions), SCR-WEB-007 (App Shell — the detail host) ·
> Mode: per-feature · Status: Draft · Date: 2026-07-28
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

This feature mints the screen ux-foundations has listed since the inventory was
written and no feature has yet owned: **SCR-WEB-010, Task Detail** — the
"detail host" the app shell was specified to have. It also closes three of the
four `task-row` deferrals FEAT-010 recorded (due-date chip and priority dot;
row-click to detail) and brings `quick-add` to its full design.md form.

Where FEAT-010's shaping constraint was *"this slice has titles and nothing
else"*, this one's is the opposite and easier: every control specified below has
real data and a real contract behind it. The two rules carried forward from
FEAT-010 D2 still apply — **render what the slice can honour, omit what it
can't** — so the complete-`checkbox` (FEAT-012), the drag handle (FEAT-014) and
the delete action (FEAT-013) stay absent from the detail panel, and the **list
picker design.md's `task-detail-panel` spec lists is deliberately not built**,
because no requirement gives a task a way to change lists and the contract
rejects it (technical-design §8).

**One design-system escalation was filed and has since been accepted and landed**
(`--color-danger-text`, §Escalations). It was not cosmetic: the overdue chip is
the first component in the product to need design.md's "tinted bg + matching text
token" in the danger colour, and the only pairing the token set could produce
measured **3.95:1** against the **4.5:1** the system's own §5 requires at
`caption` size. The screens below are specified against the amended system.

## SCR-WEB-010 — Task Detail

- **Strategy & source:** code-native (this section is the design). **New entry**
  — the screen has existed in the inventory since ux-foundations and is minted
  here. Served at **`/tasks/{id}`** (technical-design §5): a real, deep-linkable
  URL, because a detail view users open, refresh, bookmark and share must have
  one.
- **Purpose (ux-foundations):** "View/edit a task (panel / full-screen)"
  (inventory states: `loading`, `viewing`, `editing`, `error`). Realizes UC-010
  main 1–3 and alternates 2a/3a. *(The inventory also tags this screen UC-004
  (Sign out) — a source typo already recorded by FEAT-004's design and the
  SCR-WEB-007 manifest note; it is not served here. §Escalations.)*
- **Presentation (design.md §3, followed exactly):** the shell's **detail host**
  — at **≥ lg** a right slide-in panel of `--size-detail-panel-width` (420px)
  beside the list column, `--shadow-md`, radius `--radius-lg`; at **md** the same
  panel as an overlay; **< md** full-screen. Opening it never unmounts the list
  behind it. Direct navigation to `/tasks/{id}` renders the same content
  standalone within the shell (D1).
- **Composition:** `app-shell` › detail host ›
  - **Header row** — a back/close `icon-button` (`aria-label="Close task"`; Esc
    closes, design.md §5) and, at `< md`, the screen title slot. Focus is
    restored to the originating `task-row` on close.
  - **Title** — an `input` styled at `body-lg` (design.md's typography table
    assigns body-lg to "Task title in detail"), full width, label associated via
    `field`. Editable in place (D2).
  - **Metadata block** — a stack of three `field`-labelled rows, `--space-4` gap:
    - **List** — `caption` label "List", value as `body` text with the list name.
      **Read-only** (D3), not a `list-picker`.
    - **Due date** — `caption` label "Due", the **`due-date-picker`**: a
      `button-secondary` trigger showing the human-friendly date (design.md §6:
      "Today", "Tomorrow", "Fri", "Mar 3") or the placeholder "No due date",
      opening a `popover` calendar + time with a **"Clear"** `button-tertiary`
      (the component spec's "clearable" — and FR-TASK-006's clear).
    - **Priority** — `caption` label "Priority", the **`priority-selector`** as a
      four-option segmented control: **None / Low / Medium / High**, each showing
      its `--priority-*` dot **and its text label** — design.md §5 requires
      exactly this ("priority also shows a label in the detail view"), so meaning
      is never carried by colour alone.
  - **Status line** — `small` `--color-text-muted`: "Active", or "Completed
    <date>" for a completed task. **Read-only in this slice** — the
    complete-`checkbox` and its behaviour are FEAT-012's (FEAT-010 D2's rule).
  - **Overdue indicator** — when the task is overdue, a `chip` beside the due
    value carrying the **word "Overdue"** plus the date (design.md §8; §5's
    never-colour-alone rule), on `--color-danger-subtle` with
    `--color-danger-text` — the pairing the amendment below added.
  - No `card` inside the panel: the panel *is* the contained surface
    (design.md §2 elevation assigns `--shadow-md` to "the task-detail panel").
- **Content & data mapping:** the page fetches **`GET /api/tasks/{id}` →
  `GET /tasks/{id}`** (technical-design §3.1) server-side → `{ task, list }`;
  title ← `task.title`; List ← `list.name`; Due ← `task.dueAt`; Priority ←
  `task.priority`; Status ← `task.completedAt`; the overdue chip ← **`task.isOverdue`**
  (the server's derivation — the screen never re-implements the rule,
  technical-design D3). Every edit issues **`PATCH /api/tasks/{id}` →
  `PATCH /tasks/{id}`** carrying **only the changed field** (technical-design D4)
  → `200 { task }`, from which the panel re-renders — so a saved due date and its
  recomputed overdue state arrive together. Clearing sends `{ dueAt: null }`.
  Errors: `400 validation_failed` (`fields[]` naming `title` / `dueAt` /
  `priority`), `404 task_not_found`, `401 unauthenticated`.
- **Timezone:** the picker interprets what the user types, and the chip formats
  what the server returns, in the **browser's timezone** — FR-PROF-003's own
  stated default until FEAT-008 stores one (technical-design D1/§8). The
  instant on the wire is always UTC; no local-time string is ever sent.
- **Conformance:** **pass, after an accepted design-system amendment.**
  - *Escalation → resolved:* the overdue `chip`'s colour pairing.
    `--color-danger-text` did not exist; it was proposed, accepted, and added to
    `tokens.json` (2026-07-28). The chip now uses `--color-danger-subtle` +
    `--color-danger-text` (6.8:1). See §Escalations.
  - *Corrected in design.md by the same amendment:* the priority dots use
    **`--priority-high|medium|low|none`**, the tokens that actually exist in
    `tokens.json` and `tokens.generated.css`; design.md's `--color-priority-*`
    references resolved to nothing and were fixed.
  - Everything else is an existing design.md component used as specified:
    `input`, `field`, `button-secondary`, `button-tertiary`, `icon-button`,
    `popover`, `chip`, `inline-alert`, and the panel elevation/radius rules.

### loading
Server-rendered with its data, as SCR-WEB-008 and the sidebar are — no spinner in
the common path. design.md's `skeleton` rows apply where a client fetch could
leave the region unknown; opening the panel from a row is a navigation, so the
content arrives with the frame. Recorded honestly rather than claimed as a
rendered state. *(If the detail host is realized with a client-side transition,
the skeleton convention applies during it — the one case this slice may need it.)*

### viewing
The state described above: title, list, due, priority, status, and the overdue
chip when `isOverdue`. Every control is interactive; nothing is disabled.

### editing
Per-field, saved on commit (D2): the title on blur or Enter, the due date when
the picker's value is chosen or cleared, the priority on selection. During a
field's save that control shows design.md's in-control loading treatment and is
disabled; **the rest of the panel stays operable**, which is the whole point of a
partial PATCH. On success the panel re-renders from the response. Validation
follows design.md §4's convention — one error per field, beneath it, in
`--color-danger` `small`.

### error
A failed save shows the field's error beneath it and **keeps the user's typed
value** (NFR-REL-004, and design.md §6's "We kept your changes — try again"
voice); the previous stored value is restored only if the user cancels with Esc.
A failed *load* renders an `inline-alert` (`--color-danger-subtle`) in the panel
— "Couldn't load this task." — with a "Retry" `button-tertiary`; the shell and
the list column behind it stay operable, so a data failure never strands the
frame (NFR-USE-003). A `401` redirects to `/signin` (the authenticated-zone
convention FEAT-006 D4 set).

### not-found
`/tasks/{id}` for an id that is unknown, owned by someone else, or soft-deleted —
the API answers one uniform `404 task_not_found` (technical-design §3.1) and the
screen must not reveal which. An `inline-alert`: "That task doesn't exist." plus
a `link` back to the default list. **A supplementary state beyond the inventory's
four**, recorded as such in the manifest — the same treatment and the same
reasoning as SCR-WEB-008's `not-found` (FEAT-010), and it inherits that entry's
open question: when SCR-WEB-019 is finally minted, both should be re-checked
against it.

- **Responsive notes:** the three-way presentation above is design.md §3's shell
  spec, met in full. Below `md` the panel is full-screen with the header row
  carrying the close control at a `--size-touch-target` minimum; the segmented
  `priority-selector` wraps to two rows rather than shrinking its targets below
  44px; the `popover` calendar anchors to the viewport, not the trigger.
- **Decisions:** D1, D2, D3 below.

## SCR-WEB-008 — List View (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
  The full screen spec stays at
  `features/FEAT-010-create-task/ui-design.md#scr-web-008--list-view`; this
  section records only the delta.
- **Delta — `task-row` gains its right cluster.** design.md's `task-row` is
  complete-checkbox + title + `{ due chip, priority dot, drag handle }`. FEAT-010
  shipped the title alone and listed the rest as scheduled. This feature adds
  **two of the four**:
  - **Due-date `chip`** — right-aligned, `caption`, `--radius-full`, human-friendly
    date; **absent entirely when `dueAt` is null** (an empty chip is noise).
    When `task.isOverdue`, it carries the word **"Overdue"** and the danger
    treatment (pending the escalation).
  - **Priority dot** — `--radius-full`, `--priority-*`, with an `aria-label`
    naming the priority (colour alone carries nothing, design.md §5). **Not
    rendered for `none`** — the default state is the absence of a mark, not a grey
    dot on every row.
  - The complete-`checkbox` (FEAT-012) and drag handle (FEAT-014) remain absent.
- **Delta — the row becomes the click target for detail.** design.md's `task-row`
  says "full row is the click target for detail"; it now is, opening SCR-WEB-010
  for that task. The row is a link so middle-click and keyboard both work, and it
  keeps its `--color-surface-sunken` hover and the standard focus ring.
- **Delta — `quick-add` reaches its specified form.** design.md's `quick-add` is
  "a persistent single-line composer with **inline affordances to set due date
  and priority**; Enter creates". FEAT-010 shipped title-only and recorded why
  (technical-design D6). Two `icon-button`s now sit inside the composer beside the
  input, opening the **same** `due-date-picker` popover and `priority-selector`
  used in the detail panel (D4); each shows its chosen value as a compact chip/dot
  and both reset after a successful create. **Enter still creates** with whatever
  is set — the one-field, one-action path NFR-USE-001 depends on is unchanged, and
  neither affordance is required to submit.
- **Content & data mapping:** unchanged endpoints. `GET /lists/{listId}/tasks`
  now returns `dueAt`, `priority` and `isOverdue` on every task (technical-design
  §3.3), which is what feeds the chip and the dot; `POST /lists/{listId}/tasks`
  optionally carries `{ dueAt, priority }` from the composer's affordances.
- **Conformance:** pass, identically to SCR-WEB-010 and for the same reasons
  (the accepted `--color-danger-text` amendment; the `--priority-*` naming
  correction). No other change — every addition is a part of `task-row` and
  `quick-add` as design.md already specifies them.
- **Responsive notes:** the right cluster collapses before the title does — the
  title truncates last, since it is the row's meaning. At `< md` the chip keeps
  `caption` size and the row keeps its 44px minimum. FEAT-010's recorded gap (the
  mobile bottom-anchored composer, its D5) is **untouched and still open**; this
  feature adds controls *inside* the composer without moving it, so the gap
  neither widens nor closes.

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry** (its
  fifth extension). Full spec remains at
  `features/FEAT-009-lists/ui-design.md#scr-web-007--app-shell--lists-sidebar`;
  delta only here.
- **Delta:** the shell finally has the **detail host** its inventory entry has
  always described ("Sidebar + content + detail host"). At `≥ lg` it is the
  420px right region (`--size-detail-panel-width`) that SCR-WEB-010 slides into,
  with the content column keeping its `--size-content-max`; at `md` an overlay;
  below `md` the host takes the whole viewport. When no task is open the region
  is not rendered at all — it takes no space and leaves no empty gutter. Esc
  closes it from anywhere in the shell, and focus returns to the row that opened
  it (design.md §5: "Esc closes panels/dialogs; focus … restored on close").
- **Content & data mapping:** unchanged — the host is layout; its occupant fetches
  its own data.
- **Conformance:** pass — `--size-detail-panel-width`, `--shadow-md` and the
  breakpoint behaviour are design.md §2/§3's own, used for the first time as
  specified.

## Cross-screen decisions

- **D1 — The detail is a route first, presented as a panel — not a panel that
  happens to have a URL.** Driver: ux-foundations types SCR-WEB-010 as "panel /
  full-screen" and design.md §3 puts a slide-in beside the list at `≥ lg`, while
  technical-design §5 requires an addressable `/tasks/{id}` for deep links,
  refresh and the back button. Both are satisfiable at once: the route is the
  truth, and the shell's detail host is how it presents when the user arrived
  from a list row. Rejected: a client-only panel with no URL (refresh loses the
  task, no sharing, back closes the whole list); a plain full-page route at every
  width (throws away the side-by-side context design.md specifies, and makes
  editing feel like leaving the list). Consequence: implementation needs the
  routing mechanism that renders one route two ways —
  **`apps/web/AGENTS.md` applies with force here: read
  `node_modules/next/dist/docs/` for the current route-interception/parallel-route
  guidance rather than reproducing a remembered pattern.** If that mechanism
  proves unavailable, the honest fallback is the full-page route at every width
  **plus a recorded manifest gap** — never a panel that breaks deep-linking.
- **D2 — Edits save per field on commit; there is no Save button.** Driver:
  technical-design D4 made PATCH partial precisely so one field can be saved
  without touching the others, and design.md §4's validation convention already
  validates "on blur and on submit" — for a detail panel, blur *is* submit. It
  also removes the panel's worst failure mode: navigating away with unsaved
  edits. Rejected: a Save button batching all three fields (fights the partial
  contract, invents a dirty-state model, and needs an "unsaved changes" guard
  nothing else in the product has); autosave on every keystroke (a PATCH per
  character, and a title briefly saved as "B" while the user types "Buy milk").
  Consequence: each control owns its own loading and error state, which is what
  the `editing` and `error` states above specify, and a failed save keeps the
  typed value rather than reverting it.
- **D3 — The `list-picker` design.md lists in `task-detail-panel` is not built,
  and its absence is a decision rather than an oversight.** Driver: no FR gives a
  task a way to change lists — FR-LIST-009 assigns the list *at creation*, and
  FR-TASK-004..008 never mention moving one; technical-design's PATCH contract
  therefore rejects `listId` outright (§3.2, §8). Rendering a picker the API will
  not honour is the exact failure FEAT-010 D2 named: a control that looks live but
  isn't. Rejected: building the picker and disabling it (explains a roadmap to a
  user); building the move behaviour here (taking a requirement no one wrote —
  the error that skill's whole escalation path exists to prevent). Consequence:
  the List row is read-only text, and **"move a task between lists" is surfaced as
  a candidate requirements amendment** (§Escalations), not slipped in.
- **D4 — The composer and the panel share one `due-date-picker` and one
  `priority-selector`.** Driver: design.md specifies each component once, and the
  two surfaces set the same two values against the same contract fields; two
  implementations would drift in formatting, keyboard behaviour and timezone
  handling — the failure the *technical* design avoided by deriving `isOverdue`
  in one place (D3 there). Rejected: a compact "mini" variant for the composer
  (design.md §7: "Don't invent component variants — extend via the defined
  axes/tokens"). Consequence: the components are built once, in a shared location,
  and FEAT-016's smart-view composers inherit them.

## Escalations & open items

- **ESCALATION → ux-foundations: the design system was missing
  `--color-danger-text`. ✅ ACCEPTED AND LANDED 2026-07-28** — `tokens.json` now
  carries `color.dangerText: #991B1B` and `colorDark.dangerText: #FCA5A5`;
  `tokens.generated.css` was rebuilt via `scripts/build-tokens.mjs`; design.md
  §2 (table, both CSS blocks, contrast notes), §4 (`task-row`), §5 (contrast
  rule) and §8 were amended, and §9 carries the amendment log entry. The
  original filing is kept below because the *reasoning* is what the next
  danger-tinted component needs, not just the outcome.
  design.md §4 specifies `badge`/`chip` as "`caption`,
  `--radius-full`, **tinted bg + matching text token**", and §4's `task-row` says
  the due chip "turns `--color-danger` when overdue". The token set provides a
  matching text token for every other semantic colour — `accentText` (#B45309,
  described in `tokens.json` as "4.8:1 on white — AA"), `successText` (#047857,
  "AA"), `warningText` (#B45309, "AA") — and **none for danger**. The only
  pairing available today, `--color-danger` (#DC2626) on `--color-danger-subtle`
  (#FEE2E2), measures **3.95:1**, below the **4.5:1** design.md §5 requires for
  text at `caption` (12px) size. This is the system's own rule failing on the
  system's own tokens, found by the first screen to need it.
  - **The amendment** (ux-foundations owned the decision, not this skill; the
    user accepted it): add `color.dangerText: #991B1B` — **6.8:1** on `--color-danger-subtle`,
    consistent in derivation and naming with the three existing `*Text` tokens —
    and `colorDark.dangerText: #FCA5A5`, matching the dark set's lighter-than-base
    pattern (`successText` #6EE7B7, `warningText` #FCD34D). Rebuild via
    `scripts/build-tokens.mjs`; no component spec changes.
  - **Why it isn't worked around locally:** the conforming alternative available
    today is a **solid `--color-danger` fill with white text** (4.83:1, the
    `button-danger` treatment), which reads as one of design.md's two possible
    intents for "chip in `--color-danger`" — but choosing it here would be this
    skill silently resolving an ambiguity in upstream authority, and would leave
    the gap to be rediscovered by **FEAT-013** (delete states), **FEAT-016** (the
    Overdue smart view) and every future danger chip. Surfaced as the user's call.
  - **Scope of the block (while it was open):** one colour pairing on one
    element. Both screens' structure, states, composition and bindings were
    complete and unaffected throughout; the block cost the loop one decision,
    not one feature.
- **Correction (landed with the same amendment): design.md named the priority
  tokens `--color-priority-*`; the real tokens are `--priority-*`.** `docs/tokens.json`
  defines them under a top-level `priority` group, so `scripts/build-tokens.mjs`
  emits `--priority-high|medium|low|none` — which is what
  `apps/web/src/styles/tokens.generated.css` contains and what these screens use.
  design.md §2 (token table and both CSS blocks), §4 (`task-row`,
  `priority-selector`) and §8 all cited the non-existent `--color-priority-*`.
  Filed toward ux-foundations as a **documentation touch-up** and corrected in
  the same amendment; it changed no value, but left alone it would have sent a
  future implementer looking for a variable that resolves to nothing.
- **Candidate requirements amendment: moving a task between lists** (D3).
  design.md's `task-detail-panel` spec lists a list picker; no FR authorizes the
  behaviour and the contract rejects it. Either the SRS gains an FR and a feature
  is planned for it, or design.md's component spec drops the picker. Recorded for
  the product owner; **not decided here, and not built.**
- **The inventory's `SCR-WEB-010 → UC-004` trace was a source typo. ✅ FIXED
  2026-07-28** in the same amendment — `docs/ux-foundations.md`'s inventory row
  now reads `UC-010/011/012`. FEAT-004's technical-design §8, FEAT-004's
  ui-design and the SCR-WEB-007 manifest entry had each recorded it
  independently; this was the fourth sighting and the first fix. **Still stale:
  the plan's FEAT-004 row** (`docs/implementation-plan.md`) also lists
  SCR-WEB-010 among that feature's screens — implementation-planning owns that
  file, so it is left for a plan touch-up rather than edited from here.
- **Deferred to their owning features, by design:** the complete-`checkbox` and
  the status control (FEAT-012, which also collapses the completed section), the
  delete action and undo-snackbar (FEAT-013), the drag handle (FEAT-014). The
  detail panel's spec above is what those features extend — each **adds** to it
  rather than reworking it, the rule FEAT-010 D2 set and this feature keeps.
- **Carried deviation (not new, not escalated): no icon library.** design.md
  specifies Lucide; none is wired, so the close control, the composer's two new
  affordances and the calendar trigger render as text/glyph with `aria-label`s —
  the same carried deviation FEAT-004/006/009/010 record. This feature adds the
  most icon-shaped controls yet, making it the most visible instance to date.
- **FEAT-010's recorded gap stays open**: design.md §3's bottom-anchored mobile
  composer. Unchanged by this feature (D-note under SCR-WEB-008), still owned by
  FEAT-013 or a foundations pass.
