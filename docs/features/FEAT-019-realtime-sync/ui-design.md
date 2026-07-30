# UI Design: FEAT-019 — Realtime cross-device sync

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-007 (the sync island's mount), SCR-WEB-008 (live refresh),
> SCR-WEB-010 (live refresh + a state that becomes reachable without navigation)
> · Mode: per-feature · Status: Draft · Date: 2026-07-29
> **All three screens already exist** in `docs/design-manifest.json` (minted by
> FEAT-004/009, FEAT-010 and FEAT-011); this feature **updates their entries**
> and mints nothing. No SCR is minted, no inventory entry changes, no design.md
> component is added, and **no pixel changes**.
> **The finding this pass exists to produce:** the feature has no visual surface
> of its own, but it changes the *conditions* under which shipped screens
> re-render — for the first time in this product, a screen updates while the user
> is looking at it and did not ask. Everything below is about what must survive
> that (D2) and what must not be invented in response to it (D1).
> The plan's Screens cell also lists **SCR-WEB-009** (Smart Views). That screen
> does not exist yet — it is FEAT-016's — so it is out of scope here and inherits
> this behaviour for free when it is built (technical-design §8).

## SCR-WEB-007 — App Shell (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
  The delta is one mount and no markup.
- **Composition:** unchanged. `ShellFrame` gains a single non-rendering client
  island (`<SyncProvider />`, technical-design §5/D7) alongside the sidebar and
  main region. It draws nothing, occupies no space, and adds no landmark — the
  shell's DOM is byte-identical apart from the island's own absence of output.
- **Content & data mapping:** `GET /realtime/token` (technical-design §3.1) —
  consumed by the island only, never rendered. `{ enabled: false }` is not an
  error state and must not surface anywhere on the screen; it simply means the
  island runs its fallback schedule (technical-design D4).
- **Conformance:** pass. No component, token or pattern is introduced — which is
  the conformance result this screen wants, since design.md specifies no sync,
  connection, offline or stale component to conform *to* (D1).

### ready
Unchanged. The island is mounted and invisible. **No connection indicator, no
"live" dot, no last-updated timestamp** — D1.

### loading / error / signing-out
Unchanged, and deliberately untouched by sync: a failure to mint a token or open
a socket is **not** a shell error state (it degrades latency, not function —
arch §8, NFR-REL-004). The shell's existing `error` state stays reserved for a
failure to load the caller's lists.

- **Responsive notes:** none. An island that renders nothing has no breakpoints;
  the `< md` drawer is unaffected.
- **Decisions:** the mount point itself is technical-design D7 (the shell is the
  only wrapper that is authenticated-zone-only). This document's ruling is the
  negative one: it stays invisible — see D1.

## SCR-WEB-008 — List View (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
- **Composition:** unchanged — no new element, no new region, no badge. What
  changes is *when* the existing composition re-renders: the server-rendered
  header count, `active`/`completed` sections and sidebar badges may now update
  from another device's write, with no interaction on this one.
- **Content & data mapping:** unchanged bindings
  (`GET /lists/{listId}/tasks` and the write endpoints already listed). Sync adds
  no read of its own — that is D1 of the technical design: the refresh is the
  same server render the screen already does.
- **Conformance:** pass. Nothing is added; the two rules this screen must hold to
  are design.md §5's (no information conveyed by motion alone; respect
  `prefers-reduced-motion`), both satisfied by animating nothing (D5).

### populated
Rows, sections and counts may change between one paint and the next.
**No arrival or departure treatment**: a row that appears from another device's
write appears exactly as a row appears after a local write — no flash, no
highlight, no slide, no "new" marker (D1, D5). A row that disappears leaves no
trace and **no undo affordance** — undo belongs to the device that deleted
(FEAT-013 D7, restated here because this is the screen where its absence is
first *visible* to someone who did not act — D4).

### empty
Newly reachable without interaction: the last active task can now be completed or
deleted from another device while this screen is open, so the empty state — or
the completed-only composition FEAT-012 specified — can arrive on its own. Both
render exactly as already specified; no transitional state is introduced.

