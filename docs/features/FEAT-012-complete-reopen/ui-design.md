# UI Design: FEAT-012 — Complete / reopen task

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-008 (List View — `task-row` checkbox + the completed section),
> SCR-WEB-010 (Task Detail — the status control) · Mode: per-feature ·
> Status: Draft · Date: 2026-07-29
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

Both screens already exist in the manifest; this feature **extends** them and
adds no new SCR. It also closes the third of FEAT-010 D2's four `task-row`
deferrals: after this slice only the drag handle (FEAT-014) is still honestly
absent.

The whole feature is one control — design.md's **`checkbox`**, the component the
system has specified since ux-foundations and no screen has yet rendered — plus
the collapsed section that control finally fills. Because it is the first
appearance of that component, every colour pairing it introduces was **measured
against `tokens.json`'s actual values** (WCAG 2.1 relative luminance) before
being specified, rather than taken from design.md's prose. That measurement is
what §Escalations is about: **three of design.md's own statements about the
checkbox do not survive it**, and one *shipped* component from FEAT-011 turns out
to fail the same rule. The specs below are written against the corrected
pairings, with each substitution measured and recorded.

## SCR-WEB-008 — List View (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**. The
  full screen spec remains at
  `features/FEAT-010-create-task/ui-design.md#scr-web-008--list-view`, extended by
  `features/FEAT-011-task-detail/ui-design.md#scr-web-008--list-view-this-features-extension`;
  this section records only this feature's delta.
- **Delta 1 — `task-row` gains its complete-`checkbox`.** design.md §4 specifies
  the row as complete-checkbox + title + right cluster; the checkbox has been the
  leading element in that spec from the start and is now real:
  - **Form:** `--radius-full` circle, 20px, inside a `--size-touch-target` (44px)
    hit area. Unchecked: 2px ring — **`--color-text-muted`, not
    `--color-border-strong`** (measured; §Escalations item 1). Checked:
    `--color-success` fill with a check glyph in **`--color-on-primary`** — the
    theme-aware ink token, not literal white (§Escalations item 2). The check
    animates in over `--duration-fast` with `--easing-standard`, suppressed under
    `prefers-reduced-motion` (design.md §5).
  - **Semantics:** a real `<input type="checkbox">` (visually restyled), labelled
    with the task title, so **Space toggles complete** — the keyboard rule
    design.md §5 states verbatim — and the checked state is announced without any
    ARIA of our own. Its `aria-live` region announces the result of the write
    (design.md §5: "`aria-live` for … async results").
  - **Placement (technical-design D6):** the checkbox is a **sibling of the row
    link, never a child of it**. The `<li>` is the flex container; the checkbox
    is its first child and the `<Link>` (title + right cluster) is the second.
    An interactive control inside an anchor is invalid markup with undefined
    activation behaviour — this is an accessibility constraint, not a layout
    preference. design.md's "full row is the click target for detail" therefore
    holds for the row **minus** the checkbox's own 44px target, which is the
    intended behaviour.
- **Delta 2 — the completed section becomes a collapsed disclosure**
  (FR-TASK-011). Where FEAT-010 specified a plain `Completed` heading that renders
  only when non-empty, the section is now a **`<details>`/`<summary>`** disclosure,
  **collapsed by default** (technical-design D5):
  - **Summary:** the existing `caption`, uppercase, `--color-text-muted` heading
    treatment, now carrying the **count** — `Completed (3)` — plus a disclosure
    triangle. A collapsed section with no count gives no sign anything is inside.
    Full-width, `--size-touch-target` minimum, standard focus ring; Enter **and**
    Space toggle it (native behaviour).
  - **Body:** the same `task-row`s, each with its checkbox **checked**, so
    unticking reopens the task in place — FR-TASK-011's "expand to review/reopen",
    served without a second surface.
  - **Absent entirely when nothing is completed** — unchanged from FEAT-010 D3,
    and now for a better reason: the section can be filled by a user action.
  - Completed rows: title `strikethrough` + `--color-text-muted` (design.md §8),
    and **no `--color-surface-sunken` hover tint** — see D3, which is a measured
    contrast decision rather than a styling one.
- **Delta 3 — the counts move.** The header's "N tasks left" subtitle and the
  sidebar's per-list count are `activeTaskCount`, so both drop on complete and
  rise on reopen. Nothing new is rendered; they are named here because they are
  the feature's most visible feedback and the reason the write refreshes the
  server components (technical-design D7).
