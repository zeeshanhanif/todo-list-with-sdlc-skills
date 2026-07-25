"use client";

import { useEffect, useRef, useState } from "react";

// Resend-verification affordance shared by SCR-WEB-002 (notice, email known) and
// SCR-WEB-003 (result, email unknown). Binds to POST /api/auth/verify/resend
// (FEAT-002, FR-AUTH-008). The API response is NEUTRAL — always 200, never
// discloses whether the address exists / is verified / is in cooldown
// (technical-design D3) — so this UI must not infer throttling from the response.
// Instead it applies a purely CLIENT-SIDE cooldown after any submit
// (ui-design.md cross-screen decision reconciling the old "rate-limited" state).
// All values are design tokens.

// Client cooldown window. Tracks the server's RESEND_COOLDOWN_SECONDS default
// (60s); there is no server-exposed constant to import yet (technical-design §8).
const RESEND_COOLDOWN_SECONDS = 60;

const inputBase = {
  width: "100%",
  height: "var(--size-control-md)",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body)",
  boxSizing: "border-box" as const,
};

export function ResendVerification({
  email: knownEmail,
}: {
  /** When provided (SCR-WEB-002), the address is fixed and no input is shown.
   * When omitted (SCR-WEB-003 recovery), the user enters the address. */
  email?: string;
}) {
  const [email, setEmail] = useState(knownEmail ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown]);

  async function onResend(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting || cooldown > 0) return;
    setFieldError(null);
    // Basic client guard so the input mode doesn't post an empty value; the
    // server also validates (400 validation_failed) and stays neutral otherwise.
    if (!email.trim()) {
      setFieldError("Enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Neutral: any well-formed submit shows the same confirmation.
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setFieldError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const buttonLabel = submitting
    ? "Sending…"
    : cooldown > 0
      ? `You can resend in ${cooldown}s`
      : knownEmail
        ? "Resend email"
        : "Send a new link";

  return (
    <form onSubmit={onResend} noValidate>
      {sent && (
        <p
          role="status"
          aria-live="polite"
          data-testid="resend-sent"
          style={{
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-success-subtle)",
            color: "var(--color-success)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {knownEmail
            ? "Sent again — check your inbox."
            : "If that address needs verifying, a new link is on its way — check your inbox."}
        </p>
      )}

      {!knownEmail && (
        <div style={{ marginBottom: "var(--space-3)", textAlign: "left" }}>
          <label
            htmlFor="resend-email"
            style={{
              display: "block",
              marginBottom: "var(--space-1)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-text)",
            }}
          >
            Email
          </label>
          <input
            id="resend-email"
            data-testid="resend-email-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            aria-invalid={Boolean(fieldError)}
            style={{
              ...inputBase,
              border: `var(--border-width-hairline) solid ${
                fieldError ? "var(--color-danger)" : "var(--color-border-strong)"
              }`,
            }}
          />
          {fieldError && (
            <p
              data-testid="resend-email-error"
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--font-size-small)",
                color: "var(--color-danger)",
              }}
            >
              {fieldError}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        data-testid="resend-submit"
        disabled={submitting || cooldown > 0}
        style={
          knownEmail
            ? {
                // tertiary / ghost (design.md button-tertiary)
                width: "100%",
                height: "var(--size-control-md)",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "transparent",
                color: "var(--color-primary)",
                fontSize: "var(--font-size-body)",
                fontWeight:
                  "var(--font-weight-medium)" as unknown as number,
                cursor: submitting || cooldown > 0 ? "not-allowed" : "pointer",
                opacity: submitting || cooldown > 0 ? 0.6 : 1,
              }
            : {
                // primary (design.md button-primary)
                width: "100%",
                height: "var(--size-control-lg)",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                fontSize: "var(--font-size-body)",
                fontWeight:
                  "var(--font-weight-medium)" as unknown as number,
                cursor: submitting || cooldown > 0 ? "not-allowed" : "pointer",
                opacity: submitting || cooldown > 0 ? 0.6 : 1,
              }
        }
      >
        {buttonLabel}
      </button>
    </form>
  );
}
