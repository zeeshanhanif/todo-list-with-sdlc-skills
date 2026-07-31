# UI Design: FEAT-016 — Smart views (Today / Upcoming / Overdue / All)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-009 (Smart View) · extends SCR-WEB-007 (App Shell) · Mode: per-feature · Status: Draft · Date: 2026-07-31
> Strategy: code-native (project fallback policy; no connected design tool holds this project's screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

SCR-WEB-009 is the last of the app's four main working surfaces to be built, and
it is almost entirely a **recomposition**: `app-shell`'s content column,
`sidebar-nav-item`, the full `task-row`, the list `badge` the 2026-07-31
`command-search` amendment established, and FEAT-015's Load-more control. Two
things here are genuinely new, and both are the design system finally being used
as written rather than extended: **skeleton rows** (design.md §4 specifies
`skeleton`; no screen has ever rendered one — D4) and the **per-context empty
copy** design.md §4 names explicitly ("empty list vs. empty smart view vs. no
search results" — D3). No amendment is filed and no component is forked.

## SCR-WEB-009 — Smart View

- **Strategy & source:** code-native (this section is the design). A **route**,
  `/views/{today|upcoming|overdue|all}` — one component, four URLs (D5). This is
  the deliberate opposite of SCR-WEB-012's overlay, for the opposite reason: a
  view is somewhere you *go*.
- **Purpose (ux-foundations):** "Today / Upcoming / Overdue / All aggregate"
  (inventory states: `loading`, `empty`, `populated`). Realizes UC-014 main 1–3
  and alt 2a.
- **Composition:** inside SCR-WEB-007's main column, at the same
  `--size-content-max` width as SCR-WEB-008 — switching between a list and a view
  must not shift the layout under the pointer. Top to bottom:
  1. **Header** — `h1` carrying the view's name (`Today` · `Upcoming` ·
     `Overdue` · `All`), with the same treatment as the list view's title, and
     beneath it a `small` `--color-text-muted` count line: *"8 tasks"*, or *"8
     tasks so far"* while a `nextCursor` remains (the contract carries no total —
     technical-design §3.1, the same honesty FEAT-015 applied).
  2. **No `quick-add` composer** — deliberately (D1).
  3. **A `ul` of `task-row`s**, in the server's order, which the client never
     re-sorts: due-ascending for Today/Upcoming/Overdue, newest-first for All
     (technical-design D2). Each row is the **full** `task-row` — complete
     `checkbox` + title + right cluster (due `chip`, priority dot) — **plus the
     originating list as a `badge`** (D2).
  4. **A "Load more" `button-secondary`**, rendered only while the response
     carried a `nextCursor` — FEAT-015 D4's convention, unchanged.
