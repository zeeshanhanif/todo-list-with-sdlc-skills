# UI Design: FEAT-008 — View/edit profile (display name, timezone, theme)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-013 (Settings — Profile & Preferences) · extends SCR-WEB-007 (App Shell), SCR-WEB-014 (Settings — Security & Account) · Mode: per-feature · Status: Draft · Date: 2026-07-30
> Strategy: code-native (project fallback policy; the connected design tool holds no screen for this project — checked, not assumed)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

FEAT-008 is the first feature whose UI work is mostly *not* a new screen. One
screen is minted (SCR-WEB-013), but the feature's reach is product-wide: it
turns on the **dark theme** — which the design system has specified since
ux-foundations and which no screen has ever actually rendered — and it moves
every due-date the product displays off the browser's timezone and onto the
account's. Both are cross-screen concerns, so they lead the Cross-screen
decisions section rather than hiding inside SCR-WEB-013.

**No new component, no design-system amendment.** Every control below is an
existing design.md primitive; the one arrangement that is new (the settings
sub-nav) composes existing treatments rather than introducing a kind of thing
the system lacks.

## SCR-WEB-013 — Settings — Profile & Preferences

- **Strategy & source:** code-native (this section is the design). Served at
  **`/settings/profile`** inside the app shell (authenticated zone — the
  guarded-zone convention FEAT-006 D4 established).
- **Purpose (ux-foundations):** display name, timezone, theme (inventory
  states: `default`, `saving`, `error`). Realizes UC-007 main 1–4 + alt 3a.
- **Composition:** `app-shell` (sidebar + main column, `--content-max`
  centered, `--space-8` page padding) › **settings sub-nav** (D3) › `h1`
  "Profile & preferences" › one `card` holding four `field` blocks separated by
  1px `--color-border` rules:

  1. **Email** — a *static* `field`: label "Email" (`caption`,
     `--color-text`), value as text (`body`, `--color-text`), help (`small`,
     `--color-text-muted`) "Your email can't be changed." **Not a disabled
     input** (D4).
  2. **Display name** — `field`( `input type="text"`,
     `autocomplete="nickname"`, `maxLength={DISPLAY_NAME_MAX_LENGTH}` read from
     `@todo/shared` so the bound cannot drift from the server rule ) + `Save`
     `button-primary`. Help (`small`, `--color-text-muted`): *"Leave blank to
     use **{local part of the email}**."* — the fallback rendered through the
     shared `displayNameFor` helper, so the help text shows the user their
     actual fallback rather than describing one (D5).
  3. **Timezone** — `field`( `select`, options from the **browser's**
     `Intl.supportedValuesOf('timeZone')` grouped into `<optgroup>` by region
     prefix (Africa / America / Asia / …), each label the zone id with its
     underscores rendered as spaces ) (D6). Help: *"Used to show when your tasks
     are due."* Saves **on change** (D7), and **every due date already on
     screen re-reads in the new zone** as part of that save — UC-007 alt 4a,
     specified in D9 because it is the one visible effect of this screen that
     happens outside it.
  4. **Theme** — `field`( `radio` group, three options: **Light**, **Dark**,
     **Match system** ) themed per design.md §4 (`--color-primary` when on).
     Saves **on change**, and the whole product re-themes in the same tick
     (D1, D7).

  Below the card: a `link` (`button-tertiary` treatment) "Security & account →"
  is **not** needed — the sub-nav (D3) already carries it.
- **Content & data mapping** (technical-design §3):
  - Email value ← `GET /profile` → `profile.email`
  - Display-name input value ← `profile.displayName` (empty string when `null`);
    help fallback ← `displayNameFor({ displayName, email })`
  - Timezone select value ← `profile.timezone` (never `null` by the time this
    screen renders — the shell adopts the detected zone first; technical-design
    AC-7)
  - Theme radio value ← `profile.theme`
  - Writes: `PATCH /profile` carrying **only the field that changed** — the
    partial-patch contract (technical-design D6) is what makes three independent
    controls on one screen safe.
- **Conformance:** pass. `card`, `field`, `input`, `select`, `radio`,
  `button-primary`, `inline-alert`, `h1`, app-shell layout — all design.md
  components, all values tokens. **Measured in both themes** (Cross-screen D2);
  no correction needed, no escalation filed.

### default
The populated form: email as text, the display name (or an empty field showing
its fallback in help), the current zone selected, the current theme selected.
The sidebar's **Settings** item is in its selected state
(`--color-primary-subtle` bg + `--color-primary` text + left accent bar), and
the sub-nav's **Profile** link carries `aria-current="page"`.