### not-found
**Newly reachable without navigation.** The open list can be deleted from another
device; the next refresh renders the existing uniform in-shell not-found alert
(FEAT-010's supplement). It is **not** redirected away from and **not**
auto-dismissed: the user is left on a screen that explains itself, with the
sidebar still offering every other list (D3).

### loading / error
Unchanged. A background refresh **never** shows the loading state — there is no
spinner, skeleton or dimming for an update the user did not request (D1); the
screen shows the previous content until the new content replaces it. A failed
background refresh is silent and retried on the next signal or tick; it must not
render the `error` state, which stays reserved for a failed *user-initiated*
load.

- **Responsive notes:** none new. The recorded mobile-composer gap and the
  two-toast-hosts gap are **carried unchanged** — this feature adds no toast and
  moves nothing.
- **Decisions:** see D1–D4; all four are cross-screen.

## SCR-WEB-010 — Task Detail (this feature's extension)

- **Strategy & source:** code-native; **updates the existing manifest entry**.
- **Composition:** unchanged, in both presentations (the intercepted panel and
  the full page — FEAT-011 D1's one component).
- **Content & data mapping:** unchanged bindings. The panel re-renders on the
  same refresh as the list behind it, since `router.refresh()` re-renders the
  route's slots together (technical-design D1).
- **Conformance:** pass; nothing added.

### viewing
Title, due date, priority and status may update from another device. No
treatment marks them as changed (D1).

### editing
**The rule this screen owes the feature:** a background refresh must never
overwrite a field the user is currently editing. FEAT-011 D2 saves per field on
commit, and each control already holds its own uncommitted value — the
uncommitted value **wins** until the user commits or reverts, whatever the
refresh brought. No merge prompt, no "this changed elsewhere" warning: the
committing PATCH is last-write-wins by contract, and inventing a conflict UI here
would be a screen forking a decision the API did not make (D2).

### confirming
The delete confirm dialog (FEAT-013) **stays open** across a refresh, with its
focus trap and its focused control intact (D2). If the task was deleted on
another device meanwhile, the confirm still issues its `DELETE`, which is
idempotent by design and returns the original `deletedAt` (FEAT-013 D3) — so the
user is never told their action failed when the outcome they asked for holds.

### not-found
**Newly reachable without navigation**, and the more disruptive of the two: the
open task can be deleted from another device while its panel is on screen. The
panel **does not close itself** — closing would read as the app dismissing the
user's context without being asked. It renders the existing uniform not-found
alert in place, and the user closes it (Esc / the close control / the scrim), with
focus returned to the row that opened it as it already is (D3).

### loading / error
Unchanged, and as with SCR-WEB-008: no background refresh shows a loading state,
and a failed one is silent.

- **Responsive notes:** none new.
- **Decisions:** see D2, D3.

## Cross-screen decisions

- **D1 — The refresh is silent: no indicator, no announcement, no arrival
  treatment.** Driver: three things pointing the same way. (1) design.md
  specifies **no** sync, connection, offline, stale or "new changes" component —
  inventing one here would be a screen forking the system, which this skill
  escalates rather than does, and there is nothing to escalate *for*: no FR and
  no NFR asks for it (NFR-REL-004's "clear error state" is about failed user
  actions, which keep their existing inline errors). (2) A polite live-region
  announcement would have to fire **blind**: `router.refresh()` re-renders the
  route wholesale and the client holds no data store to diff against
  (technical-design D1), so the island cannot know whether anything changed —
  the announcement would fire on every poll (as often as every 4 s in the
  fallback configuration, technical-design D4) and say "updated" when nothing
  had. Silence beats a status message that is wrong most of the time. (3) A row
  highlight or entry animation would convey "this is new" by motion alone, which
  design.md §5 forbids, and would need reduced-motion handling for information
  available nowhere else (D5). Rejected: a "live"/"reconnecting" dot in the shell
  (no component, no requirement, and it turns an invisible degradation into a
  visible worry); a "New changes — refresh" prompt (design.md has no such
  component, and it converts automatic sync into a chore — the opposite of
  NFR-PERF-004's intent); a per-row flash. Consequence: sync is felt, never seen.
  A stale-state indicator is recorded as a **candidate post-MVP requirement**
  (technical-design §8), not a gap in this spec.
- **D2 — Non-destructive refresh is a screen requirement, and it is enumerated
  here rather than left to implementation.** Driver: this is the first feature in
  the product that re-renders a screen the user did not ask to re-render, so
  "nothing breaks" has to be a specification, not an assumption. Across all three
  screens, a background refresh must preserve: **focus** (including inside the
  confirm dialog's trap and inside the `< md` drawer), **scroll position**,
  **uncommitted input** (the quick-add composer's text and the detail panel's
  per-field edits — the uncommitted value wins, `editing` above), **open
  overlays** (confirm dialog, list dialog, drawer, detail panel), **the undo
  snackbar and its remaining timer**, and **in-flight optimistic controls** (a
  checkbox mid-write must not snap back because a refresh landed). Rejected:
  treating these as implementation details (they are the entire user-visible
  contract of an invisible feature, and each is a bug that would only ever be
  found by a user mid-action); a "pause sync while a dialog is open" rule (it
  trades a rare visual surprise for a screen that is quietly stale precisely when
  the user is about to act on it). Consequence: technical-design AC-9 asserts
  four of these; the rest are specified here and belong in the screen's own
  verification.
- **D3 — When the thing on screen is deleted elsewhere, the screen explains
  itself in place; it never navigates or closes on the user's behalf.** Driver:
  sync makes both `not-found` states reachable with no interaction, and the two
  tempting reactions — redirect the list view to the default list, auto-close the
  detail panel — both take control away from someone who did nothing wrong, and
  both destroy the context that explains what happened. The existing uniform
  not-found alert (FEAT-010/FEAT-011 supplements) already says the right thing.
  Rejected: auto-redirect; auto-close; a toast on the receiving device ("a task
  was deleted on another device") — that is a change-log the product has no
  requirement for, and it would need to fire for every remote change to be
  consistent. Consequence: two states designed months ago gain a new entry path
  and **no new design work** — recorded in the manifest so verification checks
  them rather than assuming they were considered.
- **D4 — Undo stays local to the deleting device.** Driver: FEAT-013 D7 put the
  undo affordance on the device that deleted, within ~7 s; a remote deletion
  arrives on this screen as a row that is simply gone. Rejected: broadcasting the
  undo window to other devices (the signal is content-free by design — ADR-006,
  technical-design §3.2 — so the receiving device does not even know *what* was
  deleted, and giving it that knowledge would put task identity on the wire for
  a UI nicety). Consequence: on the receiving device a row can vanish
  unexplained. Accepted, and it is the same trade the product already made for
  the ~7 s window; recorded here because this screen is where it becomes
  observable.
- **D5 — Nothing animates, so `prefers-reduced-motion` needs no new handling.**
  Driver: technical-design §8 explicitly asked ui-design to rule on this. With
  D1's no-arrival-treatment answer there is no motion introduced by sync at all —
  the refresh is a re-render, not a transition — so design.md §5's motion rules
  are satisfied by construction rather than by a media query. Rejected: a
  cross-fade on refresh (motion for its own sake, and it would make every 4 s
  fallback tick visible). Consequence: if a later feature ever *does* want an
  arrival treatment, it inherits an open question, not a shipped animation.

## Escalations & open items

- **No design-system amendment filed, and none is owed.** This feature adds no
  component, no token, no state and no pattern; every conformance result above is
  a plain pass. The one thing design.md lacks — a sync/stale/connection component
  — is deliberately **not** escalated, because D1 concludes the product should
  not have one, and filing an amendment for a component we argue against would be
  noise in ux-foundations' queue. If a stale-state indicator is ever required, it
  arrives as a requirement first (technical-design §8's candidate post-MVP item),
  and *then* as an amendment.
- **The manifest's `contract_bindings` grow on SCR-WEB-007 only**
  (`GET /realtime/token`). SCR-WEB-008 and SCR-WEB-010 gain no binding: they
  consume the same endpoints they already did, more often.
- **Two carried gaps on SCR-WEB-008, unchanged and still not this feature's**:
  the mobile bottom-anchored quick-add (design.md §3, unbuilt since FEAT-010) and
  the two toast hosts where design.md §4 describes one (FEAT-013). This feature
  adds no toast and moves no composer.
- **DEF-006 is open and untouched here** — five shipped inline-alert sites at
  3.95:1, including two on screens this document covers. It is a maintenance-route
  defect with its own ledger row, not FEAT-019 rework, and this spec must not be
  the vehicle for fixing it.
- **SCR-WEB-009 (Smart Views) inherits, unbuilt.** When FEAT-016 mints it inside
  the shell it gets live refresh with no work, because the island is mounted once
  in SCR-WEB-007 and the signal is screen-agnostic (technical-design D7/D8). The
  plan's FEAT-019 Screens cell should drop it or annotate it "inherited when
  built" (implementation-planning owns the row); nothing is blocked.
- **Verification note for the auditor:** this feature's UI is provable mostly by
  *absence* — no indicator, no announcement, no animation, no auto-navigation.
  D2's preservation list is the positive half and is where the real assertions
  live (AC-9 covers four items; focus, scroll, drawer and snackbar-timer
  preservation are specified here and should be checked with it).