- **Content & data mapping** (technical-design §3.1):
  - Heading ← the `view` the response echoes (never the raw URL segment, so a
    stale in-flight response cannot render under the wrong heading)
  - Rows ← `results[]`; row link target ← `/tasks/{results[].id}` (SCR-WEB-010)
  - List badge ← `results[].listName` (UC-014 step 3's "with their originating
    list")
  - Due chip ← `results[].dueAt` + `results[].isOverdue`, rendered by the
    **existing** `DueChip` from `task-meta.tsx` (zone-aware via `useTimeZone()`)
  - Priority dot ← `results[].priority`, the existing `PriorityDot`
  - Checkbox ← the existing `TaskCheckbox`, binding to
    `POST /tasks/{id}/complete` and `POST /tasks/{id}/reopen` (FEAT-012)
  - "Load more" ← `nextCursor`, sent back as `?cursor=` on the same view
- **Conformance:** pass on every value (all tokens, no raw). No new component and
  no new token: `skeleton` and the per-context empty copy are design.md §4
  provisions being realized for the first time, not additions to it. One
  treatment is **reused rather than re-invented** — the list `badge` is the
  attribution pattern the 2026-07-31 `command-search` amendment settled for
  SCR-WEB-012, and the same pairing (`--color-primary-subtle` + `--color-primary`,
  5.47:1 light / 6.69:1 dark) carries it here.

### loading
**Skeleton rows** — design.md §4's `skeleton` and §4's "Loading: skeleton rows
(not a blank screen)" convention, realized here for the first time in the
product. Delivered as the route's own `loading.tsx`, so it is Next's streaming
fallback rather than a client state machine: six placeholder rows at
`--size-touch-target` height, `--color-surface-sunken` blocks with
`--radius-md`, matching the real rows' rhythm so the swap does not jump. The
region carries `aria-busy="true"`; there is **no shimmer animation** —
design.md §5 forbids conveying information by motion alone and a static
placeholder satisfies `prefers-reduced-motion` by construction.

The header renders immediately (the view name is known from the URL); only the
rows are skeletons. This state is reached on navigation between views and on a
cold load — never on a background refresh, which stays silent (FEAT-019
ui-design D1's rule, inherited).

### populated
The `ul` described above. Row anatomy, left to right:

- **complete `checkbox`** — the existing `TaskCheckbox`, a sibling of the row
  link and never nested inside it (FEAT-012 technical-design D6). Completing
  from a view removes the task from that (active-only) view on the next refresh
  — correct, and stated in technical-design D8 so it is not read as a
  disappearance bug.
- **title** (`body`, `--color-text`) — truncates last; the right cluster
  collapses before it does.
- **list `badge`** — `caption`, `--radius-full`, `--color-primary-subtle` bg +
  `--color-primary` text. Not optional and not first to drop: in a cross-list
  view it is the answer to "where does this live?" (D7).
- **due `chip`** and **priority dot** — the existing components, unchanged.
  In Overdue every row carries the danger-treated chip with the word "Overdue"
  (never colour alone — design.md §5); in Today most rows will read as a time.

No section split: unlike SCR-WEB-008 there is no "Completed" disclosure here,
because every view is active-only by FR-SRCH-008 — a completed section that
could never have a row in it would be furniture.

### empty
design.md §4's empty convention — icon slot + `h3` + one-line subtext + a
primary action — with **copy per view**, which is the distinction §4 itself
draws ("empty list vs. empty smart view vs. no search results"):

| View | `h3` | Subtext | Action |
| :-- | :-- | :-- | :-- |
| Today | "Nothing due today" | "Enjoy the quiet — or get a head start on what's coming." | **Add a task** → `/` |
| Upcoming | "Nothing coming up" | "Tasks with a future due date will land here." | **Add a task** → `/` |
| Overdue | "Nothing overdue" | "You're all caught up." | *(none — D3)* |
| All | "No active tasks" | "Everything's done, or nothing's started." | **Add a task** → `/` |

The action is a `button-secondary`-styled link to `/`, which FEAT-010
technical-design D2 already serves as the caller's default list — the nearest
place a task can actually be created, since this screen has no composer (D1).
It needs no list id and therefore no extra fetch.

### error
An `inline-alert` in the content column: `--color-danger-subtle` background with
**`--color-danger-text`** (6.80:1 light / 7.80:1 dark). **Never
`--color-danger` on that tint** — the 3.95:1 pairing DEF-003 fixed and DEF-006
is still open on elsewhere. One line — *"Couldn't load this view."* — plus a
**Retry** `button-tertiary` (`--color-primary-hover`, 6.21:1 on that tint, the
pairing `list-view-failure.tsx` already uses). In-shell: the sidebar stays
operable, so a failed view never strands the frame (NFR-USE-003).

A **failed background refresh is silent** and retried, never this state —
`error` is reserved for a load the user asked for (FEAT-019 ui-design's rule).

### not-found
A supplementary state beyond the inventory's three, and the screen's answer to
technical-design D6's `404 view_not_found`: `/views/bogus` renders the same
in-shell alert treatment as `error` with the copy *"That view doesn't exist."*
and a link back to `/`. It is a URL-typo state, not a data failure — no Retry,
because retrying a name that does not exist cannot succeed.

- **Responsive notes:** the content column follows the shell (§3): full-width
  below `md`, `--size-content-max` centred above. Rows keep
  `--size-touch-target` on touch viewports and may compact toward
  `--size-control-sm` at `≥ lg` per §3's adaptive density, exactly as
  SCR-WEB-008 does. **Below `sm` the list badge wraps to a second line beneath
  the title rather than being dropped** (D7) — it is the one piece of row data
  this screen exists to show.
- **Decisions:** D1–D7 below.

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **existing entry** (FEAT-004, extended by
  FEAT-009/010/011/019/008/015). Extended again here; the entry is updated, not
  duplicated.
- **What changes:** the sidebar's smart-view nav — three inert `<span>`s carried
  since FEAT-009 with the comment *"placeholders until FEAT-016 makes them
  real"* — becomes **four real `sidebar-nav-item` links**: Today, Upcoming,
  Overdue and **All**, the fourth view FR-SRCH-007 names and the placeholder set
  never had. Each takes design.md §4's selected state (`--color-primary-subtle`
  bg + `--color-primary` text + left accent bar, `aria-current="page"`) for the
  open view, and closes the mobile drawer when followed — the same behaviour
  FEAT-010 gave the list rows.
- **Content & data mapping:** the nav items consume no endpoint (D6 — no
  counts); the screens they open bind to `GET /views/{view}`. The shell's
  existing bindings are unchanged.
- **Conformance:** pass — no new component; `sidebar-nav-item`'s own
  description already reads "Used for smart views and lists."

### default
Unchanged apart from the four items becoming links with a selected state. Order
is fixed and matches FR-SRCH-008's own order — Today, Upcoming, Overdue, All —
rather than being sorted or user-arrangeable.

## Cross-screen decisions

- **D1 — A smart view has no `quick-add` composer.** Driver: every other task
  surface's composer creates *into a list*, and a cross-list view has no list to
  create into. The alternatives both lie to the user: defaulting to Inbox means a
  task typed under "Today" lands somewhere else with no due date and therefore
  **does not appear in the view it was typed into** — the worst possible answer;
  adding a list picker to the composer would put the product's heaviest control
  on its lightest screen for a case FEAT-010's `/` route already serves. The
  empty state links to `/` instead, so the path to creating a task is one click
  and lands somewhere the task will actually be visible. Rejected: both of the
  above. Consequence: SCR-WEB-009 is the product's only read-mostly task surface,
  which is why its empty state carries a link rather than a focused field
  (FEAT-010 ui-design D4's arrangement does not transfer).
- **D2 — The row is the FULL `task-row`, checkbox included — the opposite of
  FEAT-015 D2's subset, for the opposite reason.** Driver: FEAT-015 dropped the
  write controls because search's contract is a single `GET` and a checkbox that
  cannot complete is worse than no checkbox ("omit rather than fake", FEAT-010
  ui-design D2). Here the write **does** exist — `POST /tasks/{id}/complete` has
  shipped since FEAT-012 and the row is the same component — so the same rule
  points the other way: omitting a control that works would make Today a
  read-only copy of a list, and checking things off is what a Today list is
  *for*. The drag handle stays absent (FEAT-014 owns reorder, and reorder is
  within-list — meaningless in a cross-list aggregate). Rejected: mirroring
  search's subset for consistency between the two new-ish surfaces (consistency
  with the *contract* is what matters; the two surfaces differ in exactly the
  way their contracts do).
- **D3 — Empty copy is per view, and an empty Overdue gets no action.** Driver:
  design.md §4 asks for "distinct copy per context" and names the smart view as
  its own context; a generic "Nothing here yet" would waste the one moment the
  screen has something to say. The Overdue exception is the real decision: an
  empty Overdue is **good news**, and answering "you have nothing late" with "Add
  a task" reads as the product failing to notice. So that state alone ends at the
  subtext. Rejected: one shared empty block for all four (the §4 rule exists to
  prevent exactly that); a "Well done!" celebration treatment (design.md has no
  celebratory component and inventing one would be a fork).
- **D4 — `loading` is skeleton rows in a route-level `loading.tsx`, the
  product's first.** Driver: design.md §4 specifies `skeleton` and the data-view
  convention names skeleton rows, but no screen has rendered one — SCR-WEB-008
  recorded `loading` as "covered by server rendering", honestly, because its
  fetch resolves before first paint. A smart view aggregates across every list
  and is the most likely screen to make a user wait, and Next's `loading.tsx`
  gives the fallback for free without a client state machine. Static, not
  shimmering (design.md §5's motion rule). Rejected: a spinner (§4 reserves it
  for actions, not data views); no fallback at all (a blank column, which §4
  explicitly rules out). **Recommendation to implementation**: keep the skeleton
  markup in a component of its own — the next screen that needs one should reuse
  it rather than mint the second definition.
- **D5 — Views are routes with real URLs; search stays an overlay.** Driver:
  ux-foundations' IA lists Smart Views as a top-level destination beside Lists,
  and its inventory gives SCR-WEB-009 the loading/empty/populated states of a
  page, not the idle/dismissed lifecycle of a panel. Routes make a view
  linkable, bookmarkable and back-navigable — which is what "go to Today" means
  — and each view keeps its own scroll position and paging. This is FEAT-015 D1
  read from the other side: search is something you *do* and dismiss; a view is
  somewhere you *are*. Rejected: rendering views inside the search overlay's
  filters (it would bury four navigation destinations inside a dismissible panel
  and give them no URL).
- **D6 — The sidebar's smart-view items carry no count badges.** Driver:
  `sidebar-nav-item`'s count is optional in design.md, no FR asks for view
  counts (FR-LIST-005 asks only for per-list active counts, which the list rows
  already carry), and each badge would cost a second aggregate query per page
  load — four of them, on every navigation, for decoration. There is also a
  correctness trap: "Today" counts change at midnight in the user's zone, so a
  cached badge would be quietly wrong at exactly the hour it matters. Rejected:
  counts on Overdue only (the most defensible single case, but it makes the
  absence on the other three look like an oversight); counts computed client-side
  from the loaded page (only the current view has data, and only its first page).
- **D7 — Below `sm` the list badge wraps rather than dropping.** Driver: the
  standard responsive rule on this row (FEAT-010's) is that the right cluster
  collapses before the title. Applied naively here it would drop the list name
  first — the single piece of data that distinguishes this screen from a list
  view and the thing UC-014 step 3 explicitly asks for. So on narrow viewports
  the row becomes two lines: title, then badge + due chip beneath it. Rejected:
  dropping the badge below `sm` (loses the view's purpose on the viewport where
  smart views are most used); truncating the badge to an initial (an
  unreadable abbreviation of a user-authored name).

## Escalations & open items

- **No design-system amendment.** Every element is an existing design.md
  component used as specified; the two "new" things (skeleton rows, per-context
  empty copy) are provisions §4 already carries and no screen had yet used. Every
  pairing this screen renders was measured in the FEAT-008 acceptance sweep: body
  17.85:1 light / 14.59:1 dark, muted 4.76 / 6.64, the list badge's
  primary-on-primary-subtle 5.47 / 6.69, danger-text on the danger tint 6.80 /
  7.80, the Retry link's primary-hover on that tint 6.21. **Recommendation for
  implementation**: extend `e2e/tests/control-contrast.spec.ts`'s sweep to
  `/views/today` rather than writing a screen-local check.
- **The `error` and `not-found` alerts duplicate `list-view-failure.tsx`'s
  treatment rather than reusing the component.** Its copy is list-specific
  ("Couldn't load this list", "That list doesn't exist") and generalizing it
  means editing a shipped FEAT-010 component — the same call FEAT-013 D1 made
  about the toast hosts, made the same way. Recorded as a gap with the same
  owner: a foundations pass promoting one data-view failure component with
  per-surface copy. Not this feature's to do; flagged so it is a decision rather
  than drift.
- **DEF-006 and DEF-009 apply here.** This screen's error state uses
  `--color-danger-text` from the start, so it adds no DEF-006 instance; the
  missing product-wide focus ring (DEF-009) is inherited like everywhere else and
  is not this feature's to fix — worth naming because the sidebar's four new
  links are keyboard targets that would benefit most from it.
- **A view's scroll position and loaded pages are not preserved across
  navigation.** Leaving Today for a task and coming back re-fetches page 1. No FR
  asks otherwise, and the alternative (client-side view caching) is a state
  machine bought for a case the back button already handles acceptably. Recorded
  so it reads as a decision.
- **Not designed here:** per-view sort or filter controls (technical-design D2
  fixes one order per view, and filtering a view is search's job); a "This week"
  or custom view (FR-SRCH-008 names four); an inline due-date edit from a view
  row (SCR-WEB-010 owns editing, one click away).
