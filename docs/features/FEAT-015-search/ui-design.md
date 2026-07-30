# UI Design: FEAT-015 — Keyword search + status/due filters + pagination

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-012 (Search) · extends SCR-WEB-007 (App Shell) · Mode: per-feature · Status: Draft · Date: 2026-07-31
> Design-system amendment filed and applied: design.md §4 `command-search` (see §Escalations)
> Strategy: code-native (project fallback policy; no connected design tool holds this project's screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

SCR-WEB-012 is the product's first **overlay** surface and its first
**incrementally-loading** one. Both are patterns the design system already has
parts for — `dialog`, `input`, `select`, `badge`, `task-row` — so the screen is a
composition, with one exception that was **escalated rather than forked**:
design.md §4's one-line sketch of `command-search` said results were "grouped by
list", which could not hold alongside the contract this screen binds to. The
amendment was approved and applied on 2026-07-31 (design.md §4 reworded, §9
logged); see Escalations for the reasoning.

## SCR-WEB-012 — Search

- **Strategy & source:** code-native (this section is the design). An **overlay**
  over whatever the user was doing, not a route — opened from the shell, closed
  back to it, at any URL inside the authenticated zone (D1).
- **Purpose (ux-foundations):** keyword search + filters overlay (inventory
  states: `idle`, `loading`, `results`, `empty`). Realizes UC-013 main 1–3 and
  alt 2a.
- **Composition:** design.md §4 `dialog` (centred card, `--radius-lg`,
  `--shadow-lg`, `--color-overlay` scrim, focus-trapped, Esc closes) containing,
  top to bottom:
  1. **The query field** — `input type="search"`, autofocused on open,
     `placeholder` "Search your tasks", `maxLength={SEARCH_QUERY_MAX_LENGTH}`
     read from `@todo/shared`. Boundary `--color-text-muted` per §2's
     control-boundary rule (the DEF-005 line).
  2. **Two filter `select`s side by side** — **Status** (Any · Active ·
     Completed · Overdue) and **Due** (Any · Today · Upcoming · Overdue · No due
     date). "Any" is the absence of the parameter, not a value sent (D3).
  3. **The results region** — the state machine below.
  4. **A "Load more" `button-secondary`**, present only while the response
     carried a `nextCursor` (D4).
- **Content & data mapping** (technical-design §3.1):
  - Row title ← `results[].title`; row link target ← `/tasks/{results[].id}`
    (SCR-WEB-010, which already exists)
  - List chip ← `results[].listName` (FR-SRCH-002's "the list it belongs to")
  - Due chip ← `results[].dueAt` + `results[].isOverdue`, rendered by the
    **existing** `DueChip` from `task-meta.tsx` — already zone-aware through
    `useTimeZone()`, so a due date reads identically here and in the list view
  - Priority dot ← `results[].priority`, the existing `PriorityDot`
  - Completed treatment ← `results[].completedAt` (FR-SRCH-002's "status")
  - Query params sent: `q`, `status`, `due`, `limit`, `cursor` — and **nothing is
    sent until at least one criterion exists**, which is the client half of
    technical-design D6
- **Conformance:** pass on every value (all tokens, no raw). One escalation was
  filed on `command-search`'s "grouped by list" description and **resolved by
  amendment** (below), so this screen conforms to the design system as it now
  stands. No token and no new component: the row is a documented subset of
  `task-row` (D2), and the filters are plain `select`s (D3).

### idle
The state before any criterion exists — the reason technical-design D6 makes an
empty query a `400` rather than "everything". The results region holds one line
of guidance (`body`, `--color-text-muted`): *"Search by keyword, or filter by
status and due date."* No spinner, no zero-count, no empty-state message: nothing
has been asked yet, and saying "no tasks match" here would be the empty state
lying about a question the user never asked.

### loading
The results region shows a centred `spinner` with the polite label "Searching…"
in an `aria-live="polite"` region (design.md §5's async-results rule). **The
query field stays live and keeps focus** — a search box that steals or blocks
input while it thinks is unusable at typing speed. Previous results stay on
screen underneath at reduced emphasis rather than being cleared to blank, so
each keystroke does not flash the panel (D5).

### results
A `ul` of rows, one per `results[]`, in the server's order (newest first —
technical-design D2; the client does not re-sort). Each row is a `li > a`
covering the full row, ≥ 44px (§5), hover `--color-surface-sunken`:

- **title** (`body`, `--color-text`; strikethrough + `--color-text-muted` when
  `completedAt` is non-null — the completed treatment design.md §8 already
  defines)
- **list chip** — `badge` with `--color-primary-subtle` background and
  `--color-primary` text (5.47:1 light / 6.69:1 dark, measured in the FEAT-008
  sweep)
- **due chip** and **priority dot** — the existing components, unchanged

Above the list, a count line (`small`, `--color-text-muted`): *"12 results"* —
or *"12 results so far"* while a `nextCursor` remains, because the total is
deliberately not in the contract (technical-design D7's neighbour: no count
query is issued).

### empty
`results: []` on a request that **was** made: a centred message (`body`,
`--color-text`) *"No tasks match."* with one line beneath (`small`,
`--color-text-muted`) echoing the active criteria — *"keyword "report" · active ·
due today"* — and a `button-tertiary` **Clear filters** that drops the filters
while keeping the keyword. Distinct from **idle** by construction: idle has no
criteria to echo (FR-SRCH-006, AC-6).

### error
An `inline-alert` above the results region: `--color-danger-subtle` background
with **`--color-danger-text`** (6.80:1 light / 7.80:1 dark). **Never
`--color-danger` on that tint** — the 3.95:1 pairing DEF-003 fixed and DEF-006 is
still open on in five other places. The message is one line plus a **Retry**
`button-tertiary`; the query and filters are preserved (NFR-REL-004), because
losing a typed query to a transient failure is the most annoying possible
outcome here.

- **Responsive notes:** ≥ `md` the overlay is a centred card, `--size-content-max`
  wide at most, with the results region scrolling inside it (the page behind does
  not scroll). Below `md` it is **full-screen** — the same rule design.md §3
  gives the detail panel — with the query field pinned to the top and the results
  scrolling under it. The two filter `select`s stack below `sm`.
- **Decisions:** D1–D6 below.

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **existing entry** (FEAT-004, extended by
  FEAT-009/010/011/019/008). Extended again here; the entry is updated, not
  duplicated.
- **What changes:** the sidebar gains a **Search** affordance above the smart-view
  items — a `button` styled as the `command-search` field (a muted, bordered
  field-looking control showing "Search" and the shortcut hint) that opens the
  overlay. The shell also owns the **global shortcut** and the overlay's mount
  point, because the overlay must be reachable from every authenticated screen,
  not only from one (D1).
- **Content & data mapping:** the trigger consumes no endpoint; the overlay it
  opens binds to `GET /search`. The shell's existing bindings are unchanged.
- **Conformance:** pass — one new control composed from existing treatments.

### default
Unchanged apart from the new trigger. The trigger is a real `button` with an
accessible name ("Search tasks"), not a decorative field, so it is reachable by
keyboard like every other sidebar control.

## Cross-screen decisions

- **D1 — Search is an overlay mounted in the shell, not a route.** Driver:
  ux-foundations' inventory calls SCR-WEB-012 a "filters overlay", and the
  behaviour it implies is *find something without losing your place* — a route
  would push the user's current list off screen and put search in their back
  history, so dismissing it would navigate rather than close. Mounting it in
  `shell-frame` (the authenticated-zone client frame, where `SyncProvider`,
  `ThemeSync` and the detail host already live) makes it reachable from every
  screen with one mount. Rejected: `/search` as a page (the back-button and
  lost-context problems above; it would also need its own empty shell state);
  putting the trigger only on the list view (search is global — FR-SRCH-001
  matches "across all of the user's lists"). Consequence: the overlay has no
  URL, so a search cannot be linked or restored on reload — accepted for the
  MVP, and recorded in Open items.
- **D2 — A search result row is a documented *subset* of `task-row`, not a new
  component and not the full one.** Driver: design.md §4's `task-row` carries a
  complete-checkbox and a drag handle; both are **writes**, and this feature is
  read-only (technical-design §3 has one `GET`). Rendering a checkbox that
  cannot complete, or a drag handle that cannot reorder, would be worse than
  omitting them — the rule FEAT-010 ui-design D2 set ("omit rather than fake")
  and FEAT-011 followed for the same component. What the row *does* keep is
  every read affordance: title, list, due chip, priority dot, completed
  treatment. Rejected: the full `task-row` with disabled controls (a disabled
  checkbox invites a hunt for the unlock); a bespoke "search result" component
  (a second task presentation to keep in sync with the first).
- **D3 — Filters are two `select`s with an explicit "Any" option, not filter
  chips.** Driver: the design system has `select` and `radio`; it has **no**
  toggle-chip or segmented control, and minting one for a screen that is the only
  consumer would be an amendment bought for one use (the judgment FEAT-008 D6
  made about the timezone combobox, applied again). `select` also gives keyboard
  and mobile behaviour for free. "Any" is the first option and means *the
  parameter is not sent* — so the API's "at least one criterion" rule
  (technical-design D6) is satisfied by the keyword or by a non-Any filter, and
  the UI never has to explain the rule. Rejected: chips/segmented control (needs
  an amendment); checkboxes for multi-select within a dimension (the contract is
  single-valued per dimension — FR-SRCH-003/004 name one bucket each, and
  multi-select would be a contract change, not a screen decision).
- **D4 — Pagination is "Load more", not pages or infinite scroll.** Driver:
  FR-SRCH-009 permits either pagination or incremental loading, and the contract
  hands back an opaque `nextCursor` (technical-design D4) which is exactly an
  append token. In an overlay with a scrolling region, a **Load more** button is
  the accessible form: it is a real control with a name, it does not fire on
  scroll position (which screen-reader and keyboard users cannot easily
  trigger), and it never re-orders what is already read. Rejected: numbered
  pages (the cursor is opaque, so page 5 is not addressable — and the contract
  is deliberately keyset, technical-design D4); infinite scroll on intersection
  (a keyboard user tabbing through results would never reach the bottom to
  trigger it, and the loading state becomes ambiguous).
- **D5 — The query is debounced, and results are not cleared while a new one is
  in flight.** Driver: an un-debounced field issues a request per keystroke —
  "report" is six searches, five of them wasted, and their responses can land out
  of order. A ~250 ms debounce plus **discarding responses that are not for the
  current query** keeps the panel honest. Not clearing the previous results
  during a fetch is the other half: clearing makes every keystroke flash the
  overlay empty, which reads as "no matches" a dozen times while the user types a
  word that matches. Rejected: search-on-Enter only (it makes filters feel
  broken, since they change results without a keystroke to submit); no debounce
  (the request storm above).
- **D6 — The overlay's keyboard contract, in full.** design.md §5 requires
  focus-trapping, Esc-to-close with focus restored, and arrow-key movement within
  lists; this screen owns the specifics: **Ctrl/⌘ + K** opens it from anywhere in
  the authenticated zone, **Esc** closes and returns focus to the trigger,
  **↑/↓** move through the result rows, **Enter** opens the focused result (and
  closes the overlay), **Tab** cycles within the trap: query → status → due →
  results → Load more. The shortcut is an addition to the system rather than a
  contradiction of it — design.md §5 names Enter/Space/Esc/arrows but no global
  shortcut, so this screen mints one and records it here for the next screen that
  wants one.

## Escalations & open items

- **ESCALATION — RESOLVED 2026-07-31.** *Filed against `command-search`'s
  "grouped by list" description; the amendment was approved and applied to
  design.md (§4 reworded, §9 logged). The resolution is recorded at the end of
  this item — the reasoning is kept in full because it is why the component now
  reads as it does.*

  **The conflict:** `command-search`'s description was
  unbuildable alongside FR-SRCH-009 and could not be honoured here. design.md §4
  reads: *"`command-search` — search field opening an overlay of results grouped
  by list."* Three things conflict with it:
  1. **Pagination fragments groups.** Results are keyset-paginated (25 at a
     time, technical-design D4/FR-SRCH-009), so a list's matching tasks can span
     pages — a "Work" group would appear on page 1 and again on page 3, and no
     group is ever known to be complete until the last page loads.
  2. **Grouping contradicts the result order.** technical-design D2 orders
     results newest-first across all lists; grouping imposes a list-major order,
     in which "newest first" holds only *within* a group.
  3. **The requirement asks for attribution, not grouping.** FR-SRCH-002 says
     the system shall "present each search result **with the list it belongs
     to**" — a per-row property, which the list chip delivers exactly.

  **The amendment, approved and applied 2026-07-31**: design.md §4's
  `command-search` line now reads *"search field opening an overlay of results,
  **each labelled with the list it belongs to**"*, and adds that the overlay
  renders the server's order without regrouping or re-sorting. §9 carries the
  dated entry with this reasoning. It was a description correction — **no
  component forked, no token changed**, and nothing else in the system referenced
  grouping.

  **Consequence for this screen: none.** The spec above was written to what the
  requirements and the contract demand, which is exactly what the amended line
  now says — so the per-row list chips are the design system's rule rather than a
  deviation from it, and the manifest entry is `pass`.
- **No other design-system amendment.** Every other element is an existing
  design.md component used as specified, and every pairing this screen renders
  was measured in the FEAT-008 acceptance sweep: body text 17.85 : 1 light /
  14.59 : 1 dark, muted 4.76 / 6.64, danger-text on the danger tint 6.80 / 7.80,
  the list chip's primary-on-primary-subtle 5.47 / 6.69, the `select` boundary
  4.76 / 6.64 against the 3 : 1 rule. **Recommendation for implementation**:
  extend `e2e/tests/control-contrast.spec.ts`'s sweep to this screen rather than
  writing a screen-local check — it is the cross-cutting home for exactly this
  rule, and FEAT-008 established running it per theme.
- **DEF-009 (no explicit focus ring, product-wide) applies here and is not this
  feature's to fix.** The overlay's controls inherit the browser default like
  every other screen. Worth naming because an overlay with a focus trap is where
  a weak focus indicator hurts most — a keyboard user inside a trap has no
  landmarks other than the ring.
- **A search cannot be linked or restored** (D1's consequence): no URL, so
  reloading closes it. No FR asks for shareable searches, and adding a query
  string later is additive — recorded so it is a decision rather than an
  oversight.
- **Highlighting the matched substring in results is not specified.** The data
  needed is already in the response (the query and the title), so it can be added
  later without a contract change. Left out because design.md defines no
  highlight/mark treatment, and inventing one would be a fork.
