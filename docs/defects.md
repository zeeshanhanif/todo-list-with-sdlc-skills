# Defect Ledger

Append-only record of defects found after a feature was verified. Owned by the
sdlc-orchestrator (the maintenance route); IDs are sequential, immutable, never
recycled.

| DEF | Reported | FR / Feature | Symptom (one line) | Fixed by | Re-verified |
| :-- | :------- | :----------- | :----------------- | :------- | :---------- |
| DEF-001 | 2026-07-27 | *(no FR — test infrastructure)* / FEAT-003, FEAT-005, FEAT-006 suites | Specs sharing an IP range delete each other's `auth_rate_buckets` rows mid-test, breaking `429` assertions | `24ae0d3` (disjoint ranges + `rate-limit-isolation.spec.ts` guard) | 2026-07-27 — guard red before / green after; flake rate ~25% → ~8% |
| DEF-002 | 2026-07-27 | *(no FR — test infrastructure)* / api suite | **Open.** Residual ~7% parallel-run flakiness after DEF-001: a *different* test fails each run, always "a row that should exist doesn't". Cross-worker DB interference **ruled out** — per-worker databases were tried and reverted | _open_ | _open_ |
| DEF-003 | 2026-07-28 | NFR-USE-004 (design.md §5 contrast) / FEAT-010, SCR-WEB-008 | `list-view-failure.tsx`'s alert put `--color-danger` text on `--color-danger-subtle` — **3.95:1**, below the 4.5:1 design.md §5 requires. Fixing it surfaced a **second** failure the report had missed: the action inside the tint at **4.48:1** | `bd200ec` (partner tokens; 3.95→6.80 and 4.48→6.21) | 2026-07-28 — measured, rendered output checked, e2e 15 green |
| DEF-004 | 2026-07-29 | NFR-USE-004 (design.md §5 contrast) / FEAT-011, SCR-WEB-008 + SCR-WEB-010; **also FEAT-009**'s sidebar badge (2nd instance) | `task-meta.tsx`'s **non-overdue** `DueChip` put `--color-text-muted` on `--color-surface-sunken` — **4.34:1** at `caption` (12px), below the 4.5:1 design.md §5 requires. The *overdue* variant was fine (6.80:1, the pairing DEF-003 fixed); it was the ordinary due-date chip that failed — and `lists-nav.tsx`'s count badge, found by grepping the pairing | `1294811` (text on the sunken tint takes `--color-text`; 4.34→16.30 light, 7.05→15.49 dark) | 2026-07-29 — failing contrast test red before / green after; FEAT-011 report re-verified **Accepted (unchanged)**; api 191, e2e 19 |

| DEF-005 | 2026-07-29 | NFR-USE-004 (design.md §5 control boundaries) / all web form controls, FEAT-001/002/003/005/006/009/010/011 | Every `input`/`textarea`/`select` in `apps/web` outlined in `--color-border-strong` — **1.48:1** light / **1.64:1** dark, below the 3:1 §5 requires for a boundary that is the control's only identifier. A web-tier accessibility pass, not per-feature work | `d27af38` (13 sites → `--color-text-muted`; 1.48→4.76 light, 1.64→6.64 dark) | 2026-07-29 — `control-contrast.spec.ts` sweep red before / green after across 8 screens; api 191, worker 20, e2e 21 |

| DEF-006 | 2026-07-29 | NFR-USE-004 (design.md §5 contrast) / FEAT-001, FEAT-003, FEAT-005, FEAT-009 — the **inline-alert** instances DEF-003 and DEF-004 both missed | **Open.** Five shipped sites still put `--color-danger` on `--color-danger-subtle` at `small` — the **3.95:1** pairing DEF-003 measured and `--color-danger-text` (6.80:1) exists to replace: `app/signup/page.tsx:89`, `app/signin/page.tsx:128`, `app/reset-password/page.tsx:46`, `components/lists-nav.tsx:117`, `components/list-dialog.tsx:196`. A web-tier pass, not per-feature rework | _open_ | _open_ |

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

## DEF-002 — residual parallel-run flakiness (open)

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