### saving
Per-control, because the controls save independently (D7):
- **Display name** — `Save` enters design.md's `button-primary` loading state
  (spinner, disabled); the input stays enabled and keeps its value.
- **Timezone / theme** — the control that changed is `disabled` for the
  duration of its own write; the other controls stay live.
A single `aria-live="polite"` status region under the card announces
"Saving…" → "Saved" (design.md §5's async-results rule). No spinner overlays
the card; a settings write is a sub-second operation and a blocking overlay
would read as heavier than it is.

### success
Inline, not a toast: the status region reads "Saved" (`small`,
`--color-success-text` — 5.48:1 light / 11.17:1 dark) and clears on the next
edit. A `toast` is reserved for actions whose result leaves the screen (the
undo snackbar); here the result *is* the screen, so confirming in place is both
quieter and closer to the change.

### error
Two levels, per design.md's validation convention:
- **Field-level** (`400 validation_failed` with `fields[]`) — the message from
  `fields[0].message` under its own field (`small`, `--color-danger`: 4.83:1
  light / 6.16:1 dark), the input keeps the rejected value (NFR-REL-004), and
  the field's border goes `--color-danger`. Reachable for **Display name**
  (over `DISPLAY_NAME_MAX_LENGTH`, or a control character pasted in) and, in
  principle, for the two `select`/`radio` controls — whose values the UI can
  only ever pick from the legal set, so their field errors are a defence
  against a stale tab, not a normal path.
- **Form-level** (a `500`, a network failure, or a code the screen doesn't
  branch on) — an `inline-alert` at the top of the card: `--color-danger-subtle`
  background with **`--color-danger-text`** (6.8:1 light / 7.8:1 dark).
  **Never `--color-danger` on that tint** — that is the 3.95:1 pairing DEF-003
  fixed and DEF-006 is still open on elsewhere in the product; this screen must
  not add a sixth instance (Cross-screen D2).
On any error the previously-saved values remain what the server holds; nothing
on screen claims a change that did not land.

### unauthenticated
Server-side: `requireSession()` redirects to `/signin` (SCR-WEB-004) before the
screen renders — the guarded-zone convention. A `401` arriving mid-edit from
the BFF sends the client to `/signin` too, matching `change-password-form.tsx`.

- **Responsive notes:** inherits the shell — below `md` the sidebar becomes a
  drawer and the card spans the full-width column; the sub-nav's two links stay
  on one row (they are short); every control keeps the 44px touch minimum
  (`--touch-target`), and the `select` is the native control on mobile, which is
  the whole reason D6 chose it.
- **Decisions:** D4, D5, D6, D7 below (all screen-local); D1–D3, D8 and D9 are
  cross-screen.

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **existing entry** (designed by FEAT-004,
  extended by FEAT-009's sidebar and FEAT-011's detail host). This feature
  extends it again; the entry is updated, not duplicated.
- **What changes:**
  1. The **Settings** nav item's target moves from `/settings/security` to
     `/settings/profile` (technical-design D5 — ux-foundations' IA puts Profile
     & Preferences and Security & Account as siblings under Settings, and the
     preferences screen is the one visited routinely).
  2. The frame becomes the **preferences host**: it renders
     `PreferencesProvider` (timezone + theme + display name, fetched server-side
     alongside the lists) and `ThemeSync`. Nothing about the sidebar's
     appearance changes.
- **Content & data mapping:** bindings grow by `GET /profile` (the shell's own
  fetch) and `PATCH /profile` (the one-time timezone adoption, technical-design
  AC-7). The sidebar itself displays no profile data — the display name is
  **not** added to the sidebar in this feature (D8).
- **Conformance:** pass — no visual change beyond an `href`.

### default
Unchanged from FEAT-004/009/011, in **both** themes: the sidebar's selected nav
item measures 6.69:1 in dark (`--color-primary` on the composited
`--color-primary-subtle` tint) and 5.47:1 in light.

## SCR-WEB-014 — Settings — Security & Account (this feature's extension)

- **Strategy & source:** code-native; **existing entry** (designed by FEAT-006).
  Extended here with the settings sub-nav (D3) so the two settings screens are
  mutually reachable; its card, rows and copy are otherwise untouched.
- **Content & data mapping:** unchanged (the hub consumes no endpoint).
- **Conformance:** pass — the sub-nav is a composition of existing treatments,
  not a new component.

### default
As FEAT-006 specified, plus the sub-nav above the `h1`, with **Security &
account** carrying `aria-current="page"`.

## Cross-screen decisions

- **D1 — The theme is applied to `:root`, and the screen that changes it must
  re-theme the whole product in the same tick.** Driver: design.md §8 ("toggle
  `data-theme="dark"` on `:root`; all tokens re-value") and FR-PROF-004's
  "applied on load". Visually this means the theme control is **not** a preview
  widget: choosing Dark re-themes the sidebar, the detail panel and every
  surface behind the settings screen immediately, then persists. Rejected: a
  preview swatch requiring a Save press (the product's own chrome would
  disagree with the control describing it until the user committed, which reads
  as a bug). Consequence: the control's optimistic application is deliberate —
  and on a failed `PATCH` the attribute reverts with the form-level error, so
  the screen never shows a theme the server did not accept.
- **D2 — Both themes were measured, not assumed — and this is the first
  feature able to do that.** Driver: design.md's dark values have existed since
  ux-foundations and no screen has ever rendered them; DEF-003, DEF-004 and
  DEF-006 are all contrast defects that shipped because a pairing was reasoned
  about instead of computed. Every pairing this feature introduces was measured
  in **both** themes before this document was written:

  | Pairing | Light | Dark |
  | :-- | --: | --: |
  | body text on card `--color-surface` | 17.85 | 14.59 |
  | help text `--color-text-muted` on surface | 4.76 | 6.64 |
  | control boundary (muted) on surface | 4.76 | 6.64 |
  | field error `--color-danger` on surface | 4.83 | 6.16 |
  | alert `--color-danger-text` on danger tint | 6.80 | 7.80 |
  | `--color-success-text` on surface ("Saved") | 5.48 | 11.17 |
  | `button-primary` label (`--color-on-primary` on primary) | 5.47 | 9.09 |
  | primary link on surface | 5.47 | 9.15 |
  | selected nav item (primary on primary tint) | 5.47 | 6.69 |

  All ≥ 4.5:1 in both themes; nothing needed correcting and no amendment is
  filed. **One finding worth recording** (it belongs to the defect ledger, not
  to this screen): the DEF-003/DEF-006 pairing — `--color-danger` on
  `--color-danger-subtle` — measures **3.95:1 in light but 5.35:1 in dark**.
  DEF-006's five open sites are therefore a **light-theme-only** failure, which
  means testing them in dark would show them passing. Anyone verifying that
  defect must do it in light.
- **D3 — Settings gains a sub-nav; it is a composition, not a new component.**
  Driver: the IA now has two sibling screens under Settings and one sidebar
  item pointing at one of them; without mutual reachability, Security & Account
  becomes unreachable the moment the nav target moves (technical-design D5).
  The sub-nav is a semantic `<nav><ul><li><a>` styled with design.md's `tabs`
  treatment (selected: `--color-text` + 2px `--color-primary` bottom rule;
  unselected: `--color-text-muted`, hover `--color-surface-sunken`), with
  `aria-current="page"` on the active link. Rejected: shadcn `Tabs` proper (its
  semantics are same-page panels, and these are routes — a screen reader would
  be told there are panels to switch, and there are not); a back-link on each
  screen (asymmetric, and it grows badly when FEAT-017/018 add rows). Since
  these are real links, the keyboard behaviour is Tab-and-Enter, not the
  arrow-key roving a real tablist would owe.
- **D8 — The display name does not appear in the sidebar in this feature.**
  Driver: no FR asks for it, the shell has no identity block today, and adding
  one is a shell redesign that would need its own ux pass. Consequence:
  `displayNameFor` has exactly one consumer for now (SCR-WEB-013's help text);
  it lives in `@todo/shared` anyway so the second consumer inherits the rule
  rather than reinventing it.
- **D9 — Changing the timezone re-renders every due date already on screen
  (UC-007 alt 4a).** Driver: the use case's alternate flow says the system
  "recomputes due/overdue status against the new timezone", and the user's
  mental model after choosing a zone is that the product now speaks it. Because
  the zone lives in `PreferencesProvider` and the due-date functions read it
  through `useTimeZone()` (technical-design §5.2/§5.3), a successful save
  updates the context and every `DueChip` and picker in the tree re-reads —
  no reload, no refetch, and nothing to do per-consumer. What must **not**
  change is `isOverdue`: it is server-derived and timezone-invariant
  (technical-design D4), so a chip may re-read "Tomorrow 9:00" as "Today 23:30"
  while its overdue treatment stays exactly as it was. That combination looks
  surprising and is correct; it is called out here so a future screenshot review
  doesn't "fix" it. Consequence: the zone control's save path updates context
  **before** clearing the saving state, so the two never disagree on screen.

## Screen-local decisions (SCR-WEB-013)

- **D4 — Email renders as text, not as a disabled input.** Driver: FR-PROF-001
  makes email read-only in the MVP. A disabled input says "editable, but not
  right now" and invites a hunt for the unlock; static text says "this is not
  a field". It is also the accessible answer — disabled inputs are skipped by
  keyboard navigation, so the value would become unreachable to a screen-reader
  user tabbing the form. Rejected: `readonly` input (focusable and selectable,
  but still dressed as a control).
- **D5 — A blank display-name field means "unset", and the UI sends `null`,
  never `""`.** Driver: the contract deliberately splits the two —
  `displayName: null` unsets to the derived default, `""` is a validation error
  (technical-design D1, and UC-007 alt 3a's "empty"). A user who clears the
  field means the first, not the second, so the screen maps the blank field to
  `null` and the help text names the fallback they will get. UC-007 alt 3a's
  error path is still reachable and still specified — via too-long input — and
  the `""` rejection remains enforced at the API where a non-browser client
  meets it. This is the same shape as FEAT-002's reinterpretation of
  SCR-WEB-002's `rate-limited` state (a UI-side reading of a contract state,
  recorded on the manifest entry rather than left implicit). Rejected: a
  separate "Reset to default" button (a second way to say one thing, for a
  field most users will set once).
- **D6 — Native `select` with `<optgroup>`, not a searchable combobox.**
  Driver: ~418 zones is a lot for a native select, but the system has no
  combobox — `command-search` (§4) is a task-search overlay, not a generic
  one — so a combobox would mean escalating a design-system amendment for a
  component exactly one control in the product needs. The native control
  brings its own type-ahead (typing "Asia/K" jumps), its own keyboard model,
  and the platform picker on mobile. Rejected: escalating for a combobox now
  (the system should absorb that pattern when a second screen needs it —
  FEAT-015's search work is the likely moment, and this screen can adopt it
  then without a contract change). Consequence: the option list is built from
  the **browser's** zone database, while the server validates against
  **its own** (technical-design D2) — which is precisely why the server stores
  the string verbatim instead of re-canonicalizing it.
- **D7 — Selects and radios save on change; the text field saves on an explicit
  Save.** Driver: a choice from a fixed set is complete the moment it is made,
  and asking the user to confirm it adds a step with no decision in it; a text
  field is not complete until the user stops typing, and auto-saving it would
  either fire per keystroke or need a debounce whose timing is invisible and
  guessable-wrong. Each control PATCHes only its own field, which the partial
  contract (technical-design D6) makes safe. Rejected: one Save button for the
  whole form (it would force the theme choice to be a preview until Save,
  contradicting D1); auto-save on blur for the text field (a value abandoned by
  clicking away would be committed, which is the wrong default for a name).

## Escalations & open items

- **No design-system amendment filed.** Every control is an existing design.md
  primitive; the sub-nav composes existing treatments (D3); every pairing
  measured passes AA in both themes (D2). The system composed here without
  needing anything new — which is itself worth recording, because this is the
  first feature to exercise the dark theme at all.
- **Dark mode becomes reachable for every already-shipped screen, and none of
  them has ever been looked at in it.** The code is token-pure (a grep for raw
  hex/`rgb()` values across `apps/web/src` finds none — earlier features
  deliberately used `--color-on-primary` over literal white in
  `task-checkbox.tsx` and `task-delete.tsx`), so the re-valuation should be
  correct by construction. "Should be" is not "was checked": **recommendation
  for implementation** — extend `e2e/tests/control-contrast.spec.ts`, which
  already computes ratios at runtime across FEAT-001..011's screens, to run its
  sweep **twice, once per theme**. That spec was written for exactly this kind
  of cross-cutting rule, and FEAT-008 is the first feature that makes the second
  pass possible. It is a recommendation, not a task edit — tasks.md belongs to
  detailed-design.
- **DEF-006 remains open and is a light-theme-only defect** (measured, D2).
  This feature does not fix it; its five sites are a web-tier maintenance pass.
  The note is here so the eventual fix is verified in the theme where it fails.
- **The timezone option list is the browser's, not the server's.** Recorded as
  a consequence of D6/technical-design D2 rather than a gap: the two zone
  databases can differ in the spelling of aliases, which is why the server
  stores what it is sent. If a future browser offers a zone this server's ICU
  cannot resolve, the API answers `400 validation_failed` on `timezone` and the
  field shows it — a designed path, not an unhandled one.
