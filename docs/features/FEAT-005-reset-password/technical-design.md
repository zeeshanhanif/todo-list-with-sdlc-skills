# Technical Design: FEAT-005 — Forgot / reset password

> Feature from: docs/implementation-plan.md · Epic: EPIC-A — Auth & Identity (`auth` module)
> Implements: FR-AUTH-012, FR-AUTH-013, FR-AUTH-014, FR-AUTH-017 (partial) ·
> also completes FR-AUTH-018 for the reset endpoints · NFR-SEC-003, NFR-SEC-004 (partial)
> Realizes: UC-005 · Screens: SCR-WEB-005, SCR-WEB-006 (designed by ui-design)
> Status: Draft · Date: 2026-07-25

## 1. Intent

Let a user who can't sign in regain access: request a reset by email (neutral,
no enumeration), receive a single-use, 1-hour link, and set a new password —
which invalidates all their existing sessions (FR-AUTH-017), forcing
re-authentication. It reuses four prior pieces almost whole: the single-use
token pattern (FEAT-002), the transactional outbox + worker (FEAT-007), the
password policy + hasher (FEAT-001), and the session store (FEAT-003); it adds
the by-user session-revoke that FEAT-004 §8 earmarked for the credential-change
features.

## 2. Codebase context

Surveyed live; the design conforms to and reuses:

- **Outbox + worker (FEAT-007) — reset email already supported.** The worker's
  `EmailRenderer` (`apps/worker/src/email/email-renderer.ts`) **already handles
  `type: "password_reset"`**, building the link
  `${PUBLIC_APP_URL}/reset-password?token=<token>` (1-hour expiry copy). So
  FEAT-005 needs **no worker change** — only to enqueue an `email_outbox` row of
  `type: 'password_reset'` with `payload { token, userId }` (same INSERT shape as
  `enqueueVerification`). This fixes the reset link's web route to
  **`/reset-password?token=`** (worker-owned).
- **Token pattern (FEAT-002).** `VerificationTokenService` issues a
  `randomBytes(32).base64url` raw token and stores only `SHA-256(raw)` hex with an
  expiry; verify re-hashes and matches. FEAT-005 mirrors this with a **reset**
  token (separate storage + 1-hour TTL) — see D1.
- **Token storage on `users` (migration 002/004).** Verification tokens live in
  `users.verification_token_hash` / `verification_token_expires_at` (partial index
  on the hash). The reset token gets its **own** columns on `users` (§4), never
  reusing the verification columns (independent lifecycle).
- **Password policy + hasher (FEAT-001).** `PasswordPolicyService.check(pw)`
  returns a requirement string or null; `PasswordHasher.hash/verify` (Argon2id).
  Reused verbatim for the new password (NFR-SEC-003).
- **Session store (FEAT-003) + revoke seam (FEAT-004).** `SessionsRepository` has
  `create/findLiveByTokenHash/touchLastUsed/deleteByTokenHash`. FEAT-005 adds
  **`deleteByUserId`** — the by-user "invalidate all" delete FEAT-004 §8 left for
  the credential-change features (FR-AUTH-017).
- **Contract/error conventions.** `ApiError` envelope; neutral-response pattern
  (FEAT-002 resend) for no-enumeration; `token_invalid` / `token_expired` error
  codes (FEAT-002 verify) reused for the reset token; `validation_failed` +
  `fields[]` for policy failures (FEAT-001). The per-IP `RateLimitGuard`
  (common/rate-limit, FEAT-003) is applied to the two new endpoints — this
  **completes FR-AUTH-018's endpoint coverage** (the item FEAT-003's acceptance
  report flagged).

## 3. API contracts

Both endpoints are public, rate-limited (per-IP `RateLimitGuard`), and return the
established `ApiError` envelope on failure.

### 3.1 `POST /auth/forgot` — request a reset (neutral)

- **Request** `ForgotPasswordRequest`: `{ email }` (`@IsEmail`).
- **Success `200`** `ForgotPasswordResponse`: `{ status: "reset_requested" }` —
  **the same body whether or not the address exists** (FR-AUTH-012, no
  enumeration). For a registered account: issue a reset token, store its
  hash+expiry, and enqueue a `password_reset` outbox row **in one transaction**.
  For an unknown address: a silent no-op with the identical response.
- **Errors:** `400 validation_failed` (malformed email); `429 rate_limited`
  (FR-AUTH-018). Delivery failure never surfaces here — the outbox decouples it
  (UC-005 exc-3a; SW-002).

### 3.2 `POST /auth/reset` — set a new password from the link

- **Request** `ResetPasswordRequest`: `{ token, password }`.
- **Success `200`** `ResetPasswordResponse`: `{ status: "password_reset" }`. In
  one transaction: update `password_hash`, **consume** the reset token (clear the
  reset columns — single-use), and **delete all the user's sessions**
  (FR-AUTH-017). UC-005 main steps 4–5.
