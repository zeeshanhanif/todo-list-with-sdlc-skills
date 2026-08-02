# UI Design: FEAT-017 — Export personal data (JSON)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-016 (Export Data), SCR-WEB-014 (Settings — Security & Account, extension) · Mode: per-feature · Status: Draft · Date: 2026-08-01
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-017 adds the **second leaf** under the Security & Account hub, built to the
shape SCR-WEB-015 (Change Password) established in FEAT-006: a back link, an
`h1`, and one `card` holding the action. Both screens are compositions of
existing design.md primitives — **no new component, no design-system amendment**.

The screen's substance is not its layout, which is simple, but three honesty
problems the contract creates: the file's *scope* is narrower than "everything"
(soft-deleted tasks are out, technical-design D7), the download is a **silent**
browser event that needs a visible counterpart, and the filename is computed by
a rule the user cannot see. Each is addressed in the states below.

## SCR-WEB-016 — Export Data

- **Strategy & source:** code-native (this section is the design). Served at
  **`/settings/security/export`** inside the app shell — the leaf route pattern
  `/settings/security/password` set (FEAT-006 D1); an unresolved session
  redirects to `/signin` server-side (the guarded-zone convention, FEAT-006 D4).
- **Purpose (ux-foundations):** "Confirm + download JSON export" (inventory
  states: `default`, `preparing`, `ready`). Realizes UC-015 steps 1 and 3.
- **Composition:** `app-shell` (sidebar, `Settings` nav item selected) › back
  `link` "← Security & account" (`small`, `--color-primary`) › `h1` "Export your
  data" › a lead paragraph (`body`, `--color-text-muted`) › one `card`
  (`--color-surface`, 1px `--color-border`, `--radius-lg`, `--shadow-sm`,
  `--space-5` padding) containing: a "What's in the file" `ul` (`small`,
  `--color-text-muted`, real list semantics per §5), the `button-primary`
  **"Export my data"**, and below it the status region that carries the
  `preparing` / `ready` / `error` states.
- **Content & data mapping:** `POST /account/export` (technical-design §3.1) —
  the only endpoint. The screen sends **no request body** and renders nothing
  from the response *except* two derived numbers in the `ready` state:
  `lists.length` and the sum of `lists[].tasks.length`, both computed client-side
  from the document already in hand (D3). The filename comes from the response's
  `Content-Disposition`, falling back to `accountExportFilename(exportedAt,
  timeZone)` from `@todo/shared` (technical-design D5) — never a second
  independently-built string.
- **Conformance:** pass — `card`, `button-primary`, `inline-alert`, `link`, `h1`,
  app-shell layout, all design.md components themed by tokens. No off-system
  colour, component or pattern; nothing escalated.

### default

Card copy, in design.md §6's voice — warm and brief, and *specific*, because
this is the one screen whose job is telling the truth about a file's contents:

> **Export your data**
> Download everything in your account as one JSON file. It's yours to keep,
> open, or move somewhere else.
>
> **What's in the file**
> - Your account details — email, display name, timezone and theme
> - All of your lists, in the order you arranged them
> - Every task in them, active and completed, with due dates and priorities
> - **Not** the tasks you've deleted — restore one first if you want it included

The last bullet is required, not editorial: technical-design D7 excludes
soft-deleted tasks, and FEAT-013's 30-day restore window means a user can act on
this sentence. An export screen that lets a user believe deleted tasks are in the
file would be the screen lying about the only thing it does.

`button-primary` "Export my data" — a verb, sentence case (§6). Enabled, focus
ring per §5. No `confirm-dialog` (D1).

### preparing