- **Content & data mapping:** rows unchanged (`GET /lists/{listId}/tasks` →
  `active` / `completed`, already split by the server — FR-TASK-003). The
  checkbox issues **`POST /api/tasks/{id}/complete`** or
  **`POST /api/tasks/{id}/reopen`** → the API routes of the same names
  (technical-design §3.1/§3.2), **no request body**, → `200 { task }`; the island
  then refreshes the server components so the row changes section and the counts
  and chips re-derive from the server (technical-design D7). `task.completedAt`
  drives which section a row is in; `task.isOverdue` — already `false` for
  anything completed — drives the chip, so **completing visibly clears the
  overdue treatment without the screen re-implementing the rule** (technical-design
  D4). Errors: `401 unauthenticated` → `/signin`; `404 task_not_found` → the row
  is gone; anything else → D2's rollback.
- **Conformance:** **corrected, with a design-system amendment filed** (§Escalations
  items 1–3). Every element is an existing design.md component used as specified;
  the three corrections are all *token substitutions inside `checkbox`*, each
  measured, and each proposed back to the system rather than kept local.

### populated
As above: active rows with unchecked boxes, then the collapsed `Completed (N)`
disclosure. The two sections are the server's split, not a client filter.

### empty
Unchanged (FEAT-010's `#empty` / first-run copy). A list whose only tasks are
completed is **not** empty: it shows the collapsed section and no active rows —
and the empty-state block is suppressed, because "nothing here yet" would be
false. This is the one composition FEAT-010's spec could not previously reach.

### loading
Unchanged — server-rendered with its data. The checkbox's *own* in-flight state
is D1's: the box shows its optimistic target state with a reduced-opacity
treatment and is disabled until the write settles; the row does not move sections
until the refresh lands, so nothing jumps under the pointer mid-click.

### error
A failed transition **rolls the checkbox back to its pre-click state** and shows
a `small` `--color-danger` message beneath the row, announced via the row's
`aria-live` region — never a box that reads complete while the task is active
(AC-12). The rest of the list stays operable; the same transition can be retried
immediately. A `401` redirects to `/signin` (the authenticated-zone convention).
Load-time `error` and `not-found` are unchanged from FEAT-010's entry.

- **Responsive notes:** the checkbox keeps its 44px target at every width and is
  the row's first element in reading order, so the tab order is
  checkbox → row-link, matching the visual order. Below `md` the summary row keeps
  its 44px height. FEAT-010's recorded gap (the mobile bottom-anchored composer)
  is **untouched** by this feature.
- **Decisions:** D1, D2, D3 below.

## SCR-WEB-010 — Task Detail (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**. Full
  spec at `features/FEAT-011-task-detail/ui-design.md#scr-web-010--task-detail`;
  delta only here.
- **Delta — the status line becomes the status control.** FEAT-011 shipped a
  read-only `small` `--color-text-muted` line reading "Active" / "Completed", and
  recorded that the control was FEAT-012's. It now is: the same
  complete-`checkbox` specified above, at `--size-touch-target`, with an adjacent
  `body` label — **"Mark complete"** when active, **"Completed <date>"** when
  completed, the date formatted by the same helper the due chip uses (browser
  timezone; the wire stays UTC). The checkbox is the control; the text is its
  label, so there is exactly one target and one keyboard path (Space), identical
  to the list row's.
  - Because one `TaskDetail` component serves both the intercepted slide-in panel
    and the full-page route (FEAT-011 D1), the control appears in both with no
    second spec.
  - The **overdue chip disappears** when the task is completed — from the server's
    `isOverdue`, not a local rule.
  - Still deliberately absent, each with its owning feature: **delete**
    (FEAT-013) and the **`list-picker`** (no FR — FEAT-011 D3, unchanged).
- **Content & data mapping:** `POST /api/tasks/{id}/complete` / `…/reopen` →
  `200 { task }`, from which the panel re-renders — the same
  re-render-from-the-response pattern FEAT-011's per-field saves use, plus the
  refresh that updates the list behind the panel.
- **Conformance:** corrected, identically to SCR-WEB-008 and for the same measured
  reasons (§Escalations items 1–3) — it is the same component.

### viewing
Adds the status control described above; every other field unchanged.

### editing
Unchanged (per-field saves, FEAT-011 D2). The status control follows the same
rule: it owns its own in-flight and error state, and a failed toggle leaves the
other controls fully operable.

### error / not-found / loading
Unchanged from FEAT-011's entry. A failed toggle shows its message beside the
control and keeps the panel usable; it does not close or reset the panel.

- **Responsive notes:** at `< md` the control sits above the fold in the
  full-screen presentation — completing is the most common action on this screen
  and must not require a scroll.

## Cross-screen decisions

- **D1 — The checkbox is optimistic, and rolls back on failure.** Driver:
  completing a task is the most frequent write in the product and a checkbox that
  waits a round trip before moving feels broken; NFR-PERF-001's 300 ms bound makes
  the optimistic window short, and technical-design D2's idempotency makes a
  retry safe. The rollback is what keeps it honest — AC-12 forbids a box that
  shows complete while the row is active. Rejected: a pessimistic checkbox
  (correct but sluggish on the app's hottest path); an optimistic box that *stays*
  checked on failure and shows a toast (the state on screen would be a lie about
  what is stored, which is the exact failure mode DEF-003's neighbourhood of the
  codebase already fought); a `toast` for errors (the message belongs next to the
  control that failed — design.md reserves the undo snackbar shape for FEAT-013).
  Consequence: the row does **not** move sections optimistically — only the box's
  own state is optimistic. Moving the row before the server confirms would make a
  failure yank a row back across a section boundary, which is worse than a
  half-second delay.
- **D2 — One `checkbox` component, three call sites.** The list row, the completed
  row and the detail control are the same component with the same semantics,
  keyboard path and error treatment; only the label differs. Driver: design.md
  §7's "don't invent component variants", and the same
  build-it-once reasoning FEAT-011 D4 applied to the `due-date-picker`. Rejected:
  a separate "status toggle" for the detail panel (two implementations of one
  transition, guaranteed to drift in their error handling).
- **D3 — Completed rows do not take the `--color-surface-sunken` hover tint.**
  Driver: **measured** — `--color-text-muted` (#64748B) on `--color-surface`
  (#FFFFFF) is **4.76:1**, but on `--color-surface-sunken` (#F1F5F9) it is
  **4.34:1**, below the **4.5:1** design.md §5 requires for body text at the row's
  `body` (15px) size. Since design.md §8 mandates muted + strikethrough for
  completed titles, the tint is the part that must give. Hover feedback survives
  as the pointer cursor, the checkbox's own hover treatment, and the standard
  focus ring on keyboard. Rejected: darkening the completed title on hover (hover
  making a finished task look *more* active is backwards); a local darker grey
  (a raw value, i.e. a fork). Consequence: completed rows are visually calmer than
  active ones, which matches their status. The general form of this — *muted text
  is AA on `surface`/`background` but not on the `sunken` tint* — is recorded in
  §Escalations, because it is a system-wide fact and this feature is only the
  place it was measured.

## Escalations & open items

**One amendment packet filed toward ux-foundations, three items, all in
`docs/design.md`, none changing a token value. ✅ ACCEPTED AND LANDED 2026-07-29**
— design.md §2 (token table, contrast notes, two new rules), §4 (`checkbox`,
`input`/`textarea`/`select`), §5 (contrast and control-boundary bullets), §8
(quick reference) and §9 (amendment log + known gap) were amended;
`tokens.json` and `tokens.generated.css` are untouched, because no value changed.
**The product-wide question was ruled on, not deferred:** the line is WCAG
1.4.11's own — *is the boundary the identifier?* — so `checkbox`, `radio` and
`input`/`textarea`/`select` take `--color-text-muted`, while
`button-secondary`, cards and dividers keep `--color-border-strong` as decorative
emphasis. Shipped form controls are consequently behind the standard and are
tracked as **DEF-005**, an accessibility pass across the web tier rather than
per-feature rework. The original filing is kept below because the *reasoning* is
what the next control needs, not just the outcome.

All three are the same kind of
finding as FEAT-011's `--color-danger-text` escalation and DEF-003: the system's
§5 accessibility rule failing against the system's own §2/§4/§8 prose, found by
the first screen to render the component. Ratios below are computed from
`docs/tokens.json`'s actual values (WCAG 2.1 relative luminance), light and dark
both.

1. **`checkbox`'s unchecked ring fails the non-text contrast rule.** design.md §4
   specifies "2px `--color-border-strong` unchecked". Measured against the surface
   the row sits on: **1.48:1** light (#CBD5E1 on #FFFFFF) and **1.64:1** dark
   (#334155 on #131C2E). design.md §5 requires **≥ 3:1** for "UI graphics", and an
   unchecked checkbox's ring is the *only* thing that identifies the control and
   its state — the case that rule exists for. **Proposed:** `--color-text-muted`,
   which needs no new token and measures **4.76:1** light / **6.64:1** dark. The
   screens above are specified against the proposal. *Scope note:* design.md §4
   gives `input`/`textarea`/`select` the same `--color-border-strong` outline, so
   the same measurement applies to every form control in the product. That is
   **not** proposed as this feature's change — it is named so ux-foundations can
   decide the breadth, which is exactly the decision this skill must not make
   locally.
2. **§8's "white check" is a light-theme-only statement.** On dark,
   `--color-success` re-values to #34D399 and a white glyph on it measures
   **1.92:1** — a fail. The system already has the theme-aware ink token:
   `--color-on-primary` (#FFFFFF light, #04211D dark), giving **3.77:1** light and
   **8.81:1** dark. **Proposed:** §8 says `--color-on-primary`, not "white".
   Precedent for using an existing cross-family pairing rather than minting an
   `onSuccess` token: DEF-003's resolution used `--color-primary-hover` on the
   danger tint for the same reason.
3. **§2's token table contradicts §4 and §8 about the checked fill.** The table
   annotates `--color-primary-bright` as "Brand accent, **checkbox fill**,
   selection (non-text)", while §4 and §8 both specify `--color-success`. The
   contradiction is not merely editorial: a check glyph on
   `--color-primary-bright` measures **2.49:1** in `--color-on-primary`'s light
   value, so the §2 reading is unbuildable at AA. **Proposed:** drop "checkbox
   fill" from `--color-primary-bright`'s usage note; §4/§8's `--color-success`
   (3.77:1 with `--color-on-primary`) stands.

**Status: resolved — both manifest entries are `designed`, conformance `pass`.**
The escalation blocked **no structure, state, binding or composition** — it was
three token substitutions inside one component, the same scope FEAT-011's
escalation had, and the specs above were written against the proposals that were
then accepted verbatim. The loop cost was one decision, not one feature.

- **DEFECT FOUND IN SHIPPED CODE — routes to the maintenance path, not to this
  feature.** While measuring the completed row's hover (D3), the same pairing
  turned up in **`apps/web/src/components/task-meta.tsx`**, verified and accepted
  as part of FEAT-011: the **non-overdue** `DueChip` renders
  `--color-text-muted` on a `--color-surface-sunken` background at `caption`
  (12px) — **4.34:1**, below design.md §5's 4.5:1. The *overdue* variant is fine
  (**6.80:1**, the pairing DEF-003 fixed); it is the ordinary due-date chip that
  fails, on every task with a due date in the future. This is behaviour that
  acceptance-verification already accepted, so it is a **defect against
  NFR-USE-004**, not a ui-design escalation and not this feature's to fix inline.
  Recorded here for the orchestrator's defect ledger; the owning feature is
  **FEAT-011** (SCR-WEB-008 / SCR-WEB-010). Ledger note: the in-system candidates
  measured while finding it are `--color-text` (very high, but loses the metadata
  hierarchy) and leaving the chip's background transparent on `--color-surface`
  (**4.76:1** with the muted token unchanged) — the second is the smaller change,
  but the choice belongs to whoever picks the defect up.
- **Deferred to their owning features, unchanged:** the drag handle (FEAT-014) —
  after this slice, the **only** part of design.md's `task-row` still unbuilt; the
  delete action and undo-snackbar (FEAT-013); the `list-picker`, still a candidate
  **requirements** amendment rather than a screen (FEAT-011 D3).
- **Carried deviation (not new, not escalated): no icon library.** design.md
  specifies Lucide; none is wired. The check glyph and the disclosure triangle
  render as CSS/text glyphs with the semantics carried by the real `<input>` and
  `<summary>` elements, so nothing depends on the icon itself — the same carried
  deviation FEAT-004/006/009/010/011 record.
- **FEAT-010's recorded responsive gap stays open**: design.md §3's bottom-anchored
  mobile composer. Untouched by this feature.
- **No new screen, no inventory change, no SCR minted.** Both screens' inventory
  states are unchanged; this feature adds no state beyond the ones already
  registered.