- **Errors** (each traced):
  | Status | code | When | Trace |
  | :-- | :-- | :-- | :-- |
  | `400` | `token_expired` | Token matches a user but is past its 1-hour expiry | FR-AUTH-013, NFR-SEC-004; UC-005 alt 4a |
  | `400` | `token_invalid` | No live token matches — never issued, already consumed, or rotated | FR-AUTH-014; UC-005 alt 4a |
  | `400` | `validation_failed` (field `password`) | New password fails the policy — **token NOT consumed**, retry allowed | FR-AUTH-014, NFR-SEC-003; UC-005 alt 4b |
  | `429` | `rate_limited` | Per-IP window exceeded | FR-AUTH-018 |
  | `400` | `validation_failed` | Missing token/password | validation (AC-8) |

  Order in the handler: validate token (invalid/expired) → validate password
  policy (validation_failed, token untouched) → on both valid: update + consume +
  invalidate sessions. The token is consumed **only on success**, so alt 4b lets
  the user retry the same link with a stronger password.

## 4. Schema changes — migration 006 (`1721530000000_password-reset.js`)

A diff against the current schema (last migration 005). **Physical realization
within the existing User entity** — no new entity, no escalation (mirrors the
verification-token columns).

`users` — add:
| Column | Type | Notes |
| :-- | :-- | :-- |
| `reset_token_hash` | text NULL | `SHA-256(raw)` hex; NULL when no reset pending / after consume |
| `reset_token_expires_at` | timestamptz NULL | `now()` + 1h (NFR-SEC-004) |

Index: partial `users_reset_token_hash_idx ON users (reset_token_hash) WHERE
reset_token_hash IS NOT NULL` (point lookup on the live token only — mirrors
`users_verification_token_hash_idx`). `down` drops the index and columns.

## 5. Component design

- **`modules/auth/ResetTokenService`** (new; mirrors `VerificationTokenService`) —
  `issue(): { raw, hash, expiresAt = now + resetTokenTtlHours }`,
  `hashToken(raw)` = SHA-256 hex. Config `resetTokenTtlHours` (default 1) added to
  `infra/config.ts`. (Parallel to the verification service rather than folded into
  it — D1.)
- **`modules/auth/UsersRepository`** — add `findIdByEmail(email)` (forgot lookup),
  `setResetToken(tx, id, hash, expiresAt)`, `findByResetTokenHash(hash)`
  (`{ id, resetTokenExpiresAt } | null`), `updatePasswordAndClearReset(tx, id,
  passwordHash)` (set `password_hash`, clear reset columns, `updated_at = now()`).
- **`common/authz/SessionsRepository`** — add `deleteByUserId(userId, q?)` →
  `DELETE FROM sessions WHERE user_id = $1` (FR-AUTH-017). Accepts a tx client so
  the password update + session purge are atomic.
- **`modules/auth/EmailOutboxRepository`** — add `enqueuePasswordReset(tx,
  { recipient, userId, token })` → INSERT `type 'password_reset'`, `payload
  { token, userId }`.
- **`modules/auth/AuthService`**:
  - `requestPasswordReset(email)` — normalize → `findIdByEmail`; if none, neutral
    return; else issue reset token and, in one transaction, `setResetToken` +
    `enqueuePasswordReset`. (No cooldown — the per-IP limiter is the abuse control;
    reuse of the token columns naturally rotates any prior reset token.)
  - `resetPassword(token, password)` — `hashToken`; `findByResetTokenHash`;
    reject unmatched (`TokenInvalidError`) / expired (`TokenExpiredError`);
    `policy.check` → `PasswordPolicyError` if it fails (token untouched); else
    `hasher.hash` and, in one transaction, `updatePasswordAndClearReset` +
    `SessionsRepository.deleteByUserId` (FR-AUTH-017).
- **`modules/auth/AuthController`** — add `POST /auth/forgot`
  (`ForgotPasswordDto`) and `POST /auth/reset` (`ResetPasswordDto`), both
  `@UseGuards(RateLimitGuard)`; map `TokenExpiredError`/`TokenInvalidError` →
  `400 token_expired`/`token_invalid`, `PasswordPolicyError` → `400
  validation_failed` field=`password`. Reuses the existing `auth.errors.ts`
  classes.

```mermaid
sequenceDiagram
    actor U as "Visitor"
    participant API as "AuthService"
    participant DB as "Postgres"
    participant OB as "email_outbox → worker"
    U->>API: "POST /auth/forgot { email }"
    API->>DB: "find user; setResetToken (tx)"
    API->>OB: "enqueue password_reset (tx)"
    API-->>U: "200 reset_requested (neutral)"
    Note over OB: "worker renders /reset-password?token=… and sends"
    U->>API: "POST /auth/reset { token, password }"
    API->>DB: "match reset token; check expiry"
    API->>API: "policy.check(password)"
    API->>DB: "update password; clear reset token; delete all sessions (tx)"
    API-->>U: "200 password_reset"
```

