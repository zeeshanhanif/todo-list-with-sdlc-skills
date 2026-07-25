# UI Design: FEAT-003 — Sign in (session, lockout, rate-limit)

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-004 (Sign In) · Mode: per-feature · Status: Draft · Date: 2026-07-24
> Strategy: code-native (project fallback policy; no design tool holds this screen)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

Lives in the **public auth zone** (no app-shell / sidebar — ux-foundations B1 IA),
reusing the **shared auth layout** established by FEAT-001: a single centered `card`
(`--color-surface`, `--radius-lg`, `--shadow-sm`) on the `--color-background` canvas,
max-width **400px**, vertical stack at `--space-4`, with the **"To-Do" wordmark**
(`h3`, `--color-primary`, weight 600) above the card; full-bleed minus `--space-4`
padding below `md`, fixed-width centered at/above `md`; light + dark via tokens. A
composition of existing primitives — **no new component, no escalation**.

## SCR-WEB-004 — Sign In

- **Strategy & source:** code-native (this section is the design).
- **Purpose (ux-foundations):** authenticate a verified user. Realizes UC-003
  (main + alt 3a/3b + exc-2a/3c). **Composition:** auth `card` › `field`(email
  `input`) › `field`(password `input`, `type=password`) › full-width
  `button-primary` "Sign in" › a `link` row "Forgot password?" (→ SCR-WEB-005,
  FEAT-005) and "Don't have an account? Sign up" (→ SCR-WEB-001). A top
  `inline-alert` slot for form-level errors and the unverified prompt. Labels
  always present and associated (design.md §4 Forms, §5).
- **Content & data mapping:** submit → `POST /auth/login` with `{ email, password }`
  (technical-design §3.1). Success `200 {status:"signed_in", user}` → the session
  cookie is set (via the BFF, D6 of technical-design) and the app routes into the
  **app-shell** (SCR-WEB-007). The four error branches map to the four designed
  responses (401 / 403 / 423 / 429) — see states below.
- **Conformance:** pass — all elements are design.md components themed by tokens;
  no off-system color/spacing/component.

### default
Wordmark + card. `field` email (label "Email", `type=email`, `autocomplete=email`,
autofocus) and `field` password (label "Password", `type=password`,
`autocomplete=current-password`). Full-width `button-primary` "Sign in". Below:
`link` "Forgot password?" and `link` "Don't have an account? Sign up". Enter
submits. On submit the `button-primary` enters its **loading** state (spinner +
disabled, design.md §4 Actions) while `POST /auth/login` is in flight; inputs stay
readable and are not reset.

### error
Per design.md's error conventions (§4 Forms/Feedback), form-level messages use the
top `inline-alert`; all messages are announced via `aria-live` (§5). Email value is
**preserved**; the password field is **cleared and refocused** on any auth failure
(D4). Four branches, mapped to technical-design §3.1:

- **Invalid credentials** (`401 invalid_credentials`) — a single **generic**
  danger `inline-alert`: "That email or password doesn't match. Please try again."
  **No field-level highlight** distinguishing which was wrong (FR-AUTH-010,
  no enumeration; D1).
- **Account locked** (`423 account_locked`) — a danger `inline-alert`: "Too many
  attempts. For your security we've paused sign-in for this account — try again in
  about {retryAfterSeconds → minutes}." The Sign-in button is disabled until the
  window elapses (FR-AUTH-019; UC-003 exc-3c; D3).
- **Too many attempts / rate-limited** (`429 rate_limited`) — a warning
  `inline-alert`: "Too many attempts from your device. Please wait a moment and try
  again." (FR-AUTH-018, NFR-SEC-006; UC-003 exc-2a; D3).
- **Validation** (`400 validation_failed`) — field-level: the offending field
  (`email`) shows its error border (`--color-danger`) + `small` danger message
  beneath from `fields[].message` (e.g. "Enter a valid email address.").

### unverified-prompt
Given `403 email_not_verified` (correct credentials, account not yet verified —
FR-AUTH-007; UC-003 alt 3b): an **info/warning** `inline-alert` in the card:
"Your email isn't verified yet — check your inbox for the link." with a
`button-tertiary` **"Resend verification email"** and a `link` "Back to
verification". The Resend action **reuses FEAT-002's** `POST /auth/verify/resend`
(neutral 200) with its **client-side cooldown** (`RESEND_COOLDOWN_SECONDS`), and
shows the same neutral resend-sent confirmation as SCR-WEB-002 (D2). No new
endpoint. No session is granted in this state.

- **Responsive notes:** same centered-card behavior as SCR-WEB-001/002 — full-bleed
  minus `--space-4` below `md`, fixed 400px centered at/above `md`; inputs and
  button ≥ 44px tall on touch (§5).
- **Decisions:**
  - **D1 — Generic, field-agnostic invalid-credentials error.** One top alert, no
    per-field highlight, identical for unknown-email and wrong-password. Driver:
    FR-AUTH-010 no-enumeration (mirrors the API's byte-identical 401, technical-design D2/AC-2).
  - **D2 — Unverified prompt reuses FEAT-002 resend.** The `403` branch offers the
    existing `POST /auth/verify/resend` + client cooldown rather than a new
    mechanism; visual + copy parity with SCR-WEB-002's resend.
  - **D3 — Retry-after copy, lock vs. throttle distinguished.** `retryAfterSeconds`
    from the 423/429 body is rendered as human text; the account-lock (423) and
    per-device throttle (429) get distinct copy so the user knows which applies.
  - **D4 — Password cleared on failure, email preserved.** Balances NFR-REL-004
    (preserve unsent input — email kept) against the security convention of not
    retaining an entered password after a failed attempt.

## Cross-screen decisions

- **Shared auth layout reused, not redefined** — the centered 400px card + wordmark
  from FEAT-001's ui-design.md. SCR-WEB-004 completes the public auth-zone set
  (SCR-WEB-001/002/003/004); it is a composition, not a new design.md component.
- **Resend parity with SCR-WEB-002** — the unverified-prompt's resend is the same
  control, copy, and neutral contract as the Verify-Notice screen, so the two entry
  points to resend behave identically.

## Escalations & open items

- **No design-system amendment.** SCR-WEB-004 composes entirely from existing
  design.md components (`card`, `field`, `input`, `button-primary`,
  `button-tertiary`, `inline-alert`, `link`) themed by tokens; the system composes
  cleanly for this feature.
- **Forward links (not gaps in this feature):** "Forgot password?" targets
  SCR-WEB-005 (FEAT-005) and the success path routes into the app-shell
  SCR-WEB-007 (foundations). Both exist as targets; their behavior is owned by
  their features. Every state binding on this screen is to a contract that exists
  now (`POST /auth/login`, `POST /auth/verify/resend`).
