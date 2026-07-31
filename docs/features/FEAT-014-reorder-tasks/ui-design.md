# UI Design: FEAT-014 — Reorder active tasks within a list

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-008 (the reorder affordance on `task-row`) · Mode: per-feature
> Status: Draft · Date: 2026-08-01
> The screen already exists in `docs/design-manifest.json` (minted by FEAT-010,
> extended by FEAT-011/012/013/019); this feature **updates that entry** rather
> than minting anything. No SCR is minted, no inventory entry changes.
> **This section resolves the open item technical-design §8 handed over** — the
> reorder *mechanism*, where UC-010 ("drags the task"), design.md §4 (a drag
> handle at `≥lg`), design.md §5 (drag must have a keyboard alternative) and
> FEAT-009's shipped menu-driven list reorder all point slightly differently.
> D1 is that decision; AC-12 is what it has to satisfy.

## SCR-WEB-008 — List View (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
  Full screen spec: `features/FEAT-010-create-task/ui-design.md#scr-web-008--list-view`;
  later deltas in `features/FEAT-011-task-detail/ui-design.md`,
  `features/FEAT-012-complete-reopen/ui-design.md#scr-web-008--list-view-this-features-extension`,
  `features/FEAT-013-delete-restore/ui-design.md#scr-web-008--list-view-this-features-extension`.
  This section is the reorder delta and nothing else.
- **Composition:** no new structure in the list. One delta, on **active rows
  only**:
  - **Delta — the reorder handle.** design.md §4's `icon-button` (40px / 44px
    touch, transparent, hover `--color-surface-sunken`, the standard focus
    ring, always `aria-label`ed), placed **last in `task-row`'s right cluster**
    — after the due chip and the priority dot — which is the position §4's
    `task-row` entry gives the drag handle. Glyph `⠿`, `aria-hidden`, with the
    meaning carried by `aria-label="Reorder: {title}"`: the carried no-icon-
    library deviation, handled the way `lists-nav.tsx`'s `⋯` and `+` already
    are. It is a real `<button>` — never a `div` with a role — so Enter and
    Space activate it for free.
  - **Completed rows get no handle**, and neither does a list with **one**
    active task: FR-TASK-012 orders active tasks, and there is nothing to
    reorder in a set of one (technical-design D3). This mirrors FEAT-009's
    discipline of not rendering an action that cannot act.
  - The handle carries three affordances, one control (D1): **drag** at `≥lg`,
    **arrow keys** while focused, and the **moving state** below for touch and
    for anyone who prefers discrete controls.
- **Content & data mapping:** the active section's rows are
  `GET /lists/{listId}/tasks` → `active[]`, rendered **in the order the server
  returned** — which is now `position` order (technical-design §5). A completed
  move posts the full active id vector to `POST /api/lists/{listId}/tasks/reorder`
  → the API's `POST /lists/{listId}/tasks/reorder` (technical-design §3.1); its
  `200 ListTasksResponse` is consumed as "it landed", with the authoritative
  order arriving on the following `router.refresh()`. **`position` itself is
  never rendered** (D5) — the order of the rows *is* the display of it.
- **Conformance:** **pass on composition, with one documentation-only amendment
  filed** (see Escalations): every part of this delta is design.md §4's
  `icon-button` plus existing tokens — no new component, no new token, no new
  colour pairing. The amendment concerns §4's `task-row` prose, which places
  the reorder handle at `≥lg` only; taken literally that leaves touch and small
  viewports with no reorder at all, which §5's keyboard-alternative rule and
  FR-TASK-012 (no viewport qualifier) both refuse. The screen is specified
  against the proposal; it blocks no structure, state or binding.

### populated *(the only state this feature changes)*

The active section, with a handle on each row when there are two or more active
tasks. Three interaction paths, all landing on the same request:

- **Drag (`≥lg`, pointer).** The handle is `draggable`; the row follows the
  standard browser drag. The dragged row takes `--color-surface-sunken` for its
  whole height (the same tint hover already uses, so nothing new is introduced),
  and the row the pointer is over shows a `--border-width-thick`
  `--color-primary` rule on the edge the row would land against — the identical
  accent-bar treatment `sidebar-nav-item` uses for selection, turned horizontal.
  Drop commits the move; dropping outside the list cancels it. No animation and
  no reflow transition, so `prefers-reduced-motion` needs nothing special
  (design.md §5).
- **Arrow keys (any width, keyboard).** With the handle focused, **ArrowUp** and
  **ArrowDown** move the task one place. Focus **stays on the handle and travels
  with the row**, so a second press keeps moving the same task — the property
  that makes "move three places up" four keystrokes instead of a re-hunt. At the
  ends the key is a no-op (no error, no wrap). This is design.md §5's "arrow
  keys move within lists" read literally.
