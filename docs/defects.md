# Defect Ledger

Append-only record of defects found after a feature was verified. Owned by the
sdlc-orchestrator (the maintenance route); IDs are sequential, immutable, never
recycled.

| DEF | Reported | FR / Feature | Symptom (one line) | Fixed by | Re-verified |
| :-- | :------- | :----------- | :----------------- | :------- | :---------- |
| DEF-001 | 2026-07-27 | *(no FR — test infrastructure)* / FEAT-003, FEAT-005, FEAT-006 suites | Specs sharing an IP range delete each other's `auth_rate_buckets` rows mid-test, breaking `429` assertions | `24ae0d3` (disjoint ranges + `rate-limit-isolation.spec.ts` guard) | 2026-07-27 — guard red before / green after; flake rate ~25% → ~8% |
| DEF-002 | 2026-07-27 | *(no FR — test infrastructure)* / api suite | **Open.** Residual ~7% flakiness after DEF-001: a *different* test fails each run, always "a row that should exist doesn't". Cross-worker DB interference **ruled out** — per-worker databases were tried and reverted. **Updated 2026-07-31 (FEAT-015 implementation): it is NOT parallel-only.** A full `--runInBand` run failed with the same signature (`expected 201, got 404` on a list the fixture had just created); the test passed in isolation and the next serial run was clean. The row previously said "parallel-run flakiness", which would send a fixer looking for cross-worker causes that are already ruled out — the trigger is order- or timing-dependent *within* a worker | _open_ | _open_ |
| DEF-003 | 2026-07-28 | NFR-USE-004 (design.md §5 contrast) / FEAT-010, SCR-WEB-008 | `list-view-failure.tsx`'s alert put `--color-danger` text on `--color-danger-subtle` — **3.95:1**, below the 4.5:1 design.md §5 requires. Fixing it surfaced a **second** failure the report had missed: the action inside the tint at **4.48:1** | `bd200ec` (partner tokens; 3.95→6.80 and 4.48→6.21) | 2026-07-28 — measured, rendered output checked, e2e 15 green |
| DEF-004 | 2026-07-29 | NFR-USE-004 (design.md §5 contrast) / FEAT-011, SCR-WEB-008 + SCR-WEB-010; **also FEAT-009**'s sidebar badge (2nd instance) | `task-meta.tsx`'s **non-overdue** `DueChip` put `--color-text-muted` on `--color-surface-sunken` — **4.34:1** at `caption` (12px), below the 4.5:1 design.md §5 requires. The *overdue* variant was fine (6.80:1, the pairing DEF-003 fixed); it was the ordinary due-date chip that failed — and `lists-nav.tsx`'s count badge, found by grepping the pairing | `1294811` (text on the sunken tint takes `--color-text`; 4.34→16.30 light, 7.05→15.49 dark) | 2026-07-29 — failing contrast test red before / green after; FEAT-011 report re-verified **Accepted (unchanged)**; api 191, e2e 19 |
| DEF-005 | 2026-07-29 | NFR-USE-004 (design.md §5 control boundaries) / all web form controls, FEAT-001/002/003/005/006/009/010/011 | Every `input`/`textarea`/`select` in `apps/web` outlined in `--color-border-strong` — **1.48:1** light / **1.64:1** dark, below the 3:1 §5 requires for a boundary that is the control's only identifier. A web-tier accessibility pass, not per-feature work | `d27af38` (13 sites → `--color-text-muted`; 1.48→4.76 light, 1.64→6.64 dark) | 2026-07-29 — `control-contrast.spec.ts` sweep red before / green after across 8 screens; api 191, worker 20, e2e 21 |
| DEF-008 | 2026-07-30 | NFR-MAINT-003 / walking skeleton — `apps/api` config layer | `loadConfig()` re-read `process.env` and re-ran its coercions on **every call**, and it was called per-request from 21 sites (session guard, rate-limit guard, db, auth, realtime). Config is ambient rather than declared, and values that cannot change during a process's life were rebuilt thousands of times a minute. Raised by the user reviewing the DEF-007 fix | `16f580c` (built once at boot, injected as `APP_CONFIG`; `loadConfig` → `readConfig`) | 2026-07-30 — api 247 serial, worker 24, web 23, e2e 30 ×2 consecutive; lint/boundaries/build clean |
| DEF-007 | 2026-07-30 | NFR-MAINT-003 (externalized config) / walking skeleton — affects every env-driven setting in `apps/api` and `apps/worker` | `loadConfig()` called dotenv with no path, so it resolved `.env` against the **process CWD** — which is `apps/api` when started as a workspace script. The repo's only `.env` is at the root, so `npm run dev:api` / `npm run start -w @todo/api` silently ran on **defaults**, ignoring every value an operator set. `.env.example` says "Copy to .env for local development", so the documented path did not work | `8cafe7e` (env loading moved to the entrypoint, resolved by walking up; `loadConfig()` is now a pure read) | 2026-07-30 — guard red before / green after; the reported symptom reproduced and gone (`npm run start -w @todo/api` now logs `envFile` + honours `REALTIME_PROVIDER`); api 247, worker 24, web 23, e2e 30 |
| DEF-006 | 2026-07-29 | NFR-USE-004 (design.md §5 contrast) / FEAT-001, FEAT-003, FEAT-005, FEAT-009 — the **inline-alert** instances DEF-003 and DEF-004 both missed | Five shipped sites still put `--color-danger` on `--color-danger-subtle` at `small` — the **3.95:1** pairing DEF-003 measured and `--color-danger-text` (6.80:1) exists to replace: `app/signup/page.tsx:89`, `app/signin/page.tsx:128`, `app/reset-password/page.tsx:46`, `components/lists-nav.tsx:117`, `components/list-dialog.tsx:196`. A web-tier pass, not per-feature rework. **Two more found during the fix**: the sign-up alert contains two LINKS carrying their own `--color-danger` on the same tint | `edfe9b0` (all seven → `--color-danger-text`; a rendered sweep and a source sweep added) | 2026-08-01 — both guards red before / green after; 3.95→6.80:1 light, 8.31:1 dark; FEAT-001/003/005/009 re-verified **Accepted (unchanged)**; api 442, web 78, e2e 53 |
| DEF-009 | 2026-07-30 | NFR-USE-004 (design.md §5 focus) / product-wide — every screen since FEAT-001 | design.md §5 requires "a visible 2px `--color-focus-ring` ring with 2px offset on `:focus-visible`" and the token exists in both themes, but **no CSS in `apps/web` ever set it** — every screen relied on the browser's 1px default since the first slice. Found by FEAT-008 acceptance while verifying AC-16's keyboard clause; the default indicator is visible, so this was a design-system conformance gap, not an accessibility blocker. A web-tier pass like DEF-005/DEF-006, not per-feature rework | `70b4a30` (one `:focus-visible` rule in globals.css, width and offset from `--border-width-thick`) | 2026-08-01 — guard red before (1px measured) / green after; ring confirmed unclipped visually in row and sidebar; product-wide re-verification **Accepted (unchanged)**; api 442, web 78, e2e 53 |
| DEF-010 | 2026-08-01 | FR-SRCH-007/008 (smart views) / FEAT-016 — `views.service.spec` AC-2 and `smart-views.spec` UC-014 | **Test defect, not a product defect.** Both fixtures assume a wall-clock condition that holds for only part of each day: the unit test needs New York and Calcutta to share a calendar date (false after ~14:30 NY), and the E2E seeds a task at `now() + 5 hours` and expects it in Today (false after 19:00 UTC). The product is correct in both cases — verified by inspecting the seeded instants against the rule. One root cause, two symptoms; CI would fail daily for part of the day | `3fd7619` (both fixtures derive their zone from the current instant — `Etc/GMT±N`, fixed offset, no DST) | 2026-08-01 — red before / green after; arithmetic checked across all 24 UTC hours; FEAT-016 re-verified **Accepted (unchanged)**; api 442, e2e 48 |
| DEF-012 | 2026-08-01 | NFR-USE-004 (design.md §5 contrast) / the **guards themselves** — `control-contrast.spec.ts` (DEF-005) and `inline-alert-contrast.spec.ts` (DEF-006) | The two standing contrast sweeps **never set the dark theme**, so every ratio the project has measured is a light-theme ratio. Their helpers also read `getComputedStyle().backgroundColor` and skip only *fully* transparent values, so they could not measure dark correctly even if pointed at it: the dark tints are `rgba(…, 0.15)` over the surface, and comparing text against that raw value computes a ratio no pixel ever had. Found by FEAT-017's acceptance, whose own both-themes guard went red on its first run for exactly this reason | `e2e/tests/contrast.ts` (shared, compositing measurement) + both sweeps parametrised over `["light","dark"]` | 2026-08-01 — **no product defect found**: every existing pairing already conformed in dark. The guards were incomplete, not wrong. Discrimination proven in both themes; e2e 60 → **65** |
| DEF-011 | 2026-08-01 | NFR-USE-004 (design.md §5 targets) / product-wide — icon-only controls since FEAT-009 | Icon-only buttons are **40px** (`--size-control-md`) on every viewport, where design.md §4 specifies "40px (**44px touch**)" and §5 requires "≥ 44×44px on touch viewports". No coarse-pointer rule exists anywhere in `apps/web`, so the touch size was never implemented. Found by FEAT-014 acceptance (AC-12 names the 44px target explicitly). A web-tier pass like DEF-005/DEF-006/DEF-009, not per-feature rework — `detail-panel.tsx` already shows the codebase's own answer | `1838a4d` (lists-nav's two icon buttons → `--size-touch-target`; FEAT-014's three fixed in its own rework at `152de92`) | 2026-08-01 — `e2e/tests/touch-target.spec.ts` measured 40×40 before / ≥44×44 after; FEAT-009 re-verified **Accepted (unchanged)**; api 442, e2e 48 |
| DEF-013 | 2026-08-02 | *(no FR — test infrastructure)* / api suite, product-wide | `auth_rate_buckets` rows survive between suite runs, and every spec's `nextIp()` counter restarts at `.1`, so two runs inside one **15-minute** window hit the same `(ip, route, window_start)` keys and their counts **add up**. Measured: one key went **31 → 62 → 93** across three consecutive runs against a default `AUTH_RATELIMIT_MAX` of **30**; the specs that omit `X-Forwarded-For` share a single bucket keyed on the localhost socket address, which was found sitting at **135** registrations for one window. Any spec whose per-run usage crosses its limit on a later run gets `429` where it expects success — the suite's repeatability depended on what time it was and how recently it last ran. Found while investigating DEF-002; **a distinct defect, and not DEF-002's cause** (the failures observed there are `404`s in two specs that both raise the limit to 1000) | `6ceaef5` (globalSetup truncates the table; `rate-limit-bucket-hygiene.spec.ts` guards it) | 2026-08-02 — guard red before (both assertions) / green after; a deliberately seeded 900-count stale bucket is cleared by a normal run; api 529, worker 51, web 96 twice consecutively |
| DEF-014 | 2026-08-03 | *(no FR — test infrastructure)* / e2e suite, `profile.spec.ts` UC-007 (the click is FEAT-004's sign-out control on SCR-WEB-007) | The suite drives the web tier in **dev mode**, and Next's dev tools indicator is a `<nextjs-portal>` fixed to the viewport's **bottom-left** — where the shell's sign-out control sits (`marginTop: auto` in the sidebar footer). It hit-tests above the app, so Playwright's actionability check will not click through it: `getByTestId("sign-out").click()` retried 53× and timed out at 30s in CI. **Not CI-specific and not a product defect** — the indicator mounts ~**1s after paint**, so it is a race the machine's speed decides: measured locally, the click point is the button at T+0 and `<nextjs-portal>` from T+1000ms onward. The whole UC-007 test finishes in 1.6s on a warm dev machine and clicks ~20s in on CI, which is the entire difference between green and red. Production is unaffected — `next build` output has no indicator. CI had been red on this since **2026-07-31** (3 consecutive runs) | `59d379d` (`devIndicators: false` behind `NEXT_DISABLE_DEV_INDICATORS`, set by the e2e webServer env; `dev-overlay.spec.ts` guards it) | 2026-08-03 — guard red before (named `<nextjs-portal>` as the interceptor) / green after; full CI-equivalent green: api 529, worker 51, web 96, **e2e 70** with 2 workers |
| DEF-015 | 2026-08-03 | FR-PROF-003 (timezone governs due-date reading) / **FEAT-011** — SCR-WEB-010's intercepted panel; reported against FEAT-008's preference | The task-detail **panel** (soft navigation from a row) shows a due date in **UTC** while every other surface shows the account's zone: a task created at 10:58 PM in `Asia/Karachi` (UTC+5) lists as `Today 10:58 PM` and opens in the panel reading `05:58 PM`. Cause: `@detail` is a **parallel route**, so the root layout renders it as a *sibling* of `children` — outside the app shell, therefore outside the `PreferencesProvider` the shell mounts (FEAT-008 §5.2) — and `useTimeZone()` fell through to its `"UTC"` fallback. The full page at `/tasks/{id}` renders inside `AppShell` and was always correct, so **one URL showed two different clocks** depending on how it was reached. **Not display-only:** the input writes back through `fromDateTimeLocalValue(v, timeZone)` with the same wrong zone, so a user typing 22:58 stored **22:58Z** instead of 17:58Z — measured — moving the task five hours. Reported by the user | `{FIXCOMMIT}` (the slot is its own preferences host; profile fetched in the same `Promise.all` as the task) | 2026-08-03 — guard red before on both clauses / green after; **acceptance re-verification of FEAT-011 still pending** |

## DEF-006 — the inline-alert instances of the DEF-003 pairing

**Reported:** 2026-07-29, by FEAT-013's ui-design, while specifying a confirm
dialog whose error slot copies `list-dialog.tsx`.

**Symptom.** `--color-danger` (#DC2626) on `--color-danger-subtle` (#FEE2E2)
measures **3.95:1** — the exact pairing DEF-003 measured and fixed — and design.md
§5 requires 4.5:1 at `small` (14px). Five sites still carry it:
`app/signup/page.tsx:89-91` (FEAT-001), `app/signin/page.tsx:128-130` (FEAT-003),
`app/reset-password/page.tsx:46-48` (FEAT-005), `components/lists-nav.tsx:117-119`
and `components/list-dialog.tsx:196-198` (FEAT-009). The partner token
`--color-danger-text` (6.80:1 light / 7.8:1 dark) has existed since the
2026-07-28 amendment.

**Why two earlier sweeps missed it.** DEF-003 fixed the *screen-level failure*
component it was found in (`list-view-failure.tsx`) and DEF-004 swept the
**chip/badge** shape of the same family. Neither grepped for the pairing in
**form-level inline alerts**, which is where the remaining five live. Worth
recording as a method note: each of these three defects was found by rendering
one new thing and looking, not by the sweep the previous one ran — the sweeps
were scoped to the shape that failed rather than to the token pairing.

**Scope and route.** One token substitution per site
(`--color-danger` → `--color-danger-text` for text **on the subtle tint**; fill
and border uses of `--color-danger` are correct and stay), plus a rendered check
in both themes. Re-verification touches four features' reports, so the honest
close is a single dated note here plus the sweep's evidence — the DEF-005 shape —
not four re-verifications. A failing test first, per the maintenance route:
`e2e/tests/control-contrast.spec.ts` already sweeps 8 screens for the DEF-005
rule and is the natural home for a text-on-tint assertion.

**Not FEAT-013's rework.** FEAT-013's own confirm dialog is specified with
`--color-danger-text` (ui-design §SCR-WEB-010 Conformance), so that feature ships
correct whether or not this is fixed first.

## DEF-005 — form-control outlines fail the non-text contrast rule

**Reported:** 2026-07-29, by the FEAT-012 design-system amendment, which ruled on
the product-wide question that FEAT-012's ui-design escalation raised.

**Symptom.** `--color-border-strong` (#CBD5E1) on `--color-surface` (#FFFFFF)
measures **1.48:1** light and **1.64:1** dark. design.md §5 requires **≥ 3:1**
for a boundary that is a control's only identifier, and a text field's
`--color-surface` fill is indistinguishable from the page (1.05:1), so the
outline is that identifier. Affected: the auth forms (sign-up, sign-in, forgot,
reset, change-password), `list-dialog`, `quick-add`, and `task-detail`'s title
and due inputs.

**Why it is a defect and not just a migration.** §5's 3:1 rule for UI graphics
has been in design.md since ux-foundations; what the 2026-07-29 amendment added
was the *explicit* statement that a control's outline falls under it (§4 had
positively specified the failing token, which is why every feature inherited it
in good faith). The shipped code therefore violates a standing requirement, which
is what puts it in this ledger — but no single feature authored the mistake, so
it is **not** routed to one feature's rework.

**Scope and route.** A web-tier accessibility pass: one token substitution
(`--color-border-strong` → `--color-text-muted`) at each control, plus a visual
check that the darker outline reads correctly in both themes — inputs will look
noticeably heavier, which is the intended consequence of the rule and should be
confirmed by eye rather than assumed. Re-verification touches several features'
reports, so the honest close is a single dated note in this ledger plus whatever
screenshot evidence the pass produces, not six re-verifications.

**Not urgent, not invisible.** Nothing is unusable — the fields are found by
their labels and layout — but it is the most widespread AA gap in the product,
and it is now the *documented* standard rather than an oversight. The same
`apps/web` test-runner gap that DEF-003 and DEF-004 record applies here too: a
computed-style assertion would close all three cheaply, which is the strongest
case yet for standing that runner up.

### Resolution — 2026-07-29

**13 sites, 8 files, one token.** Sign-up, sign-in, forgot, set-new-password,
resend-verification, quick-add (title / due / priority), change-password
(current / new), list-dialog, task-detail (title / due) —
`--color-border-strong` → `--color-text-muted`, taking every control boundary
from **1.48:1 → 4.76:1** light and **1.64:1 → 6.64:1** dark.

**Three sites were deliberately left alone, and that is the substance of this
fix rather than a footnote.** The rule is not "replace the token everywhere"; it
is *is the boundary the only thing identifying this control?*

| Left at `--color-border-strong` | Why |
| :-- | :-- |
| `list-dialog`'s **Cancel** button | carries a visible text label — `button-secondary`-class, which design.md §4 explicitly keeps at this token |
| `task-detail`'s **priority segments** | each option shows its label (and dot); the text identifies them, so the outline is decorative |
| `verify`'s **spinner ring** | decorative, `aria-hidden` — not a control at all, and outside 1.4.11 by definition |

A blanket find-and-replace would have been wrong on all three, and would have
quietly contradicted design.md §4's own `button-secondary` spec.

**The guard: `e2e/tests/control-contrast.spec.ts`.** It sweeps **every visible
`input`/`textarea`/`select`** across eight screens spanning
FEAT-001/002/003/005/006/009/010/011, and asserts a **computed contrast ratio**
between each boundary and the colour actually behind it — the control's own
fill, or the nearest opaque ancestor when the fill is transparent, which is what
the eye compares the outline against. Observed **red at 1.48:1 before the fix
and green after**.

Two properties worth keeping when this spec is edited:
- **It measures a ratio, not a colour.** A future token change that keeps the
  rule stays green; one that breaks it goes red. A hardcoded-hex assertion
  cannot tell those apart.
- **It fails on an empty sweep.** If a selector or a screen silently stops
  matching, "no controls found" fails rather than passing vacuously — the
  failure mode that makes coverage sweeps untrustworthy.

**Belongs to no single feature**, which is why it is its own spec rather than an
addition to one feature's suite: the rule is one every form in the product has
to keep, and a per-feature home would have implied otherwise.

**Verification.** Ratios computed from `tokens.json`'s values (WCAG 2.1); the
rendered result inspected in **both themes** — fields are clearly delineated
without reading as heavy, which is the check this row asked for rather than
assumed. Full gate: api 191 serial, worker 20, e2e 21, boundaries, lint, build
clean.

**No per-feature re-verification, by the plan this row set out.** Eight features
are touched and none has a criterion about input borders — they all defer to
design.md's component spec, which the 2026-07-29 amendment corrected. Their
suites are green at `d27af38`, and the sweep above is the standing record. Six
re-verification reports would have added ceremony, not confidence.

## DEF-004 — the ordinary due-date chip fails AA contrast

**Reported:** 2026-07-29, by FEAT-012's ui-design, while measuring whether a
completed `task-row`'s muted title survives the hovered-row tint. Found by
measurement, not by looking for it — the third time in this project that
computing every pairing before specifying has turned up a failure nobody saw.

**Symptom.** `apps/web/src/components/task-meta.tsx`'s `DueChip` renders its
**non-overdue** variant as `color: var(--color-text-muted)` (#64748B) on
`background: var(--color-surface-sunken)` (#F1F5F9) — measured **4.34:1**,
against the **4.5:1** design.md §5 states for body text, at `caption` (12px)
size where no large-text exemption applies. Every task with a due date that has
not yet passed renders this chip, on both SCR-WEB-008's rows and SCR-WEB-010's
detail panel.

**Why it is a defect and not a design gap.** Unlike DEF-003, nothing about the
token set is missing here: `--color-text-muted` is documented in `tokens.json` as
"4.6:1 on bg — AA", and it *is* AA on `--color-surface` (**4.76:1**) and on
`--color-background` (**4.55:1**). The tint is what eats the margin. The system
made a satisfiable pairing available all along; the shipped component chose one
that isn't. FEAT-011's acceptance measured the overdue chip (which is why the
overdue path is correct) and did not measure the default one.

**Scope.** One component, one variant, two token references. Both screens that
render a due date are affected. Nothing about FEAT-011's *behaviour* is wrong —
the dates, the timezone handling and the `isOverdue` derivation are all correct;
this is presentation drifting below the standard the same feature otherwise met.

**Candidates measured while finding it** (the choice belongs to whoever picks
this up, per DEF-003's precedent of recording rather than pre-deciding):

| Option | Ratio | Note |
| :-- | --: | :-- |
| drop the chip's tint — muted text on `--color-surface` | **4.76:1** ✅ | smallest change; the chip keeps its shape via `--radius-full` + border, and the metadata hierarchy is unchanged |
| `--color-text` on `--color-surface-sunken` | 12.6:1 ✅ | passes easily but flattens the muted/primary distinction the row depends on |
| a new `--color-text-muted-strong` token | — | a design-system amendment; only worth it if the general rule (below) says muted text must survive the tint everywhere |

**The general form, which is larger than this row.** Muted text is AA on
`surface` and `background` but **not** on the `surface-sunken` tint. design.md §2
documents the danger-tint pairing rule (added 2026-07-28) but says nothing about
where muted text is valid. That is a **design-system** question, filed with
FEAT-012's ui-design escalation toward ux-foundations, not resolved in this
ledger. This row is the one place the rule is currently violated in shipped code.

**Not urgent, not invisible.** It is a 0.16 shortfall on secondary metadata, which
is why it is a ledger row rather than an interrupt — but it is a real AA failure
on verified behaviour, it affects the *common* case rather than an error state,
and it is the second contrast defect to come out of the same component family.

**Fix protocol when it is picked up** (maintenance route): the owning feature is
**FEAT-011** (RTM → FR-TASK-006/007 → Plan ref FEAT-011). The "failing test
first" rule still has no home — `apps/web` has no unit-test runner, the gap
DEF-003 recorded and FEAT-012's design re-flagged as its third concrete case — so
the same two honest options apply: stand the runner up first (a computed-style
assertion would make this trivial and would cover DEF-003's fix too), or fix and
re-verify by inspection with the measurement recorded.

### Resolution — 2026-07-29

**The premise above was wrong, and that is the most useful thing in this entry.**
"Failing test first has no home" assumed a *unit* runner. It does not need one:
**Playwright reads computed styles**, so a contrast assertion had a home all
along — in the e2e suite, against the rendered element, which is a *better* place
to measure colour than a jsdom unit test would have been. FEAT-012's acceptance
run demonstrated the technique (`toHaveCSS`) and this fix generalized it. DEF-003
was closed without a regression test on a premise that was never true; its
pairing is now covered by the guard below.

**The guard.** `e2e/tests/task-detail.spec.ts` asserts a **computed contrast
ratio**, not expected hex values — the criterion is the ratio, so a future token
change that keeps the rule stays green while one that breaks it goes red, which
a hardcoded-colour assertion cannot distinguish. It covers three surfaces: the
upcoming chip (this defect), the overdue chip (DEF-003's fix, guarded against
regression while its neighbour was edited), and the sidebar badge. Observed
**red at 4.34:1 before the fix, green after**.

**A second instance, found by grepping the pairing rather than the component.**
`lists-nav.tsx`'s sidebar count badge used identical colours at an identical
size and is on screen constantly. It belongs to **FEAT-009**, not the reporting
feature — fixed together, for the reason DEF-003 recorded: leaving an identical
instance is how these drift apart. The scope line above ("one component, two
token references") was an underestimate, written before the pairing was grepped.

**The fix is the system's own rule, not a new invention.** design.md §2, as
amended 2026-07-29 by FEAT-012's escalation, already says text on the sunken
tint takes `--color-text`. Applying it needed no token and no further amendment.

| Pairing | Before | After | |
| :-- | --: | --: | :-- |
| chip / badge, light | 4.34:1 ❌ | **16.30:1** ✅ | `--color-text-muted` → `--color-text` |
| chip / badge, dark | 7.05:1 ✅ | 15.49:1 ✅ | **dark was already passing — this was a light-theme-only defect** |

**Verification.** Ratios computed from `tokens.json`'s actual values (WCAG 2.1),
the *rendered* output confirmed in both themes by screenshot, and the full gate
re-run: api 191 serial, e2e 19, boundaries, lint, build clean. FEAT-011's
acceptance report carries a dated re-verification — **Accepted (unchanged)**.

**What the hierarchy lost, and where it went.** The muted grey was doing two jobs:
signalling "secondary metadata" and, accidentally, failing contrast. After the
fix that signal is carried by size and the pill tint instead — the upcoming chip
still reads as secondary, and the overdue chip stays visibly more urgent through
its red tint plus the word "Overdue". Confirmed by eye, not assumed.

## DEF-003 — the list-view error alert fails AA contrast

**Reported:** 2026-07-28, by FEAT-011's acceptance re-verification (recorded there
as the new minor finding). Found while FEAT-011's own overdue chip was being
audited, not by looking for it.

**Symptom.** `apps/web/src/components/list-view-failure.tsx` renders SCR-WEB-008's
`error` state as `color: var(--color-danger)` on
`background: var(--color-danger-subtle)` — measured **3.95:1**, against the
**4.5:1** design.md §5 states for body text. The same pairing appears on the
`not-found` branch of that component.

**Why it is a defect and not a design gap.** When FEAT-010 was verified this was
the *only* pairing the token set could produce — danger was the one semantic
colour with no `*Text` partner, which is exactly the gap FEAT-011's ui-design
escalated and the 2026-07-28 design-system amendment closed. The system now has
`--color-danger-text` (#991B1B, 6.8:1 on the same tint), so the shipped code is
now measurably behind its own design system. Nothing about FEAT-010's behaviour
is wrong; its presentation violates a standard that has since been made
satisfiable.

**Scope.** Two token references in one component. FEAT-011's own
`task-detail-failure.tsx` already uses the correct partner, so the two failure
components currently disagree — which is the clearest sign this should be closed
rather than left.

**Fix protocol when it is picked up** (maintenance route): the owning feature is
FEAT-010 (RTM → FR-TASK-001/002/003 → Plan ref FEAT-010). A demonstrating test
is awkward — `apps/web` has no unit-test runner, which is its own recorded gap —
so the honest options are to stand that runner up first (making this the
motivating case for a contrast assertion), or to fix and re-verify FEAT-010 by
inspection with the measurement recorded. **That choice belongs to whoever picks
this up**; the pipeline's "failing test first" rule assumes a harness that does
not exist here yet, and pretending otherwise would be the wrong kind of tidy.

**Not urgent, not invisible.** It affects an error state most users never see,
which is why it is a ledger row rather than an interrupt — but it is a real AA
failure on verified behaviour and it will keep drifting further from
`task-detail-failure.tsx` until closed.

### Resolution — 2026-07-28

**Measuring first turned a one-line fix into a two-line one.** The reported
symptom was the container text at 3.95:1. Computing every pairing in both failure
components before touching anything found a **second** failure the acceptance
report had not caught: the action *inside* the tinted alert —
`--color-primary` #0F766E on `--color-danger-subtle` #FEE2E2 — is **4.48:1**,
below 4.5:1 by a hair and therefore still a fail. It was present in
`list-view-failure.tsx` **and** in the `task-detail-failure.tsx` Retry button
that FEAT-011's own rework had just added by copying the older component's
pattern. Had the fix stopped at the reported symptom, the newer component would
have kept the newly-introduced half of the defect.

| Pairing | Before | After | |
| :-- | --: | --: | :-- |
| alert body text on `--color-danger-subtle` | 3.95:1 ❌ | **6.80:1** ✅ | `--color-danger` → `--color-danger-text` |
| alert action on `--color-danger-subtle` | 4.48:1 ❌ | **6.21:1** ✅ | `--color-primary` → `--color-primary-hover` |
| not-found link on `--color-surface-sunken` | 5.00:1 ✅ | 5.00:1 ✅ | unchanged — it already passed |

**Why `--color-primary-hover` and not a new token.** design.md §2 already
documents that token as the text colour for a tinted background —
`--color-primary-subtle` is annotated *"use with #115E59 text"* (6.73:1). Using
it on the danger tint applies an existing in-system pairing rather than inventing
one, so this needed no design-system amendment; the alternative candidates were
measured and recorded above rather than chosen by eye.

**Verification.** Contrast ratios computed from `tokens.json`'s actual values
(WCAG 2.1 relative-luminance formula), the **rendered** markup confirmed to carry
`var(--color-danger-text)` and `var(--color-primary-hover)` rather than raw hex,
and the full gate re-run: api 176, worker 20, **e2e 15** (the list-not-found path
in `tasks.spec.ts` exercises the changed component directly), boundaries, lint
and build clean.

**No regression test, and the reason is the same one the row opened with.**
`apps/web` still has no unit-test runner, and both failure states are rendered by
server components whose fetch Playwright cannot intercept, so neither a contrast
assertion nor a state-render test has a home yet. The e2e covers the *presence*
of the not-found alert but asserts nothing about its colour. **The durable fix is
a web test runner**, which would make a computed-style assertion trivial — it is
recorded as an open engineering-foundations gap in FEAT-011's acceptance report
(minor #1), and this defect is the second concrete case for it.

## DEF-001 — parallel specs wipe each other's rate-limit buckets

**Reported:** 2026-07-27, by FEAT-010's acceptance verification (recorded there as
finding 1; also observed during FEAT-010's implementation).

**Classification — read this before treating it like a product bug.** This is a
**test-infrastructure defect, not a product defect**: no FR is violated, and no
shipped behavior is wrong. It is recorded here because the maintenance route is
where the pipeline tracks "something verified is now unreliable", and an api
suite that fails a quarter of the time makes *every* future feature's
verification gate untrustworthy — the gate is the thing that broke.

**Symptom.** `npm test -w @todo/api` fails ~2/8 runs, always on
`reset-password.controller.spec.ts` AC-7 ("forgot and reset are per-IP
rate-limited"), expecting `429` and receiving `400` (or `200`). Never fails
under `--runInBand`; never fails when the spec runs in isolation.

**Root cause (measured, not inferred).** The rate-limit guard was temporarily
instrumented to log `(ip, route, count, max)` and a failing run captured:

```
ip=192.0.2.16 route=POST /auth/reset count=1 max=2
ip=192.0.2.16 route=POST /auth/reset count=2 max=2
ip=192.0.2.16 route=POST /auth/reset count=1 max=2   ← counter reset mid-test
```

The third request created a *fresh* bucket row, so `count` never exceeded `max`
and no `429` was thrown. The row had been deleted between the second and third
request by another spec's `afterEach`, which runs
`DELETE FROM auth_rate_buckets WHERE ip LIKE '<prefix>%'` — in a different jest
worker, against the same database.

Two spec pairs shared a prefix where at least one side deletes it:

| Prefix | Specs | Deletes the prefix |
| :-- | :-- | :-- |
| `192.0.2.` | sign-in, reset-password, sign-out | sign-in ✅, reset-password ✅ |
| `198.51.100.` | change-password, rate-limit.guard, lists.controller | change-password ✅, rate-limit.guard ✅ |

Only the first pair had been observed failing; the second is the same defect and
would have surfaced later.

**Fix.** Every spec owns a **disjoint** IP range, and the invariant is enforced by
a test rather than a comment (`rate-limit-isolation.spec.ts`) so it cannot
regress silently as specs are added.

**Not the cause** (ruled out during diagnosis, recorded so it isn't re-litigated):
a leaked `AUTH_RATELIMIT_MAX` between suites in a reused worker. That leak was
real and was fixed during FEAT-010, but the instrumented trace shows `max=2`
correct at the moment of failure — the count was wrong, not the limit.

## DEF-013 — rate-limit buckets accumulate across suite runs

**Reported:** 2026-08-02, while investigating DEF-002.
**Owning requirement:** none — test infrastructure, though the mechanism is
product code behaving exactly as designed.

**Symptom.** The api suite's repeatability depends on the wall clock. Running it
twice inside fifteen minutes can fail the second run with `429 rate_limited`
where the first passed.

**Cause.** Three facts compose:

1. `auth_rate_buckets` is keyed `(ip, route, window_start)` on a **15-minute**
   fixed window (`floor(now / 900000)`), per `rate-limit.guard.ts`.
2. Every spec's `nextIp()` is `${PREFIX}${(ipCounter++ % 250) + 1}` with
   `ipCounter` starting at **0 on every run** — so run N and run N+1 use the
   *same* synthetic IPs, in the same order.
3. Nothing clears the table between runs. Specs delete their **own** prefix in
   `afterAll`, but only some specs do, and a crashed run cleans nothing.

So two runs inside one window increment the same keys. **Measured** (table
truncated first, then three consecutive full runs):

| after run | rows | max count on one key |
| :-- | :-- | :-- |
| 1 | 345 | 31 |
| 2 | 345 | 62 |
| 3 | 345 | 93 |

Linear, +31 per run, against a default `AUTH_RATELIMIT_MAX` of **30**. Before the
truncate was introduced the live table held **1474 rows**, the oldest from the
previous day, including `::ffff:127.0.0.1 POST /auth/register` at **135** for a
single window — that bucket is shared by *every* spec that omits
`X-Forwarded-For`, because `clientIp()` then falls back to the socket address.

**Fix.** `apps/api/test/global-setup.js` truncates `auth_rate_buckets` before any
worker starts. globalSetup is the only place that can clear it safely: it runs
once, before the workers, so the delete cannot land mid-request — which is
precisely the hazard DEF-001 recorded for per-spec deletes racing each other.

**Guard.** `rate-limit-bucket-hygiene.spec.ts` asserts that no bucket survives
from an older window and that no key sits above a level a single run can produce.
Red before the fix (measured 465 on one key), green after.

**Relationship to DEF-002 — distinct, and not its cause.** This was found while
chasing DEF-002 and is worth separating carefully. DEF-002's observed failures
are `404`s in `task-item.controller.spec` and `tasks-lists-integration.spec`,
**both of which raise `AUTH_RATELIMIT_MAX` to 1000**, so no bucket could have
produced them. DEF-013 is a real repeat-safety defect that would have bitten a
developer or CI eventually; it does not explain DEF-002, and DEF-002 stays open.


## DEF-002 — residual api-suite flakiness, order/timing dependent (open)

**Reported:** 2026-07-27, while fixing DEF-001. Recorded separately because the
evidence shows it is a **distinct cause**, not leftover DEF-001.

**Symptom.** With DEF-001 fixed, `npm test -w @todo/api` still fails roughly
**8% of parallel runs** (measured ~5 failures across ~65 runs; the pre-DEF-001
rate was ~25%). `--runInBand` is deterministically green (142/142, repeatedly).
A **different test fails each time**, which is why this is not a per-test bug:

| Observed failure | Expected → received |
| :-- | :-- |
| `sign-in` AC-3 (unverified → 403) | 403 → 401 |
| `change-password` AC-1 (login in the helper) | 200 → 401 |
| `lists` AC-4 (rename the default list) | assertion failed |
| `tasks × lists` AC-7 (create task in a fresh list) | 201 → 404 |

The common shape: **something that was just created cannot be found** — a user
that cannot authenticate, a list that reports `list_not_found`.

**Ruled out** (each checked, so the next session does not repeat the work):

- *DEF-001's bucket collisions* — fixed and guarded; the failures above are not
  rate-limit assertions.
- *`AUTH_RATELIMIT_MAX` leaking between suites in a reused worker* — real, fixed
  during FEAT-010; the instrumented DEF-001 trace showed the limit correct at the
  moment of failure.
- *Connection-pool exhaustion* — peak observed **14** connections against
  `max_connections = 100` during a full 14-worker run.
- *Broadly-scoped cleanup* — every `DELETE` in every spec is keyed on a unique
  email, id, or IP; `globalSetup` only runs migrations, once.
- *Capping jest workers* — `maxWorkers: 4` was tried and **reverted**: an initial
  0/12 looked promising but is statistically unremarkable at an 8% rate, and a
  25-run measurement with the cap in place still produced 2 failures. It was not
  demonstrated to help, so it was not kept.
- *Per-worker databases* — **tried and reverted (2026-07-27).** `globalSetup`
  created one migrated database per jest worker (via a TEMPLATE copy) and a
  `setupFiles` hook pointed each worker's `DATABASE_URL` at its own, with **no**
  production change. The reasoning was sound — workers share no memory and no
  environment, so Postgres was the last shared mutable resource, which is why
  `--runInBand` is green. It did not work: a **clean 30-run measurement produced
  2 failures (6.7%)**, statistically indistinguishable from the ~8% baseline.
  Reverted under the same standard applied to the worker cap. This is the most
  valuable entry in this list: it rules out *cross-worker database interference*
  as the cause, which was the leading hypothesis, and points the next
  investigation at something **within** a worker.

  *Measurement hygiene note, learned the hard way:* two earlier measurements of
  this change were run concurrently (~26 jest workers against one Postgres) and
  produced misleading numbers — including an apparent regression that was pure
  contention. Measure one thing at a time on a quiet machine.

**Best remaining hypotheses (after per-worker databases were ruled out).** Since
database isolation did not help, the cause is very likely **inside** a worker
rather than between workers:

1. *Fixture preconditions that are never asserted.* The one failure whose
   mechanism was fully traced was a helper reading `res.headers['set-cookie'][0]`
   after a login that had failed — surfacing as a `TypeError` rather than naming
   the real problem. FEAT-010's specs now assert `201`/`200` on their fixtures;
   **the auth specs' own helpers still do not**, and several observed failures
   (`sign-in` AC-3, `change-password` AC-1/AC-3/AC-4) sit exactly there. Adding
   those assertions would not fix the flake but would make the next failure say
   what actually went wrong, which is the current blocker.
2. *Wall-clock coupling.* The rate-limit window is a 15-minute fixed window
   (`floor(now / 900000)`); several specs assume the whole test runs inside one
   window, and `auth_rate_buckets` rows persist across runs within it.
3. *Session-rotation ordering* in change-password specs, where a successful
   change revokes prior sessions and a later assertion reuses a stale cookie.

Recommended next step: land (1) across the auth specs first — cheap, no
behavior change, and it converts the remaining flakes from mysteries into
readable failures.

**Impact and workaround.** The gate is trustworthy when run serially
(`npm test -w @todo/api -- --runInBand`, ~9 s vs ~4 s). Feature verification
should use serial execution until this is fixed, and the report should say so.

### Investigation 2026-08-02 — still open; hypothesis 1 retired, four more ruled out

**Reproduced: 3 failures in 145 parallel runs (~2%)**, all three inside the first
25; 120 consecutive clean runs followed. The rate is lower than the ~8% recorded
in July, and low enough that a 30-run measurement proves nothing — plan for 50+
runs before believing any result. All three failures share one shape, and it is
**not** the shape hypothesis 1 predicted:

| Spec | Assertion | Expected → received |
| :-- | :-- | :-- |
| `task-item.controller.spec` | FEAT-012 AC-9, complete a task just created | 200 → **404** |
| `task-item.controller.spec` | AC-12, GET/PATCH a task just created | 200 → **404** |
| `tasks-lists-integration.spec` | FEAT-020 AC-4, create a task in a fresh Inbox | 201 → **404** |

**Hypothesis 1 (unasserted fixture preconditions) is retired as the
explanation.** Both specs already assert `201`/`200` on every fixture step — the
work FEAT-010 landed — and the failures occur *after* those assertions pass. The
registration, the login and (in two of three cases) the task creation all
succeeded; the resource then could not be found milliseconds later. The
assertions did their job: they proved the precondition held. So the defect is a
row that genuinely stops being visible to an ownership-scoped query, not a
fixture quietly proceeding from a failed setup.

**Ruled out this session** (checked directly, so the next session need not):

- *Rate limiting, for these failures.* Both affected specs set
  `AUTH_RATELIMIT_MAX = 1000`, so no bucket could produce their 404s. (The
  investigation did find a real bucket defect — **DEF-013**, fixed — but it is a
  `429` mechanism and cannot cause a `404`.)
- *Email collisions between specs.* Every spec's fixture email is
  `<prefix>-${randomUUID()}@example.com` with a per-spec prefix; collisions are
  impossible, so no spec's cleanup can delete another's user.
- *IP-range collisions.* All ranges verified disjoint (the one apparent duplicate
  of `198.18.10.` is prose inside `rate-limit-isolation.spec.ts`). DEF-001's
  guard is holding.
- *FEAT-018's account deletion over-reaching.* Every statement in
  `account-delete.repository.ts` is scoped `WHERE id = $1`; the cascade cannot
  reach another user's rows.
- *Prototype-level `DbService` mocks leaking between specs in a reused worker.*
  There are none; the audit spec's `db down` fixture mocks a local object.

**Where the next session should start.** The failure is a `404` from an
ownership-scoped statement (`WHERE owner_id = $1 AND id = $2 AND deleted_at IS
NULL`), which admits exactly three causes: the row was deleted, its `owner_id`
does not match, or `deleted_at` is set. Instrument to distinguish them — a probe
that, on a non-2xx fixture response, dumps the response body's error `code`, the
row's presence, its `owner_id`, and the `user_id` the session cookie resolves to
will separate "row gone" from "owner mismatch" in a single hit. That probe was
built and run for 90 runs this session without catching a failure; it is cheap to
rebuild and is the fastest path to a cause. As a permanent aid, both task specs'
`addTask` helpers now assert **with the response body attached**, so the next
occurrence names which resource was missing rather than only its status.

**Measurement hygiene, re-learned:** the harness must run alone. Nothing else may
touch the database while a rate measurement is in flight.


## DEF-007 — the API ignores the root `.env` (open)

**Reported:** 2026-07-30, during FEAT-019's AC-1b staging run.
**Owning requirement:** NFR-MAINT-003 (configuration externalized to the
environment). Not a feature defect — it predates every slice.

**Symptom.** Starting the API the documented way and setting
`REALTIME_PROVIDER=supabase` in the root `.env` had **no effect**:
`GET /realtime/token` kept answering `{ enabled: false }`. Exporting the same
values into the shell first made it work immediately.

**Cause.** `apps/api/src/infra/config.ts` calls `loadDotenv()` with no
arguments, so dotenv looks for `.env` relative to `process.cwd()`. npm workspace
scripts run with the CWD set to the **workspace** directory, and there is no
`apps/api/.env` — so nothing is loaded and every setting falls back to its
default. Introduced by the walking skeleton (`7b8d6e9`), not by a feature.

**Blast radius — wider than Realtime.** Every value in `.env.example` that the
API or worker reads is affected the same way: `EMAIL_PROVIDER` / `SMTP_URL`
(FEAT-007 would silently keep logging instead of sending), `SESSION_TTL_DAYS`,
`AUTH_RATELIMIT_*`, `LOGIN_LOCKOUT_MINUTES`, the token TTLs. Nothing is *broken*
by the defaults — they are deliberately safe — which is exactly why this has
gone unnoticed for nineteen features: the system works, it just does not obey
its own configuration file locally.

**Not a production issue.** In Cloud Run these arrive as service env vars, which
`process.env` reads directly with no dotenv involved (`deploy/*.yaml`). The
defect is confined to local development — and to anyone following
`.env.example`'s instructions.

**Why it was found now.** FEAT-019 is the first feature whose behaviour changes
*visibly* based on an env value an operator must set by hand
(`REALTIME_PROVIDER`). Every earlier feature's env values were either already
correct as defaults or exercised through explicitly-passed env (the E2E
`webServer` blocks, jest's own `process.env` assignments).

**Suggested fix** (one line, plus a decision): resolve the path explicitly —
`loadDotenv({ path: resolve(__dirname, '../../../../.env') })` or, cleaner, walk
up to the repo root; and do the same in `apps/worker/src/infra/`. Worth pairing
with a startup log line naming which config file was loaded (or that none was),
since the failure mode is silence. **Fix protocol applies** (maintenance route):
a failing test first — a spec asserting the API loads a root-level `.env` when
started from the workspace directory — then the fix, then re-verification of the
features whose config it touches.

**Workaround until fixed.** Export the values before starting the API:
`set -a; . ./.env; set +a; npm run start -w @todo/api`.


## DEF-007 — fix (2026-07-30)

**Failing test first.** `apps/api/src/infra/load-env.spec.ts` (6 cases) and
`apps/worker/src/infra/load-env.spec.ts` (4) were written before the fix and run
red — `Cannot find module './load-env'`, the loader did not exist. They build a
throwaway tree shaped like the monorepo (root `.env` + nested `apps/<unit>`) and
assert the file is found from the nested directory, from the root, and from
deeper still.

**The fix, and why it is shaped this way.** Env loading moved **out of
`loadConfig()` and into the process entrypoint** (`main.ts` in both apps), with
the file resolved by **walking up** from the start directory rather than trusting
the CWD. `loadConfig()` is now a pure read of `process.env`.

That split does three things, only the first of which was the reported bug:

1. A workspace-script start finds the same `.env` the root scripts and
   `node-pg-migrate` use.
2. **Unit tests are hermetic by construction.** Previously any spec that deleted
   an env var and called `loadConfig()` would have had dotenv re-inject the
   developer's own `.env` — so a suite's result could depend on whose machine it
   ran on. FEAT-019's `realtime.controller.spec` ("unconfigured answers
   `{ enabled: false }`") is exactly such a spec, and would have become
   machine-dependent the moment the path bug was fixed naively.
3. **dotenv stops running per request.** `loadConfig()` is called from
   `session.service`, `rate-limit.guard`, `auth.service`, `db.service` and the
   realtime block — on essentially every request. Each call was hitting the
   filesystem. (It is also what produced the `injected env (0) from .env` spam
   through every test run.)

**Precedence is deliberate and asserted: the real environment wins over the
file.** In Cloud Run these arrive as service env vars with no file present, so a
stray `.env` baked into an image can never override deployed config.

**Startup now names the file** — `{"msg":"api listening", …, "envFile":"…/.env",
"realtime":"supabase"}` — or says `none (using defaults + process env)`. The
defect's failure mode was silence: configuration that looked applied and was not.

**One harness change came with it, and it is not incidental.** The E2E
`webServer` runs the API with the CWD at the repo root, so it *does* load the
repo `.env` — meaning a developer with `REALTIME_PROVIDER=supabase` in theirs
would have had the whole Playwright suite publishing to a real external service
on every write, while a colleague's identical run did not. `e2e/playwright.config.ts`
now pins `REALTIME_PROVIDER: "none"` explicitly. FEAT-019 AC-2 tests the fallback
path on purpose; that must not depend on whose machine it runs on.

**Verification.** Guard specs red before / green after. The reported symptom was
reproduced and is gone: `npm run start -w @todo/api` with nothing exported now
logs the root `.env` and `realtime: supabase`, where it previously ran on
defaults. Full suites after the fix: **api 247** (serial), **worker 24**,
**web 23**, **e2e 30**; lint, boundaries and build clean. No feature's behaviour
changes on default configuration — the defaults were always the values these apps
were actually running on.


## DEF-008 — config read per request instead of built once (2026-07-30)

**Not a behaviour defect** — nothing was wrong on screen. It is a design defect in
the config layer, recorded here because the ledger is where this project keeps
findings against already-verified code, and because the fix touches nine
features' files.

**Reported by the user**, reviewing the DEF-007 fix: *"why even call loadConfig
again and again… if we load them at server start the config object can remain in
memory."* Correct. There was no decision behind the old shape — it was the
skeleton's convenience, inherited unexamined through nineteen features. My first
answer defended it on "purity and cheapness"; that was rationalisation, and the
count settled it: **21 production call sites**, most of them per-request.

**The fix.** `AppConfig` is built **once**, at boot, by `InfraModule`'s
`APP_CONFIG` factory, and injected wherever it is needed. `loadConfig` is renamed
`readConfig` — it never loaded anything after DEF-007, and the name was what made
the split confusing.

`useFactory`, never `useValue`: a `useValue` would evaluate when the module is
*imported*, before `main.ts` calls `loadEnv()`, silently handing the whole app a
defaults-only config and undoing DEF-007. That trap is commented at the
definition.

**The worker already had it right** (`WORKER_CONFIG` via `useFactory`, FEAT-007).
The API was the outlier; the worker only needed the rename and one leftover
`loadDotenv()` inside `getPool()` — the same DEF-007 shape in miniature, reading
the filesystem on first use from a runtime path.

**What it actually bought, beyond the wasted work:**

- **Config is a declared dependency**, not an ambient global a service reaches
  for. A constructor now states that it needs config.
- **Tests stopped mutating global state.** Specs used to set `process.env`,
  restore it in `afterEach`, and hope nothing else in the worker process
  interleaved. The realtime specs now pass config objects; the rate-limit ones
  own the object the app was built with and turn limits up and down on it.
- **The DEF-007 hazard is closed structurally**: there is exactly one place
  config is constructed, immediately after env is loaded, and startup logs which
  file that was.

**Cost, honestly — I underestimated this when proposing it.** I said "most specs
need no change". Ten needed changes: seven that provide `DbService` directly and
now must supply its new dependency, and three that toggled `AUTH_RATELIMIT_MAX`
*inside a test* and relied on the per-request re-read. That last group is the
interesting one: the guard's comment said *"thresholds are read fresh from config
each request"*, which I read as description and was in fact a contract three
specs depended on. It is now stated the other way round — thresholds are fixed
for the process's life, which is what env vars always were — and those specs
mutate their own injected object instead.

**One harness fix rode along, and it resolves a carried item.** The E2E
`webServer` now pins `AUTH_RATELIMIT_MAX`. The suite's own fixtures register
~25–30 users per run against a production-shaped limit of 30 per 15 minutes, so a
full run sat one run away from red and two runs inside a window failed outright —
the FEAT-009 acceptance minor that has been carried since, and that cost this
session two false alarms (23 specs "failing" that were nothing of the kind).
**No test was weakened**: no E2E asserts rate limiting, and the limiter's real
coverage lives in the api specs with their own IP ranges. Proof it worked: two
consecutive full E2E runs green **without clearing `auth_rate_buckets`**, which
had never been true before.

**Verification.** api **247** (serial), worker **24**, web **23**, e2e **30**
twice consecutively; lint, boundaries and build clean. No behaviour change — the
values the apps run on are identical, they are simply computed once.

## DEF-010 — smart-view fixtures depended on the hour of the run (2026-08-01)

**Reported by** FEAT-014's acceptance run, which hit two red tests it had not
caused and had to prove were not its own.

**Symptom.** `views.service.spec` AC-2 ("the same task is Today in one zone and
Upcoming in another") and `smart-views.spec` UC-014 both failed. Neither had
anything to do with FEAT-014, whose only search-module change was adding
`t.position` to a projection.

**Diagnosis — the product was right in both cases.** The unit test asserted a
property true only while New York and Calcutta share a calendar date, which
stops being true after about 14:30 New York time. The E2E seeded tasks at
`now() + 3 hours` and `now() + 5 hours` and expected both in Today; at 20:34 UTC
those instants are **tomorrow**, so FR-SRCH-008's Today view correctly excluded
one. Confirmed by reading the seeded rows out of the database rather than by
argument: `Call the supplier back` was due `2026-08-01 01:34 UTC` while the
user's today was `2026-07-31`.

**Independence established before anything was changed.** The unit failure was
reproduced at `cf89857` — the commit before FEAT-014 began — in a clean git
worktree.

**Fix (`3fd7619`) — the premise, not the assertions.** Every expectation was
kept, including the Today view's exact due-ascending order and the Overdue set
of one. What changed is that both fixtures now *choose their zone from the
current instant*: the unit test derives a pair (`near` at ~02:00 local, `ahead`
three hours east) so a task at 23:00 on `near`'s today is always today there and
always tomorrow in `ahead`; the E2E puts the user in a zone where local time is
~02:00 and seeds at offsets from that zone's start of day, so "earlier today"
and "later today" both exist at any real hour. `Etc/GMT±N` throughout — fixed
offsets, no DST, so a transition cannot reintroduce the flake by another door.

**Verification.** Arithmetic checked across all 24 UTC hours (offsets stay
inside the Etc range; local time lands at 02:00 every time). api **442/442**,
web 76/76, worker 24/24, e2e **48/48**. FEAT-016's report carries a dated
re-verification: Accepted, unchanged.

## DEF-011 — icon-only controls never got their touch size (2026-08-01)

**Reported by** FEAT-014's acceptance run, whose AC-12 names the 44px target
explicitly — which is what made a long-standing product-wide gap finally
measurable against something.

**Symptom.** Every icon-only button sized on `--size-control-md` (40px) is 40×40
on *every* viewport, including touch. design.md §4 specifies `icon-button` as
"40px (**44px touch**) square" and §5 requires "≥ 44×44px on touch viewports",
but `apps/web` contains no `pointer: coarse` rule at all, so the parenthetical
had never been implemented. Instances: `lists-nav.tsx`'s row-menu trigger and
"New list" (since FEAT-009), and FEAT-014's three reorder controls.
`shell-frame.tsx`, `detail-panel.tsx` and `task-checkbox.tsx` were already
correct — which is what made the two stragglers findable rather than looking
like the house style.

**Failing test first.** `e2e/tests/touch-target.spec.ts` — the sibling of
DEF-005's `control-contrast.spec.ts`, and built the same way: it measures
**rendered bounding boxes** at a 390×844 phone viewport rather than asserting
style strings, so a token change that keeps the rule stays green while one that
breaks it goes red. It was red naming `reorder-handle` at 40×40; after
FEAT-014's fix it went red again naming `new-list`, finding the second instance
on its own.

**Fix.** `152de92` (FEAT-014's own controls, as that feature's rework) and
`1838a4d` (`lists-nav.tsx`). One token each: `--size-control-md` →
`--size-touch-target`.

**Scope held deliberately.** Icon-only buttons only — the family §4 sizes by
name. Text buttons, inputs and selects carry their own labels and their own §4
sizing and were left alone; widening the sweep to them is a design-system
question, not a defect fix.

**Verification.** Guard red before / green after, api **442/442**, web 76/76,
worker 24/24, e2e **48/48**, lint · boundaries · build clean. FEAT-009's report
carries a dated re-verification: Accepted, unchanged.

## DEF-006 — fix (2026-08-01)

**Seven sites, not five.** The ledger recorded five style objects painting
`--color-danger` on `--color-danger-subtle` (3.95:1, against design.md §5's
4.5:1 for body text). The fix found two more: the sign-up alert contains **two
links** carrying their own `--color-danger` on the same tint. A sweep reading
only each alert's own `color` would have declared that screen fixed while both
links stayed at 3.95:1.

**Two guards, because neither subsumes the other.**

- `e2e/tests/inline-alert-contrast.spec.ts` — drives each auth screen to its
  real error state and measures **what the browser painted**, walking the alert
  and every element inside it. Computed ratios, not expected hex, so a token
  change that keeps the rule stays green. This is what found the two links.
  (The reset-password screen reaches its alert by aborting the request: an
  invalid token renders a dedicated state instead, so the unreachable-server
  branch is the honest path to that element.)
- `apps/web/src/styles/danger-tint-pairing.spec.ts` — sweeps source for the
  pairing, scoped to the enclosing style object so a reformat cannot narrow it.
  It exists because two of the five sites — the sidebar's "couldn't load your
  lists" alert and the list dialog's form error — need the API to fail
  mid-session, which no honest E2E path produces. Those are exactly the sites
  that survived DEF-003's and DEF-004's fixes. Its known limit is the mirror of
  the other guard's strength: a CHILD element with its own style object is
  invisible to it.

Both were red before the fix — the source guard naming all five files
independently of the ledger — and green after.

**Verification.** api 442/442, web **78/78**, worker 24/24, e2e **53/53**,
lint · boundaries · build clean. FEAT-001, FEAT-003, FEAT-005 and FEAT-009
carry dated re-verifications: Accepted, unchanged.

## DEF-009 — fix (2026-08-01)

**One rule, in `globals.css`, where the other cross-cutting rules already live**
(a pseudo-class cannot be expressed in the components' inline token styles):

```css
:focus-visible {
  outline: var(--border-width-thick) solid var(--color-focus-ring);
  outline-offset: var(--border-width-thick);
}
```

Width and offset come from the 2px token this system already has rather than
literals. The selector is deliberately **not** scoped to a control list —
"every interactive element" is design.md's rule, and a selector enumerating
today's controls would silently exclude tomorrow's.

**Guard.** `e2e/tests/focus-ring.spec.ts` sweeps a signed-out screen and all
three regions of the shell (composer, sidebar icon button, task row's checkbox
and link), asserting style, width, colour and offset against the token's value
**read from the running page**, so a token change moves the assertion rather
than breaking it. Red before at `outline-width: 1px` — the browser default that
had stood in for the design system since FEAT-001.

**Worth knowing for the next person**, and recorded in the spec: `:focus-visible`
is a heuristic on input **modality**. Chromium matches it on a text input
however focus arrived, but on a `<button>` only while the user is navigating by
keyboard — so a bare programmatic `.focus()` reports `outline: none` on every
button. That is the selector behaving correctly, not a missing ring; the helper
presses Tab first to establish keyboard modality.

**Checked and deliberately left alone:** `detail-panel.tsx`'s `outline: "none"`
sits on the panel *container*, a `tabIndex={-1}` focus-trap host rather than an
interactive control. Ringing an entire slide-over would be noise, and §5 governs
controls.

**Verification.** Guard red before / green after; the ring confirmed **visually**
unclipped in both a task row and the sidebar, where `overflow-y: auto` could have
cropped an offset outline. api 442/442, web 78/78, worker 24/24, e2e **53/53**,
lint · boundaries · build clean.

## DEF-012 — the contrast guards never measured the dark theme (2026-08-01)

**Reported by** FEAT-017's acceptance run. Its own SCR-WEB-016 guard went red on
its first execution, and the cause turned out to be the *measurement*, not the
screen — which raised the obvious question about the two standing sweeps that
had been guarding this rule for the whole project.

**Symptom — two faults, and the second is the one that mattered.**

1. *Coverage.* Neither `control-contrast.spec.ts` (DEF-005) nor
   `inline-alert-contrast.spec.ts` (DEF-006) ever set a theme. Every ratio this
   project had measured was a **light-theme** ratio. `tokens.json` annotates
   `dangerText` as "7.8:1 on the dark dangerSubtle tint" — a number nothing
   verified.
2. *Correctness.* Both helpers read `getComputedStyle().backgroundColor` and
   skipped only **fully** transparent values, so they could not have measured
   dark correctly even if pointed at it: the dark tints are `rgba(…, 0.15)` over
   the surface, and comparing text against that raw value computes a ratio
   against a colour no pixel ever had. In light the tints are opaque hex, which
   is why this never surfaced.

**Fix.** One shared module, `e2e/tests/contrast.ts`, holding the ratio
computation, the **compositing** background walk, the vacuity guard and the
theme helpers; both sweeps import it and are parametrised over
`["light", "dark"]`. The sweeps previously carried a `contrastRatio` each —
two copies of a measurement is how two guards drift into disagreeing about what
they measure.

`assertTheme` is not ceremony: it polls `documentElement.dataset.theme` after
navigation, because a "both themes" sweep whose emulation silently fails
measures light twice and reports double the confidence for none of the coverage.

**No product defect was found, and that is the honest headline.** Every existing
pairing already conformed in dark. The two guards were incomplete, not wrong.

**Discrimination proven rather than assumed**, in both directions, because a
sweep that has never failed is indistinguishable from one that cannot:

| Injected regression | light | dark |
| :-- | :-- | :-- |
| sign-in alert `--color-danger-text` → `--color-danger` | **red, 3.95:1** ✅ caught | green — and *correctly so*: dark's `#F87171` on the composited tint genuinely clears 4.5:1 |
| sign-in alert text → `--color-danger-subtle` (text on itself) | **red, 1.00:1** | **red, 3.93:1** |

The second row is the proof the first could not give. Its dark failure reports
the background as `rgb(52, 34, 49.3)` — fractional components, i.e. a genuinely
**composited** colour. Before this fix that same background would have been read
as opaque `rgb(239, 68, 68)`, a completely different and much lighter colour, and
the ratio would have been meaningless.

**Method note worth keeping.** The first regression above is the more natural one
to reach for, and on its own it would have "proven" the dark sweep works while
proving nothing — it passes in dark for a legitimate reason. A discrimination
check has to fail *for the reason you are testing*, not merely fail.

**Verification.** Both sweeps green in both themes; **e2e 60 → 65** (the sweeps
went 2→4 and 3→6 tests); lint clean. No production file changed — the diff is
test infrastructure only.

## DEF-014 — the dev tools overlay sits on the sign-out control (2026-08-03)

**Reported:** 2026-08-03, by the user, from a red `End-to-end (walking skeleton)`
job on GitHub Actions. CI had been red on this since **2026-07-31** — three
consecutive runs, all the same single failure.

**Symptom.** `profile.spec.ts:159` (UC-007's D3 clause — signing out clears the
device theme mirror) times out at 30s on `getByTestId("sign-out").click()`.
Playwright resolves the locator, finds the button visible, enabled and stable,
and then declines to click it 53 times in a row:

```
- <nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script>
  subtree intercepts pointer events
```

**Cause.** The suite drives the web tier in **dev mode**
(`npm run dev -w @todo/web`, playwright.config.ts webServer). Next's dev tools
indicator renders into a `<nextjs-portal>` fixed to the viewport's **bottom-left
corner**, which is exactly where the app shell puts sign-out —
`sign-out-button.tsx` gives it `marginTop: auto` in the sidebar footer, and the
resolved dev config's `devIndicators.position` is `bottom-left`. The overlay
hit-tests above the app, and Playwright's actionability check refuses to click
through an intercepting element (correctly — a user could not click it either,
if the overlay were real).

**Why it looked CI-specific, and was not.** Measured locally at a 1280×720
viewport, sign-out's click point is `(49, 674)`, and `elementFromPoint` there
returns:

| after page load | element at the click point |
| :-- | :-- |
| T+0ms | `<button data-testid="sign-out">` |
| T+1000ms | `<nextjs-portal>` |
| T+3000 / 6000 / 10000ms | `<nextjs-portal>` |

The indicator mounts asynchronously, about a second after paint. So the outcome
was decided by **how fast the machine was**, not by anything in the code: the
whole UC-007 test runs in **1.6s** on a warm dev machine and wins the race, while
on the runner — two workers, a "slow filesystem detected" warning from Next, and
a cold dev server — the same click lands ~20s in and loses it. A first
reproduction attempt measured at T+0 and saw a 0×0 portal, which is what "passes
locally" looks like from the inside.

**Not a product defect.** The dev overlay does not exist in `next build` output,
so no user can meet it. It is the harness observing something that isn't shipped
— the same class as DEF-012, where the guards were the thing at fault.

**Fix.** `devIndicators: false` in `apps/web/next.config.ts`, behind
`NEXT_DISABLE_DEV_INDICATORS`, which `e2e/playwright.config.ts` sets in the web
server's env. Scoped to the harness deliberately: a developer running
`npm run dev` by hand keeps the indicator, and `next build` is unaffected either
way.

**What was deliberately not done:** `click({ force: true })`, or a `.click()` on
a re-positioned indicator. Forcing the click would have made this test green
while leaving every other bottom-left control one timing change away from the
same failure — and would have permanently disabled the actionability check that
correctly caught a real overlay. That is the anti-fake-green line: the test was
right, the harness was wrong.

**Guard.** `e2e/tests/dev-overlay.spec.ts` signs in, **settles 4s** — past the
observed ~1s mount, because a guard that can win the race is not a guard — and
asserts that each shell control (`sign-out`, `search-trigger`, `new-list`) is
still the topmost element at its own click point, naming the interceptor's tag
in the failure. Red before the fix with exactly the reported cause
(`[sign-out] is covered at its click point by <nextjs-portal>`), green after.

**Verification.** Full CI-equivalent, in the workflow's order: boundaries clean
(210 modules), lint clean, `npm run build` all units, api **529**, worker **51**,
web **96**, and the e2e suite **70** (69 + the new guard) at `--workers=2` —
matching CI's parallelism — green **twice consecutively**.

## DEF-015 — the detail panel read due dates in UTC (2026-08-03)

**Reported:** 2026-08-03, by the user, with a screenshot: the Inbox row reads
`Today 10:58 PM` and the detail panel for that same task reads `03/08/2026,
05:58 PM`. Their account is `Asia/Karachi` (UTC+5) — a clean five hours.

**Symptom, precisely.** Creation is correct and reading in the *list* is correct;
only the **intercepted panel** is wrong, and it is wrong by exactly the account's
offset from UTC. Both the panel's `datetime-local` input and the preview chip
beside it show the UTC wall clock.

**Cause — route composition, not date arithmetic.** `lib/due-date.ts` is fine:
every function there takes the zone explicitly and was passed one. The zone
itself was wrong. `@detail` is a **parallel route**, and `app/layout.tsx`
renders it as a *sibling* of `children`:

```tsx
<UndoHost>
  {children}   {/* → AppShell → ShellFrame → PreferencesProvider */}
  {detail}     {/* → DetailPanel → TaskDetail — outside all of it */}
</UndoHost>
```

`PreferencesProvider` is mounted by `ShellFrame` (FEAT-008 technical-design
§5.2), so nothing in the `detail` slot is inside it, and `useTimeZone()` returned
its documented fallback: `usePreferences()?.timezone ?? "UTC"`. The fallback did
its job — it is there so a failed profile fetch still renders dates (NFR-REL-004)
— it was simply never meant to be the *normal* path for a whole surface.

**Why the full page was fine, and why that matters.** `app/tasks/[id]/page.tsx`
wraps its `TaskDetail` in `AppShell`. Same component, same URL, two
presentations (ui-design D1) — and only the intercepted one was outside the
preferences host. So the defect's real shape is that **one URL showed two
different clocks depending on whether you clicked or refreshed**, which is also
why it survived: the deep-link path a test would naturally reach for is the
correct one.

**Not a display bug — it corrupted writes.** The input renders with
`toDateTimeLocalValue(dueAt, timeZone)` and saves with
`fromDateTimeLocalValue(v, timeZone)` — the *same* `timeZone`. An unchanged
save round-trips harmlessly (UTC out, UTC back), which is what made it look
cosmetic. But a user who *edits* the time has their wall clock read as UTC.
Measured against the unfixed code: typing `22:58` for a Karachi account stored
`2026-09-14T22:58:00.000Z`, five hours later than the `17:58:00.000Z` it means.

**Fix.** `app/@detail/(.)tasks/[id]/page.tsx` becomes its own preferences host —
`fetchProfile()` in the same `Promise.all` as `fetchTask()` (the shell's own D7
reasoning: one parallel primary-key read, not a second round-trip), wrapping the
panel in `PreferencesProvider`. Two lines of behaviour; the alternative of
hoisting the provider to the root layout would have put a session-dependent
fetch on the signed-out screens too.

Also corrected: `task-detail.tsx`'s due-date comment still said the picker
"interprets the user's timezone (**the browser's**, per technical-design D1/§8)"
— FEAT-011's original intent, superseded by FEAT-008 and stale ever since. A
comment asserting the wrong source for the exact value that was wrong is worth a
line of its own.

**Guard.** `task-detail.spec.ts` — `DEF-015 / FR-PROF-003`, in the owning
feature's suite. Sets the account to `Asia/Karachi` (UTC+5, **no DST**, so the
expected wall clock is the same arithmetic on every day of the year), creates a
task through the UI at 17:58 local, and asserts: the stored instant is `12:58Z`
(creation was never the bug), the **panel** shows `17:58`, the **full page** at
the same URL shows `17:58`, and an edit typed into the panel lands as the
instant that wall clock names.

**Discrimination proven on both clauses**, not just the reported one. The read
clause was red before the fix with the user's own numbers (expected `17:58`,
received `12:58`). The write clause was written after the fix, so it was
re-checked against the reverted code in isolation — red, storing `22:58Z` where
`17:58Z` was required. A clause that has never been observed red is not evidence.

**Verification.** boundaries clean, lint clean, `npm run build` all units, api
**529**, worker **51**, web **96**, e2e **71** (70 + this guard) at
`--workers=2`.

**Open:** acceptance re-verification of FEAT-011 (the route's step 5) has not
been run — the ledger row says so rather than implying a verdict that does not
exist.
