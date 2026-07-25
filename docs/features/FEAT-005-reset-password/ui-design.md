# UI Design: FEAT-005 — Forgot / reset password

> Feature from: docs/implementation-plan.md · Pairs with: technical-design.md
> Screens: SCR-WEB-005 (Forgot Password), SCR-WEB-006 (Reset Password) · Mode: per-feature · Status: Draft · Date: 2026-07-25
> Strategy: code-native (project fallback policy; no design tool holds these screens)
> Authority: docs/design.md + docs/tokens.json — every value below is a token, never raw.

Both screens live in the **public auth zone** and reuse the **shared auth layout**
from FEAT-001 (centered 400px `card` + "To-Do" wordmark on the `--color-background`
canvas; `AuthShell`). They share **one route, `/reset-password`** (worker-fixed —
the reset email links to `/reset-password?token=…`): **no `?token=` → the forgot
request (SCR-WEB-005); `?token=` present → the set-new-password form (SCR-WEB-006)**.
This mirrors the `/verify` pattern (FEAT-002). Compositions of existing primitives
— **no new component, no escalation**.

## SCR-WEB-005 — Forgot Password

- **Strategy & source:** code-native (this section is the design). Served at
  `/reset-password` with no `token` query param.
- **Purpose (ux-foundations):** request a reset link. Realizes UC-005 (steps 1–2).
  **Composition:** auth `card` › `h1` "Reset your password" › `field`(email
  `input`, `type=email`, `autocomplete=email`, autofocus) › full-width
  `button-primary` "Send reset link" › `link` "Back to sign in" (→ `/signin`). A
  top `inline-alert` slot for the neutral confirmation and rate-limit notice.
- **Content & data mapping:** submit → `POST /api/auth/forgot` `{ email }`
  (technical-design §3.1). The response is **always** `200 { status:"reset_requested" }`
  — the UI shows the same neutral confirmation regardless (no enumeration).
- **Conformance:** pass — `card`/`field`/`input`/`button-primary`/`inline-alert`/
  `link`, all design.md components themed by tokens.

### default
Wordmark + card with the email `field` and "Send reset link" `button-primary`.
Enter submits; on submit the button enters its loading state (spinner + disabled)
while the request is in flight.

### submitted (neutral)
On the `200`, replace the form with a neutral success `inline-alert`: "If an
account exists for **{email}**, we've sent a link to reset your password. Check
your inbox." (voice §6). This copy is identical whether or not the address is
registered (FR-AUTH-012, no enumeration). A `link` "Back to sign in" remains.

### field-error / rate-limited
- **Malformed email** (`400 validation_failed` field=`email`): email `input` error
  border + `small` danger message beneath (AC-8).
- **Rate-limited** (`429 rate_limited`): a warning `inline-alert` "Too many
  requests. Please wait a moment and try again." (FR-AUTH-018).

## SCR-WEB-006 — Reset Password

- **Strategy & source:** code-native (this section is the design). Served at
  `/reset-password?token=…` (the reset-email link target).
- **Purpose (ux-foundations):** set a new password from the link. Realizes UC-005
  (steps 4–6 + alt 4a/4b). **Composition:** auth `card` › `h1` "Set a new
  password" › `field`(password `input`, `type=password`,
  `autocomplete=new-password`, help "At least {PASSWORD_MIN_LENGTH} characters."
  from `@todo/shared`) › full-width `button-primary` "Set new password". A top
  `inline-alert` for form-level / token errors.
- **Content & data mapping:** submit → `POST /api/auth/reset`
  `{ token, password }` (token from the `?token=` query). Success
  `200 { status:"password_reset" }`. Errors map to the states below.
- **Conformance:** pass — same component set as SCR-WEB-005 plus the password
  help convention reused from SCR-WEB-001 (client hint reads the shared constant).

### default
The password `field` + "Set new password" `button-primary`. The `token` is read
from the URL and held for submit (not shown). Enter submits; button shows its
loading state while in flight.

### success
On the `200`, replace the form with a success `inline-alert`: "Your password has
been reset. All other sessions have been signed out." + a full-width
`button-primary`/`link` **"Sign in"** (→ `/signin`). (Reflects FR-AUTH-017 — the
reset invalidated existing sessions.)

### invalid / expired
On `400 token_invalid` **or** `token_expired` (UC-005 alt 4a): a danger
`inline-alert` — expired: "This reset link has expired." / invalid: "This reset
link is invalid or has already been used." — each with a `link` **"Request a new
link"** (→ `/reset-password`, SCR-WEB-005). The password form is hidden in this
state.

### field-error (policy) / rate-limited
- **Weak/breached password** (`400 validation_failed` field=`password`, UC-005
  alt 4b): password `input` error state + the specific requirement from
  `fields[].message`; the input value is preserved and the **link still works**
  for a retry (token not consumed — technical-design D3). (FR-AUTH-014, NFR-SEC-003.)
- **Rate-limited** (`429 rate_limited`): warning `inline-alert` wait message
  (FR-AUTH-018).

## Cross-screen decisions

- **D1 — One route, token-presence switch.** `/reset-password` renders SCR-WEB-005
  without a `?token=` and SCR-WEB-006 with one — dictated by the worker's email
  link (`/reset-password?token=`) and mirroring `/verify`. The signup/signin
  "Forgot password?" links (already pointing at `/reset-password`) land on
  SCR-WEB-005 correctly.
- **Neutral-confirmation + policy-error parity** with the existing auth screens:
  the forgot confirmation reuses SCR-WEB-005's no-enumeration copy pattern
  (SCR-WEB-002 resend), and the reset password-policy error reuses SCR-WEB-001's
  field-error treatment (same `fields[].message` rendering).

## Escalations & open items

- **No design-system amendment.** Both screens compose from existing design.md
  components themed by tokens; the public auth-zone set is now
  SCR-WEB-001/002/003/004/005/006.
- **Every state binding is to a contract that exists now** (`POST /auth/forgot`,
  `POST /auth/reset`, both this feature). No forward dependencies.