- **Moving state (any width, touch or pointer).** Activating the handle (click,
  tap, Enter/Space) toggles that row into `moving`: two more `icon-button`s —
  **▲ "Move up"** and **▼ "Move down"**, `aria-label`ed with the task title,
  each **disabled at the corresponding end** (the `menu-move-up` /
  `menu-move-down` semantics `lists-nav.tsx` already ships, minus the popover) —
  appear inline beside the handle, and the row is marked `aria-pressed` on the
  handle. Esc, blur out of the row, or a second activation exits. Only one row
  is ever in `moving`.

**Every completed move is announced.** A `role="status"` / `aria-live="polite"`
region — the shape `lists-nav.tsx`'s toast and FEAT-013's snackbar already use —
reads *"Moved 'Buy milk' to 2 of 5."* This is the only feedback a keyboard or
screen-reader user gets that the arrow press did anything, so it is not
decoration (design.md §5: `aria-live` for async results).

### empty

Unchanged — no active rows, no handles. The one-active-task case is specified
above: no handle at all, rather than a handle whose every action is disabled.

### error

A rejected or failed move **snaps the order back** to what the server last
confirmed and shows an inline message below the active section, in
`--color-danger` at `small`, with the copy `lists-nav.tsx` already uses for the
same failure: *"Couldn't save the new order."* The rendered order and the stored
order therefore never diverge silently — the failure mode AC-15 exists to
prevent, and the same rollback contract `task-checkbox.tsx` follows. A `401`
sends the browser to `/signin`, as every other island in this app does. A `400`
(the client's vector no longer matches the server's active set — someone
completed or deleted a task on another device) takes the same rollback path,
plus a `router.refresh()` so the stale list is replaced by the real one.

### loading / not-found

Unchanged — FEAT-010's spec stands. The handle renders with the row; there is
no separate loading treatment for it.

- **Responsive notes:** the handle keeps its 44px target at every width and is
  present at every width (the amendment above). Drag is `≥lg` only — pointer
  drag on a touch viewport competes with scrolling, which is precisely why §4
  qualified it — so below `lg` the moving state is the path, and it needs no
  gesture. The right cluster's collapse order is unchanged from FEAT-011: the
  title truncates last, and the handle, being the row's only reorder affordance,
  is not among the parts that collapse.

## Cross-screen decisions

- **D1 — One handle carrying three affordances: drag at `≥lg`, arrow keys when
  focused, and an inline moving state.** Driver: four documents constrain this
  and none of them alone answers it — UC-010 main 2 says the user "drags the
  task", design.md §4 gives `task-row` a drag handle at `≥lg`, design.md §5
  requires drag-reorder to have a keyboard alternative (move up/down) *and*
  says arrow keys move within lists, and technical-design AC-12 fails the
  feature outright if the affordance is pointer-only. One control satisfying
  all four keeps `task-row` at one added tab stop. Rejected: **drag only** (fails
  AC-12, §5 and every touch user); **two always-visible ▲/▼ buttons per row**
  (the honest accessible version of "just add buttons", but it puts two extra
  tab stops on *every* row — 40 on a 20-task list — which degrades the keyboard
  experience it was meant to serve, a cost the sidebar's handful of lists never
  had); **the per-row popover menu FEAT-009 shipped** (proven and accessible,
  but design.md §4 describes no menu component, so repeating it here would
  entrench an off-system pattern on a second screen instead of composing the
  `icon-button` the system does specify); **a swipe gesture** (invisible, no
  design.md pattern, unreachable by keyboard — the same reasons FEAT-013 D4
  rejected swipe-to-delete). Consequence: the moving state is a screen-local
  composition of `icon-button`s, not a new component, and the drag path is the
  only part of the feature a user can lose without losing the capability.
- **D2 — The move is optimistic, with rollback.** Driver: a reorder that waits
  for a round trip before the row moves reads as a broken drag, and the client
  is holding exactly the thing being changed — a permutation of one array it
  fully owns. The precedent is `task-checkbox.tsx` (FEAT-012 ui-design D1):
  optimistic about *what the control itself owns*, rolled back on failure.
  Rejected: server-first rendering (the drag would visibly snap back to the old
  order and then re-render into the new one); optimistic **without** rollback
  (the rendered order would keep a move the server refused — AC-15's exact
  failure). Consequence: this is deliberately *unlike* FEAT-013 D2's undo, which
  refuses to reconstruct client-side — there, the restored row's section, counts
  and `isOverdue` were all server-derived; here the only thing changing is the
  order of rows already on screen.
