# UI Design: FEAT-013 — Delete / restore task (soft-delete + undo)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-010 (delete control + confirm dialog), SCR-WEB-008 (row
> removal + undo snackbar) · Mode: per-feature · Status: Draft · Date: 2026-07-29
> Both screens already exist in `docs/design-manifest.json` (minted by FEAT-010
> and FEAT-011); this feature **updates both entries** rather than minting
> anything. No SCR is minted, no inventory entry changes.
> **The delete flow is confirmed *and* undoable** — the product owner's
> 2026-07-29 ruling on NFR-USE-002 (technical-design D2). Read that decision
> before this document: ux-foundations Flow 3 still draws the snackbar-only
> version and is the document that owes an amendment, not this spec.

## SCR-WEB-010 — Task Detail (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
  Full screen spec: `features/FEAT-011-task-detail/ui-design.md#scr-web-010--task-detail`;
  FEAT-012's status-control delta:
  `features/FEAT-012-complete-reopen/ui-design.md#scr-web-010--task-detail-this-features-extension`.
  This section is the delete delta and nothing else.
- **Composition:** unchanged above the fold — title `input`, read-only List,
  `due-date-picker`, `priority-selector`, the complete-`checkbox` status control.
  Two additions at the **bottom** of the panel, below everything editable:
  - **Delta 1 — the delete control.** design.md §4's `button-danger`
    (`--color-danger` fill, `--color-on-primary` text — see Conformance), full
    label **"Delete task"**, `--size-touch-target` minimum, separated from the
    editing fields by `--space-6` and a `--border-width-hairline`
    `--color-border` rule, so the destructive action is never adjacent to a
    field a user is tabbing through. It is the **last** control in DOM order:
    tabbing forward through the panel reaches it last, which is the ordering the
    focus trap already assumes (`detail-panel.tsx` recomputes tabbables per
    keypress).
  - **Delta 2 — the confirm dialog** (`confirming` state below). design.md §4's
    `confirm-dialog`, which — per technical-design D2 — is what makes the first
    click of "Delete task" open a question rather than destroy anything.
- **Content & data mapping:** the confirm dialog's body names the task from the
  already-loaded `task.title` (`GET /tasks/{id}` → `task.title`); no extra
  fetch. The confirm action issues `DELETE /api/tasks/{id}` → the API's
  `DELETE /tasks/{id}` (technical-design §3.1), whose `200 { task, deletedAt }`
  the screen consumes only as "it landed" — the snackbar on SCR-WEB-008 is what
  renders the consequence, and `deletedAt` is displayed nowhere (technical-design
  D4 puts it on the wire for the contract's sake, not the screen's).
- **Conformance:** **corrected, with a design-system amendment filed** (see
  Escalations) — design.md §4's `button-danger` prose says *white* text, which is
  4.83:1 on light `--color-danger` but **2.77:1** on the dark theme's `#F87171`,
  below §5's 4.5:1. The screen specifies `--color-on-primary` (4.83:1 light /
  **6.12:1** dark), which is also what the shipped `list-dialog.tsx` already
  uses — the code is right and the prose is stale. Second correction, same
  family: the dialog's error slot uses **`--color-danger-text`** on
  `--color-danger-subtle`, never `--color-danger` (3.95:1, the DEF-003 pairing) —
  and `list-dialog.tsx`, the component this spec otherwise says to copy, still
  has the wrong one at line 196 (see Escalations: that is a shipped defect, not
  this feature's rework).

### viewing
Unchanged from FEAT-011/FEAT-012, plus the delete control at the bottom. Nothing
about the delete affordance changes with completion state: a completed task can
be deleted exactly like an active one.

### confirming *(new state)*
The `confirm-dialog` over the current surface — a dialog, never a route
(the pattern `list-dialog.tsx` established for SCR-WEB-011):
- **Title:** "Delete this task?" · **Body:** the task's title in quotes, then
  the one thing the user needs to decide with — *"You'll be able to undo this
  for a few seconds."* Plain and unjoking (design.md §6: never joke in a delete
  confirmation), and honest about the window rather than promising a permanence
  the system does not have.
- **Actions:** `button-secondary` **Cancel** + `button-danger` **Delete**.
  Confirm takes initial focus (the `list-dialog` delete-branch precedent), focus
  is **trapped** while open, Esc and the scrim close it, and focus returns to
  the "Delete task" control on close.
