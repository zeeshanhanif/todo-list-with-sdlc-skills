# UI Design: FEAT-002 — Verify email + resend

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-003 (Verify Email — Result), SCR-WEB-002 (Verify Email — Notice, resend binding completed) ·
> Mode: per-feature · Status: Draft · Date: 2026-07-23
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

Both screens live in the **public auth zone** (no app-shell / sidebar — ux-foundations
B1 IA) and reuse the **shared auth layout** established in FEAT-001's ui-design.md
(centered `card` — `--color-surface`, `--radius-lg`, `--shadow-sm` — max-width **400px**
on the `--color-background` canvas, vertical stack at `--space-4`, "To-Do" wordmark above;
full-width with `--space-4` padding below `md`, centered fixed-width at/above `md`; light +
dark via tokens). Both are compositions of existing primitives — **no new component, no
escalation.**

## SCR-WEB-003 — Verify Email — Result

- **Strategy & source:** code-native (this section is the design). New web route **`/verify`**
  — the target of the verification email link (`${PUBLIC_APP_URL}/verify?token=…`,
  technical-design §2 forward path from FEAT-007). *(The "check your email" notice at
  `/verify-email` is the separate SCR-WEB-002.)*
- **Purpose (ux-foundations, inventory SCR-WEB-003):** landing from the email link; confirm
  the account is verified, or explain the link failed and offer recovery. Realizes UC-002
  (main success + alt 2a expired/invalid + exc-3a already-verified, the last folded into the
  invalid result per technical-design D2).
- **Composition:** auth `card` › a Lucide status icon (decorative, non-text) › `h3` headline
  › `body` `--color-text-muted` subtext › a primary action, arranged per state below. No
  form on the success path; the recovery path adds one `field` + `button`.
- **Content & data mapping:** on mount the page reads `?token=` and calls
  `POST /auth/verify` `{ token }` (technical-design §3). Response drives the state:
  `200 {status:"verified"}` → **success**; `400 token_expired` → **expired**; `400
  token_invalid` (never issued / already consumed / rotated away — also the already-verified
  case, D2) → **invalid**; missing/empty `?token=` → **invalid** without a network call. The
  recovery action calls `POST /auth/verify/resend` `{ email }` (see **expired/invalid**).
- **Conformance:** pass — all elements are design.md components themed by tokens; no
  off-system color, spacing, or pattern.

### verifying (loading)
Immediately on load, while `POST /auth/verify` is in flight: centered `spinner` (design.md
§Components) + `body` "Verifying your email…". No card chrome flash — this is the default
paint for a well-formed `?token=`. Follows the system's loading convention (§States).

### success
Lucide `CircleCheck` icon (`--color-success`), `h3` "Email verified", `body`
`--color-text-muted` "Your account is active. You can sign in now." Full-width
`button-primary` "Sign in" → SCR-WEB-004 (built in FEAT-003). Voice §6: warm, brief.
Bound to `POST /auth/verify` `200`.

### expired
Lucide `CircleAlert` icon (`--color-warning`), `h3` "This link has expired", `body`
"Verification links are good for 24 hours. Enter your email and we'll send a fresh one."
(the 24h bound is NFR-SEC-004; server-enforced, no countdown). Then the **recovery form**:
one `field` (label "Email", `type=email`, `autocomplete=email`) + full-width
`button-primary` "Send a new link" → `POST /auth/verify/resend`. A `link` "Back to sign in"
(→ SCR-WEB-004) below. Bound to `POST /auth/verify` `400 token_expired` (UC-002 alt 2a).

### invalid
Same layout as **expired** with copy for a link that can't be used: Lucide `CircleAlert`
(`--color-warning`), `h3` "This link didn't work", `body` "It may have already been used or
replaced by a newer email. Enter your email to get a new link — or just sign in if you're
already verified." Same recovery form + "Back to sign in" `link`. Bound to `POST /auth/verify`
`400 token_invalid` and the missing-token case. This single state covers already-verified
(UC-002 exc-3a) by offering **sign in** alongside resend — no separate branch (technical-design
D2).

### resend-sent
After the recovery form's `button-primary` submits (its **loading** state during the call),
the form is replaced by a success `inline-alert`: "If that address needs verifying, a new
link is on its way — check your inbox." **Neutral copy** (technical-design D3: resend never
discloses whether the address exists / is already verified). `aria-live` announces it (§5).
Bound to `POST /auth/verify/resend` `200` (always). A **client-side cooldown** then disables
the resubmit affordance for `RESEND_COOLDOWN_SECONDS` (see Cross-screen decisions).