- **D3 — The active section becomes a client island; `task-row` is extracted so
  both sections render identical markup.** Driver: `list-view.tsx` is a server
  component, and reorder needs client state (the optimistic order, the moving
  row). Only the **active** `<ul>` needs it — the completed disclosure stays
  server-rendered inside `<details>`, keeping FEAT-012 D5's zero-JS property.
  The row markup must not fork between the two sections, so `TaskRow` moves to
  its own module used by both. Rejected: making the whole `ListView` a client
  component (drags the header, the empty states and the completed disclosure
  into the client for no reason); duplicating the row markup in the island (two
  renderers of one design.md component — the drift `toSummary` and `TASK_COLUMNS`
  exist to prevent, in the presentation layer). Consequence: a scoped structural
  change to a shipped component, which is this feature's work rather than a
  drive-by refactor — the behaviour of every existing row is unchanged, and
  FEAT-010/011/012/013's row tests are the check on that.
- **D4 — Native HTML5 drag-and-drop; no drag library.** Driver: `apps/web`
  depends on Next, React and `@supabase/supabase-js` and nothing else; a
  reorder library (dnd-kit et al.) would be the first UI dependency in the tree,
  for a `≥lg` pointer path that already has two working alternatives.
  `draggable` + `dragover`/`drop` on rows is a few dozen lines and no bundle
  cost. Rejected: dnd-kit or similar (a dependency, and its accessibility layer
  duplicates what D1 already specifies); pointer-event drag written by hand
  (touch drag we deliberately don't want). Consequence: the drag path inherits
  the browser's own drag semantics, including its cancel-on-Esc.
- **D5 — `position` is never displayed.** Driver: the row order *is* the
  rendered form of the field; a visible rank number would be a second
  representation to keep in sync, and would read as meaningful to users when it
  is an implementation detail (technical-design D8 puts it on the wire for the
  contract's sake, not the screen's). The `aria-live` announcement gives the
  position **relatively** — "2 of 5" — which is what a user without the visual
  order actually needs. Rejected: numbered rows (implies a stable identifier
  that reorder invalidates on every move).

## Escalations & open items

- **AMENDMENT FILED toward ux-foundations — design.md §4's `task-row` places the
  reorder handle at `≥lg`, which contradicts §5 and FR-TASK-012.** §4 reads
  "a drag handle (`≥lg`, for reorder)". Read literally, the *control* disappears
  below `lg`, taking reorder with it — while §5 requires drag-reorder to have a
  keyboard alternative (which must therefore exist where drag does not) and
  FR-TASK-012 attaches no viewport qualifier to the capability. **Proposed
  wording:** "a **reorder handle** — present at every width, keyboard- and
  touch-operable (move up/down); **draggable at `≥lg`**, where pointer drag does
  not compete with scrolling." Documentation-only: **no token value changes and
  no shipped code changes** — nothing today renders a handle at all. This is the
  same class of finding as FEAT-012's checkbox-glyph and FEAT-013's
  `button-danger` prose amendments: the system's *intent* is right and its prose
  is under-specified. Screens above are specified against the proposal; it
  blocks nothing.
- **No new component proposed.** The moving state composes `icon-button`s and
  existing tokens. If a *third* screen ever needs an inline move affordance, the
  extraction of a shared `reorder-handle` component into design.md §4 becomes a
  clean foundations item — recorded here so the second instance is a data point
  rather than a surprise (the exit-condition discipline FEAT-013 D1 used for the
  confirm dialog).
- **Carried, not closed — FEAT-010's responsive gap.** design.md §3's
  bottom-anchored quick-add below `md` is still unbuilt, and FEAT-013 recorded
  the snackbar's stacking rule against it. This feature adds no new tenant to
  that region (the handle lives in the row), so the gap carries unchanged.
- **Carried, not closed — two toast hosts.** `lists-nav.tsx`'s local toast and
  FEAT-013's root-layout undo host still coexist against design.md §4's single
  toast region. This feature adds **no** toast: the move announcement is an
  `aria-live` status region inside the list island, not a toast, precisely so it
  does not become a third tenant of that unresolved space.
- **Carried deviation (not new, not escalated): no icon library.** design.md
  specifies Lucide; none is wired, so the handle, ▲ and ▼ are text glyphs with
  `aria-hidden` and real `aria-label`s on the buttons — the treatment every
  icon-only control in this app already uses.
- **No inventory change, no SCR minted.** SCR-WEB-008's inventory entry already
  lists UC-010 (UC-009/010/011/012), and the plan's FEAT-014 row already names
  SCR-WEB-008 as its only screen. Nothing upstream owes an update for this
  feature beyond the design.md amendment above.