- **Nothing is written on any path but confirm** — cancel, Esc and scrim-click
  send no request (AC-9b). While the `DELETE` is in flight the confirm button
  disables and reads "Deleting…", matching `list-dialog`'s submitting treatment.
- On success the dialog closes with the surface it sits on: the panel closes
  (`router.back()`), or the full page returns to `/lists/{listId}`.

### error
A failed delete keeps **both** the dialog and the task: the dialog stays open
with an `inline-alert` in `--color-danger-text` on `--color-danger-subtle`
("Couldn't delete that just now. Try again."), the confirm re-enabled, and the
task still in the list behind it. The one thing this state must never do is
close as though it worked (AC-11) — the failure mode `task-checkbox.tsx`'s
rollback exists to prevent, in the shape a modal takes.

### editing / loading / not-found
Unchanged — FEAT-011's spec stands. `not-found` gains one behaviour worth
naming because this feature can now cause it: a task deleted on another device
(or in another tab) makes this surface's `GET /tasks/{id}` return the uniform
404, and the existing `TaskDetailFailure` alert already covers it. A `DELETE`
that returns 404 for the same reason surfaces the same "That task no longer
exists." message the checkbox uses, and then leaves the surface — the outcome
the user wanted is the outcome they got.

- **Responsive notes:** the delete control keeps its 44px target at every width.
  Below `md` the detail is full-screen and the confirm dialog is a centered card
  over it (design.md §3's dialog behaviour, unchanged); the control sits at the
  end of the scrollable content rather than pinned, so it cannot be hit by
  accident while scrolling — the inverse of the complete-checkbox rule
  (FEAT-012: completing must be above the fold *because* it is frequent; deleting
  must not be, for the same reason).

## SCR-WEB-008 — List View (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
  Full screen spec: `features/FEAT-010-create-task/ui-design.md#scr-web-008--list-view`;
  FEAT-012's deltas:
  `features/FEAT-012-complete-reopen/ui-design.md#scr-web-008--list-view-this-features-extension`.
- **Composition:** no new structure in the list itself. Two deltas:
  - **Delta 1 — the row leaves.** A confirmed delete removes the `task-row` from
    whichever section held it, the header's "N tasks left" subtitle drops (when
    the task was active), and the sidebar `sidebar-nav-item` count follows —
    all of it re-rendered from the server by `router.refresh()`, the same way
    FEAT-012's transitions move a row between sections. The row does **not**
    animate out or leave a placeholder: design.md specifies no removal
    transition, and inventing one here would be a private fork.
  - **Delta 2 — the undo snackbar.** design.md §4's `toast` in its
    **undo-snackbar** variant: `--color-surface`, `--border-width-hairline`
    `--color-border`, `--radius-lg`, `--shadow-lg`, bottom-**right** at `≥ md` /
    bottom-**center** below it, text `--color-text` at `small`, and an **"Undo"**
    `button-tertiary` (`--color-primary` — 5.47:1 light, 9.15:1 dark on the toast
    surface) at `--size-touch-target`. Copy: **"Task deleted."** + Undo. ~7 s
    auto-dismiss per §4, **paused while the snackbar is hovered or contains
    focus** (D3), then dismissed with no further trace.
- **Content & data mapping:** rows and counts unchanged
  (`GET /lists/{listId}/tasks`, `GET /lists`). The snackbar carries only what the
  delete already knew — the task id, for the Undo — and posts
  `POST /api/tasks/{id}/restore` → the API's `POST /tasks/{id}/restore`
  (technical-design §3.2); its `200 { task }` is consumed as "it landed", with
  the restored row arriving from the server on the following `router.refresh()`.
  The screen never reconstructs the deleted row from client memory (D2).
- **Conformance:** pass, on the corrected system — the snackbar composes
  design.md §4's `toast` + `button-tertiary` with no new component and no new
  token. The `button-danger` correction above belongs to SCR-WEB-010; nothing on
  this screen carries danger text.

### populated
As FEAT-010/011/012 specified, minus the deleted row, plus the snackbar while it
lives. The snackbar **overlays** the list; it never reflows it, so the rows
below do not shift when it appears or dismisses.

### empty
Deleting the last task in a list lands on FEAT-010's generic empty state — with
the snackbar still over it, which is the point: the undo has to survive the list
becoming empty, and an empty list is exactly when a user is most likely to
realize they deleted the wrong thing. (First-run copy, SCR-WEB-018, is *not*
shown here: `firstRun` requires a brand-new account, not merely an emptied list —
FEAT-010 ui-design D1, unchanged.)