- **Responsive notes:** same centered-card behavior as the auth zone; inputs/buttons ≥ 44px
  on touch (§5). The icon + heading remain centered at all widths.
- **Decisions:**
  - **D-a — recovery form carries an email input.** Driver: the verify page arrives with an
    opaque token and **no email** (we deliberately never decode the token, technical-design
    D1/D2), but `POST /auth/verify/resend` requires `{ email }`. So the expired/invalid
    states ask for the email rather than assuming it — this is also the ux-foundations Flow 1
    "Expired result → resend (SCR-WEB-003)" path. Rejected: routing to SCR-WEB-002, which
    only has the email when arriving fresh from registration.

## SCR-WEB-002 — Verify Email — Notice *(resend binding completed)*

- **Strategy & source:** code-native; **already designed in FEAT-001**
  (`features/FEAT-001-register/ui-design.md#scr-web-002--verify-email--notice`). FEAT-002
  does **not** redesign it — it completes the one deferred piece: the Resend control's
  endpoint binding and the reconciliation of its `rate-limited` state with this feature's
  **neutral** resend contract. Layout, `default`, and copy are unchanged.
- **Contract binding completed:** the "Resend email" `button-tertiary` now binds to
  `POST /auth/verify/resend` `{ email }` (the registered address, held from SCR-WEB-001).
  Response is the neutral `200 {status:"verification_sent"}` (technical-design §3, D3).
- **`resend-sent` (unchanged visual, binding now real):** on the neutral `200`, the success
  `inline-alert` "Sent again — check your inbox." shows; the button shows its loading state
  during the call.
- **`rate-limited` → reinterpreted as a client-side cooldown.** FEAT-001 speced this state
  assuming a server throttle response. FEAT-002's resend is **neutral** — the per-recipient
  cooldown (technical-design D4) returns the *same* `200`, never a 429, so the client must
  **not** infer throttling from the response (doing so would leak existence/activity). Instead,
  after any resend the button disables and shows "You can resend in a moment." for
  `RESEND_COOLDOWN_SECONDS`, a purely client-side timer. Copy stays close to FEAT-001's
  ("please wait a minute before trying again"). No response-driven variant until the
  cross-cutting IP limiter (FR-AUTH-018) lands and can return a real 429 (technical-design §8).
- **Conformance:** pass — no new elements; the change is a binding + a client-side timer.

## Cross-screen decisions

- **Neutral resend everywhere → client-side cooldown, not a server rate-limit state.** Both
  SCR-WEB-002 and SCR-WEB-003 disable their resend affordance for `RESEND_COOLDOWN_SECONDS`
  after a submit and show a brief "please wait" message, driven entirely client-side. This
  conforms to the neutral contract (technical-design D3/D4) — the UI never reveals whether an
  address exists, is already verified, or is in cooldown. The client cooldown value should
  track the server's `RESEND_COOLDOWN_SECONDS` (surface it via a shared constant when the
  IP-limiter foundations work exposes one; a sensible client default of 60s otherwise).
- **Success routes to Sign in (SCR-WEB-004), not the app.** Verification grants no session
  (technical-design §3 idempotency note), so the only forward action is signing in — matches
  ux-foundations Flow 1 ("Verified → Sign In").
- **Shared auth layout** reused from FEAT-001; no new design.md component.

## Escalations & open items

- **No design-system amendment.** Both screens compose from existing design.md components
  (`card`, `field`/`input`, `button-primary`/`button-tertiary`, `inline-alert`, `spinner`,
  `link`, Lucide icons); the system composes cleanly for this feature.
- **State reconciliation recorded (not a gap):** SCR-WEB-002's `rate-limited` state is now a
  client-side cooldown, reconciling FEAT-001's speculative server-throttle spec with
  FEAT-002's neutral contract. The manifest entry for SCR-WEB-002 is updated to add the
  `POST /auth/verify/resend` binding and this note.
- **Forward dependency:** the **success** action and both **Back to sign in** links target
  SCR-WEB-004 (`/signin`), built in FEAT-003 — the same forward link FEAT-001 already
  carries. Not a gap in this feature.
</content>