The `button-primary` **loading** state design.md §4 already specifies: spinner in
the button, disabled, `cursor: not-allowed`, label → "Preparing your export…".
The status region below the button carries the same words as text for the
`aria-live="polite"` announcement (§5 — "aria-live for toasts and async
results"). No skeleton: nothing on this screen is being replaced by fetched
content, so design.md's skeleton convention doesn't apply — the wait is an action's
duration, which is what the in-button spinner is for.

Duration expectation: sub-second in the ordinary case, up to the 2 s budget
technical-design AC-10 measures at the NFR-SCAL-002 ceiling. Fast enough that this
state may flash; slow enough that it must exist.

### ready

An `inline-alert`, **success** variant (`--color-success-subtle` bg with its
`*-text` partner, per §2's tint-pairing rule), inside the card below the button:

> Your export is ready — **todo-export-2026-08-01.json** is in your downloads.
> 5 lists · 42 tasks.

The button returns to its default label so a second export is one click away
(exports are idempotent — technical-design §3.1 — so there is nothing to guard
against here).

Three deliberate properties:

1. **The filename is shown.** The browser's download UI is chrome this app does
   not control and cannot rely on being noticed; naming the file is how the user
   knows *what to look for* and confirms the download was the thing they asked
   for.
2. **The counts are shown.** They are the cheapest possible receipt that the
   file is not empty or truncated — the failure mode a user cannot otherwise
   detect without opening the JSON.
3. **It is text in the page, not a `toast`.** A toast auto-dismisses in ~5 s
   (§4); this is a result the user may want to read after switching to their file
   manager and back. The undo-snackbar's ephemerality suits a reversible action
   with a deadline — this is the opposite.

### error

*State supplement — the inventory lists only `default`, `preparing`, `ready`.*
Recorded here rather than added to ux-foundations because it introduces nothing
new: it is design.md's standard **data-view error convention** (§4 — inline-alert
+ plain explanation + retry), which NFR-USE-003 requires of every screen that
consumes an endpoint, and which technical-design AC-14 asserts.

`inline-alert`, **danger** variant: `--color-danger-subtle` bg with
**`--color-danger-text`** — never `--color-danger`, which measures 3.95:1 on that
tint (§5; DEF-006 fixed seven shipped instances of exactly this, and
`inline-alert-contrast.spec.ts` now guards it).

> Couldn't build your export just now. Nothing was downloaded — try again.

Plain and reassuring, not playful (§6's tone flex). A "Try again" action re-runs
the request; the screen returns to `default` on retry. Nothing is downloaded and
no partial file is written — the client holds the whole document in memory before
it creates the blob, so a failed request cannot produce a truncated file.

A `401` is not this state: an expired session redirects to `/signin` like every
other guarded route (FEAT-006 D4).

- **Responsive notes:** the card is single-column at every breakpoint — there is
  one action and one paragraph, so nothing reflows. Below `md` the card spans the
  content column with the shell's standard padding; the `button-primary` goes
  full-width, as the auth forms already do. The 48px `--control-md` button height
  clears the 44px touch target (§5) unchanged.
- **Decisions:** see D1–D3 below.

## SCR-WEB-014 — Settings — Security & Account (this feature's extension)

- **Strategy & source:** **registered** — this screen already has a manifest
  entry (`FEAT-006`, code-native, spec at
  `features/FEAT-006-change-password/ui-design.md#scr-web-014--settings--security--account`),
  extended once already by FEAT-008's settings sub-nav. This section is the
  **delta spec** only; the base spec and the FEAT-008 extension stand unchanged.
- **What changes:** one additional generic `list-row` in the existing `card`,
  second in the list, in exactly the pattern the base spec described and reserved:

  > **Export data** — help: "Download your lists and tasks as a JSON file."
  > → `/settings/security/export` (SCR-WEB-016)

  Same row treatment as "Change password": label (`body`, `--color-text`) over one
  line of help (`small`, `--color-text-muted`), a real `<Link>` covering the full
  row, 1px `--color-border` bottom rule between rows, hover
  `--color-surface-sunken`, 44px minimum height, standard focus ring.
- **Order:** Change password → Export data → *(Delete account, FEAT-018)*. Least
  to most consequential, top to bottom, so the irreversible action FEAT-018 adds
  lands last rather than beside the routine one.
- **Content & data mapping:** unchanged — the hub stays pure navigation and
  consumes no endpoint, so it still has no loading / empty / error states (not
  gaps).
- **Conformance:** pass — no new component; the row pattern is the one already
  registered for this screen.

### default
The card now renders two rows instead of one. Nothing else on the screen moves.

## Cross-screen decisions

**D1 — no confirm dialog; the button press *is* the confirmation.**
*Decision:* SCR-WEB-016 gets no `confirm-dialog`, despite the inventory's phrasing
"Confirm + download JSON export".
*Driver:* design.md §4 scopes `confirm-dialog` to "confirmed **destructive**
actions only", and NFR-USE-002 — the requirement behind it — names delete list,
delete task, delete account. An export destroys nothing, changes nothing, and is
repeatable; a modal asking "are you sure you want to keep your own data?" would
teach users to dismiss confirmations reflexively, which is the behaviour
NFR-USE-002 depends on *not* happening when FEAT-018's dialog arrives on the
adjacent row.
*Rejected:* reading "Confirm" as a modal. The inventory's own state list —
`default, preparing, ready`, with no `confirming` — reads the same way: the
"confirm" step is the deliberate navigation to a dedicated screen and an explicit
button press, not a modal.

**D2 — the `ready` state is required because the download is silent.**
*Decision:* a persistent in-page result, not reliance on the browser's download
indicator.
*Driver:* the download is triggered programmatically (technical-design §5.2: blob
→ object URL → synthetic anchor click). Browsers vary in how visibly they
announce that, several announce it not at all to a screen reader, and on mobile
Safari it may open a share sheet instead. With no in-page result, a successful
export and a silently-failed one look identical. The `aria-live="polite"` status
region makes the transition audible as well as visible (§5).
*Rejected:* a `toast` (auto-dismisses — see the `ready` state's third property);
trusting the browser chrome.

**D3 — counts come from the downloaded document, never a second endpoint.**
*Decision:* the "5 lists · 42 tasks" receipt is computed client-side from the
document the client already holds.
*Driver:* it costs one `reduce` over data in memory. A preview-counts endpoint
would add a contract, a second source of truth for numbers the file already
determines, and a window in which the preview and the file disagree.
*Consequence:* counts exist only in the `ready` state — there is deliberately no
"you have N tasks" preview *before* exporting, which would need exactly the
endpoint this rejects.

**Settings leaf shape, inherited not re-decided:** back link + `h1` + card, no
`SettingsNav` sub-nav (that belongs to the two settings *sections*, not their
leaves) — the shape `/settings/security/password` already ships. Recorded so the
implementer copies it deliberately rather than by accident.

## Escalations & open items

**Design-system amendments filed:** none. Both screens compose from existing
design.md components; no off-system value was needed and nothing was forked.

**State supplement recorded:** SCR-WEB-016 `error` (above) — not in the
ux-foundations inventory, which lists `default, preparing, ready`. It is
design.md's standard error convention rather than a new pattern, so it is
registered as a supplement on the manifest entry rather than escalated as an
inventory correction. Worth noting that the inventory's three states describe the
*happy path* of an operation that can fail; NFR-USE-003 supplies the fourth.

**Open items:**

1. **Mobile Safari's handling of a programmatic blob download** is the one
   behaviour this design cannot fully specify from the system: it may present a
   share sheet or an in-place preview rather than a file. D2's visible `ready`
   state is what keeps the screen honest in either case, but the actual mobile
   behaviour should be *observed* during implementation rather than assumed, and
   the copy ("is in your downloads") adjusted if it turns out to be wrong there.
2. **No import.** Nothing on this screen implies the file can be brought back in
   — the copy says "open, or move somewhere else", not "restore". Flagged because
   an export screen invites the question, and FR-DATA has no import requirement
   to answer it with.
