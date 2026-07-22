# UI Design: FEAT-001 — Register account + bootstrap Inbox

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-001 (Sign Up), SCR-WEB-002 (Verify Email — Notice) ·
> Mode: per-feature (first feature — implicit-anchor scrutiny) · Status: Draft · Date: 2026-07-21
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

Both screens live in the **public auth zone** (no app-shell / sidebar — ux-foundations
B1 IA). Shared auth layout: a single centered `card` (`--color-surface`, `--radius-lg`,
`--shadow-sm`) on the `--color-background` canvas, max-width **400px**, vertical stack at
`--space-4`, with the **"To-Do" wordmark** (`h3`, `--color-primary`, weight 600) above the
card. Full-width with `--space-4` page padding below `md`; centered fixed-width at/above
`md`. Light + dark themes via tokens. This is a composition of existing primitives — no new
component (implicit-anchor verdict: **system composes cleanly**, no escalation).

## SCR-WEB-001 — Sign Up

- **Strategy & source:** code-native (this section is the design).
- **Purpose (ux-foundations):** register with email + password. Realizes UC-001 (main +
  alt 3a/3b). **Composition:** auth `card` › `field`(email `input`) › `field`(password
  `input`, `type=password`) › `button-primary` "Create account" (full-width) › a `link`
  row "Already have an account? Sign in" (→ SCR-WEB-004, built in FEAT-003). A top
  `inline-alert` slot (danger) for form-level errors. Labels always present and associated
  (design.md §4 Forms, §5 Semantics).
- **Content & data mapping:** submit → `POST /auth/register` with `{ email, password }`
  (technical-design §3). Success `201 {status:"verification_sent"}` → navigate to
  SCR-WEB-002. `PASSWORD_MIN_LENGTH` (from `@todo/shared`) drives the password help text so
  the client hint matches the server rule (no duplicated constant).
- **Conformance:** pass — all elements are design.md components themed by tokens; no
  off-system color/spacing.

### default
Wordmark + card. `field` email (label "Email", `type=email`, `autocomplete=email`,
autofocus) and `field` password (label "Password", `type=password`,
`autocomplete=new-password`, help text: "At least 10 characters."). Full-width
`button-primary` "Create account". Below: `link` "Already have an account? Sign in".
Enter submits.

### validating
On submit, `button-primary` enters its **loading** state (spinner + disabled, design.md §4
Actions) while `POST /auth/register` is in flight; inputs remain readable, not reset.

### field-error
Per design.md validation convention (§4 Forms — validate on blur + submit, one error per
field beneath it):
- **Malformed email** (client `type=email`/format, and server `400 validation_failed`
  field=`email`): email `input` error border (`--color-danger`) + `small` danger message
  beneath, e.g. "Enter a valid email address." (FR-AUTH-003; UC-001 3b).
- **Weak / breached password** (server `400 validation_failed` field=`password`): password
  `input` error state + the **specific requirement** from the response `fields[].message`
  (e.g. "Must be at least 10 characters." or "This password is too common — pick another.").
  Input value preserved (FR-AUTH-004, NFR-SEC-003; UC-001 3b).
- **Email already in use** (server `409 email_taken`): top `inline-alert` (danger) "This
  email is already in use." with an inline `link` to **Sign in** and to **Reset password**
  (SCR-WEB-004 / SCR-WEB-005, later features) — matches technical-design §3 / D5 (FR-AUTH-002;
  UC-001 3a). Errors announced via `aria-live` (§5).

- **Responsive notes:** card is full-bleed width minus `--space-4` padding below `md`;
  fixed 400px centered at/above `md`. Inputs and button are ≥ 44px tall on touch (§5).
- **Decisions:** none beyond the shared auth layout (top of doc).

## SCR-WEB-002 — Verify Email — Notice

- **Strategy & source:** code-native (this section is the design).
- **Purpose (ux-foundations):** "Check your email" confirmation after registration, with a
  resend affordance. Realizes UC-001 (post-register) / UC-002. **Composition:** auth `card`
  › Lucide `MailCheck` icon (decorative, `--color-primary-bright`, non-text) › `h3`
  headline › `body` `--color-text-muted` subtext showing the address › `button-tertiary`
  "Resend email" › `link` "Back to sign in". An `inline-alert` slot for the resend result.
- **Content & data mapping:** reached on `POST /auth/register` `201` (arrival state — the
  registered email is passed from SCR-WEB-001). **The Resend action binds to
  `POST /auth/verify/resend` (FR-AUTH-008), which is designed in FEAT-002** — a forward
  dependency (see Escalations). This feature specifies the button and its result states;
  FEAT-002 wires the endpoint.
- **Conformance:** pass — composition of existing components/tokens; no off-system element.

### default
Icon + `h3` "Check your email" + subtext "We sent a verification link to
**{email}**. Click it to activate your account." (voice §6: warm, brief). `button-tertiary`
"Resend email" and a `link` "Back to sign in" (→ SCR-WEB-004). The verification link's 24h
expiry (NFR-SEC-004) is enforced server-side; no countdown shown.

### resend-sent
After a successful resend (FEAT-002 endpoint), a success `inline-alert`: "Sent again — check
your inbox." The "Resend email" button briefly shows its loading state during the call.
*(Behavior/binding completes in FEAT-002; visual spec is fixed here.)*

### rate-limited
When resend is throttled (FR-AUTH-008 rate limit / NFR-SEC-006, enforced in FEAT-002), a
neutral `inline-alert`: "You've asked a few times — please wait a minute before trying
again." Button disabled until the window passes. *(Behavior/binding completes in FEAT-002.)*

- **Responsive notes:** same centered-card behavior as SCR-WEB-001.
- **Decisions:** none.

## Cross-screen decisions

- **Shared auth layout** (centered 400px card on canvas, wordmark above) defined once at the
  top of this doc; both screens and future auth screens (SCR-WEB-004/005/006) reuse it. This
  is a composition, not a new design.md component — no escalation.
- **Client/server rule parity:** the password min-length hint on SCR-WEB-001 reads
  `PASSWORD_MIN_LENGTH` from `@todo/shared` rather than hard-coding "10", so the UI hint can
  never drift from the server policy (NFR-SEC-003).

## Escalations & open items

- **No design-system amendment.** Both screens compose from existing design.md components;
  the system composes cleanly for the first real feature (implicit-anchor result).
- **Forward binding (not a gap in this feature):** SCR-WEB-002's Resend action
  (`resend-sent` / `rate-limited` states) binds to `POST /auth/verify/resend`, owned by
  **FEAT-002**. The manifest entry for SCR-WEB-002 records this deferred binding; FEAT-002's
  ui-design run will update the entry when that endpoint exists. The `default` (arrival)
  state is fully bound now.