### loading / error / not-found
Unchanged. The snackbar is independent of the list's own states: it is mounted
above the whole shell (technical-design D6), so a list that fails to reload after
a delete still shows the undo — the failure of the refresh must not take the
recovery affordance with it.

- **Responsive notes:** at `< md` the snackbar is bottom-center and
  full-width-minus-`--space-4`, sitting **above** the region design.md §3
  reserves for the bottom-anchored composer. That composer is still unbuilt
  (FEAT-010's recorded gap, carried again below) — the rule is recorded now so
  whoever lands it stacks the two rather than discovering the collision then.
  The snackbar sits at `z-index` 60, the layer `lists-nav.tsx`'s toast already
  uses, and above the detail panel's 20/21 so a snackbar is never trapped behind
  a panel that failed to close.

## Cross-screen decisions

- **D1 — The confirm dialog is a second local dialog, not a refactor of
  `list-dialog.tsx`.** Driver: `list-dialog.tsx` is SCR-WEB-011's *screen* — it
  owns list create/rename/delete, its own form state and its own copy; extracting
  a shared `confirm-dialog` out of it is a change to FEAT-009's shipped component
  in service of FEAT-013, which is exactly the drive-by refactor feature scope
  forbids. This feature builds the confirm as part of the task-detail island,
  **copying the established behaviour** (initial focus on confirm, trap, Esc,
  scrim, submitting state) rather than the file. Rejected: extracting a shared
  component now (unscoped edit to a verified feature); reusing `ListDialog` with a
  third `kind` (a list component asked to delete a task — the seam is wrong).
  Consequence: two dialogs implement the same pattern, which is a **recorded**
  duplication with a named exit — extracting the shared `confirm-dialog` design.md
  §4 already describes is a clean foundations item once a third caller exists
  (FEAT-018's delete-account is that third caller).
- **D2 — Undo restores by re-reading the server, never by replaying client
  state.** Driver: the restored row's section, order, counts and `isOverdue` are
  all server-derived (technical-design §3.2); a client that re-inserted the row
  from the copy it held before the delete would be a second, drifting renderer of
  the list — and would be wrong the moment another device changed something.
  `POST …/restore` then `router.refresh()` is the same
  write-then-refresh contract every island in this app already follows. Rejected:
  optimistic re-insertion (the FEAT-012 checkbox is optimistic about *one
  boolean it owns*; a row's position in two sections is not that); keeping the
  deleted row hidden-but-mounted and un-hiding it (a lie in the DOM about what
  the server holds).
- **D3 — The snackbar's timer pauses on hover and on focus, and the snackbar
  never takes focus.** Driver: two design.md §5 rules pulling in opposite
  directions — the undo must be reachable **by keyboard alone**, and a control
  that steals focus mid-typing (the quick-add composer is right there) is exactly
  the interruption the same section forbids. Pausing on hover/focus resolves it:
  the snackbar is announced politely (`role="status"` / `aria-live="polite"`,
  the shape `lists-nav.tsx` ships), is reachable by Tab as the next control after
  the list, and stops counting down once a user is demonstrably interacting with
  it — so a keyboard user who tabs to Undo is not racing a 7-second timer.
  Rejected: focusing the Undo button on appearance (steals focus, and a screen
  reader loses its place); a bare 7 s with no pause (a keyboard user reaching the
  control has to arrive faster than a mouse user who is already there); a
  permanent snackbar with a dismiss button (design.md §4 specifies auto-dismiss,
  and a persistent bar over an empty list reads as an error).
- **D4 — Delete lives on the detail surface only; the row keeps no delete
  affordance.** Driver: design.md §4's `task-row` spec lists checkbox, title, due
  chip, priority dot and drag handle — no delete — while `task-detail-panel`
  names "complete + delete" (technical-design D7 records the same call from the
  contract side). Rejected: a hover-revealed row delete (hidden on touch, and it
  puts a destructive control one row away from the checkbox users tap constantly);
  a swipe-to-delete gesture (no design.md pattern, invisible, and unreachable by
  keyboard). Consequence: deleting costs one navigation — open the task, delete —
  which is a deliberate speed bump on the one action that removes data, and it is
  why the confirm dialog on top of it (D2 in technical-design) is friction the
  product owner accepted rather than friction this screen invented.

## Escalations & open items

- **AMENDMENT FILED toward ux-foundations — design.md §4's `button-danger` says
  "white text", which fails §5 in the dark theme.** Measured: white on
  `--color-danger` is **4.83:1** light (#DC2626) but **2.77:1** dark (#F87171),
  against §5's 4.5:1 for body text; the theme-aware `--color-on-primary` measures
  4.83:1 light and **6.12:1** dark. This is the third instance of one pattern —
  FEAT-012 filed the identical finding for the checkbox's "white check" glyph, and
  the amendment that landed corrected §4's `checkbox` but left `button-danger`'s
  prose alone. **Documentation-only: no token value changes**, and no shipped code
  changes either (`list-dialog.tsx` already uses `--color-on-primary`) — the
  proposal is to replace "white text" with `--color-on-primary` in §4's
  `button-danger` entry and to add the pairing to §8's quick reference, so the
  next feature that reads the prose builds the right thing. Screens here are
  specified against the proposal; it blocks no structure, state or binding.
- **DEFECT FOUND IN SHIPPED CODE — routes to the maintenance path, not to this
  feature.** Five shipped sites still put `--color-danger` on
  `--color-danger-subtle` at `small` (14px) — the **3.95:1** pairing DEF-003
  measured and `--color-danger-text` (6.80:1) exists to replace:
  `app/signup/page.tsx:89-91` (FEAT-001), `app/signin/page.tsx:128-130`
  (FEAT-003), `app/reset-password/page.tsx:46-48` (FEAT-005),
  `components/lists-nav.tsx:117-119` and `components/list-dialog.tsx:196-198`
  (FEAT-009). DEF-003's fix corrected `list-view-failure.tsx` and DEF-004 swept the
  chip/badge pairing, but neither swept the **inline-alert** instances across auth
  and lists. It surfaces here because `list-dialog.tsx` is the component this spec
  tells implementation to copy, so the wrong pairing would propagate into a new
  dialog if it went unrecorded. Recommended handling: a single defect-ledger row
  and one web-tier pass (the DEF-005 shape), **not** rework on five verified
  features — and FEAT-013's own dialog is specified with `--color-danger-text`
  regardless, so this feature ships correct either way.
- **ux-foundations amendment owed for the D2 ruling** (technical-design §8,
  repeated here because it is a *screen* story too): §A5 lists the
  `confirm-dialog` users without task delete, and **Flow 3 [UC-012]** draws
  delete → soft-delete → snackbar with no confirm node. The screens above are
  built to design.md §4 (which does list task delete under `confirm-dialog`), so
  nothing is blocked — but the flow diagram should gain its confirm step before
  acceptance reads the two documents against each other.
- **FEAT-010's recorded responsive gap stays open, now with its stacking rule.**
  design.md §3's bottom-anchored quick-add below `md` is still unbuilt; the gap's
  recorded owner was "FEAT-013 or a foundations pass, once the bottom region's
  other tenants (undo-snackbar) exist". The tenant now exists, and the rule is
  written above (snackbar stacks *above* the composer, `--space-4` clear) — but
  moving the composer is a change to SCR-WEB-008's structure with no FR behind it
  in this slice, so the gap is **carried, not closed**, with the collision
  pre-resolved for whoever lands it.
- **Two toast hosts now exist** — `lists-nav.tsx`'s local list-action toast and
  this feature's root-layout undo host — while design.md §4 describes a single
  `toast` region. They can theoretically overlap (rename a list, then delete a
  task within ~7 s). Not fixed here: unifying them means editing FEAT-009's
  shipped component (D1's rule). Recommended foundations item: promote the undo
  host to the app's one toast host and migrate `lists-nav`'s toast into it —
  cheap, and it makes design.md §4 literally true.
- **No new screen, no inventory change, no SCR minted.** Both screens' inventory
  entries already list **UC-012** (SCR-WEB-008: UC-009/010/011/012; SCR-WEB-010:
  UC-010/011/012), which is the ux-foundations evidence behind technical-design
  §8's suggested plan correction — the plan's FEAT-013 row lists only SCR-WEB-008,
  and the delete control is on SCR-WEB-010.
- **Carried deviation (not new, not escalated): no icon library.** design.md
  specifies Lucide; none is wired, so the delete control is text-labelled
  ("Delete task") rather than a trash icon — which is the more accessible
  treatment anyway, and consistent with every other control in the shell.
- **No "recently deleted" view exists** (technical-design D7): once the snackbar
  dismisses, the UI offers no path to a restore the API still allows for 30 days.
  Recorded as a candidate post-MVP requirement, not a gap in this slice —
  ux-foundations Flow 3 accepts exactly this.