## 6. Acceptance criteria

- **AC-1 (FR-AUTH-012, UC-005 main 1–2).** `POST /auth/forgot` returns
  `200 { status:"reset_requested" }` for **any** email; for a registered address
  a reset token is stored and one `password_reset` outbox row is enqueued; for an
  unknown address nothing is stored/enqueued — and the response body is identical
  (no enumeration).
- **AC-2 (FR-AUTH-013, NFR-SEC-004).** The reset token is single-use and
  time-limited: the raw token appears only in the outbox payload (for the email),
  the DB stores only its `SHA-256` hash, and `reset_token_expires_at` ≈ `now()` +
  the configured TTL (default 1 hour).
- **AC-3 (FR-AUTH-014, UC-005 main 4–5).** `POST /auth/reset` with a live token +
  policy-compliant password returns `200 { status:"password_reset" }`; afterward
  the old password no longer verifies and the new one does, and the reset token is
  cleared (a second use → `token_invalid`, single-use).
- **AC-4 (FR-AUTH-017).** On a successful reset, **all** the user's existing
  sessions are deleted — a session cookie valid before the reset no longer
  resolves (`GET /auth/session` → 401), forcing re-authentication.
- **AC-5 (UC-005 alt 4a).** An expired reset token → `400 token_expired`; an
  unknown/already-consumed token → `400 token_invalid`; the password is unchanged
  in both cases.
- **AC-6 (FR-AUTH-014, NFR-SEC-003, UC-005 alt 4b).** A new password failing the
  policy → `400 validation_failed` with a `password` field message; the password
  is **not** changed and the token is **not** consumed (the same link still works
  for a retry).
- **AC-7 (FR-AUTH-018, NFR-SEC-006).** `POST /auth/forgot` and `POST /auth/reset`
  are per-IP rate-limited — over the window they return `429 rate_limited`. (This
  completes FR-AUTH-018's coverage of the password-reset endpoints.)
- **AC-8 (validation).** A malformed email on forgot, or a missing token/password
  on reset, returns `400 validation_failed` with a `fields[]` entry.

## 7. Decisions

- **D1 — A parallel `ResetTokenService`, not a folded generic.** Reset tokens
  mirror verification tokens (opaque, hash-at-rest, TTL) but differ in lifetime
  (1h vs 24h) and storage columns. Rather than generalize the FEAT-002-verified
  `VerificationTokenService` (churn on tested code), FEAT-005 adds a parallel
  service. Driver: minimal blast radius; the shared crypto is trivial (SHA-256 +
  randomBytes). Consequence: two tiny token services — acceptable duplication.
- **D2 — Reset token on `users` columns, not a new table.** Symmetric with the
  verification token (migration 002/004); physical within the User entity. A
  `password_reset` table would be a new noun the domain doesn't have — not
  warranted for one hash + expiry per user. (If concurrent multi-device reset
  tokens are ever needed, revisit — out of scope.)
- **D3 — Token consumed only on success (retry-friendly).** The reset token is
  cleared in the same transaction as the password update, so a policy failure
  (alt 4b) leaves the link usable. This matches UC-005's "validate the link and
  the password policy" as two gates with the link surviving a policy retry.
- **D4 — Invalidate ALL sessions on reset (FR-AUTH-017).** `deleteByUserId` in
  the reset transaction. This is the by-user revoke seam FEAT-004 §8 deferred;
  FEAT-006 (change password) and FEAT-018 (delete account) reuse it.
- **D5 — Reset works for any registered account, verified or not.** FR-AUTH-013
  says "registered addresses"; nothing restricts reset to verified accounts.
  `findIdByEmail` matches any account. (A reset that also implicitly proves email
  control is a reasonable future enhancement — not specified, out of scope.)

## 8. Escalations & open items

- **No architecture amendment; no new entity.** Reset-token columns are physical
  within User; `deleteByUserId` is a physical use of the existing Session entity;
  the `password_reset` outbox type is already supported by the worker.
- **FR-AUTH-018 coverage note (positive).** Applying `RateLimitGuard` to
  `/auth/forgot` + `/auth/reset` here closes the endpoint-coverage gap FEAT-003's
  acceptance report recorded (forgot/reset pending FEAT-005). On acceptance,
  FR-AUTH-018's Test ref gains FEAT-005 — recommend the RTM Plan ref for
  FR-AUTH-018 also list FEAT-005 (currently FEAT-003 only), so its
  full-verification computes correctly.
- **Reset link route is worker-fixed.** The worker renders
  `/reset-password?token=`; ui-design must serve SCR-WEB-006 at that route
  (request form SCR-WEB-005 at `/reset-password` with no token — mirrors
  `/verify`). Noted for ui-design; not a divergence.

Verification: clean (self-check per Phase 5 — every FEAT-005 FR has ≥1 criterion
and ≥1 task; all cited IDs resolve; schema within the conceptual model; contracts
reuse existing envelopes/codes; the worker already renders the reset email).
