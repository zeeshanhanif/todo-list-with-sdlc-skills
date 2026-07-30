"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AUTH_ERROR_CODES, type ApiError } from "@todo/shared";
import { AuthShell } from "@/components/auth-shell";

// SCR-WEB-004 — Sign In (ui-design.md). Realizes UC-003 (main + alt 3a/3b +
// exc-2a/3c). Posts to the BFF proxy (/api/auth/login), which relays the session
// cookie. States: default / submitting / error (invalid / locked / rate-limited /
// validation) / unverified-prompt. All values are design tokens.
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

interface RetryErr extends ApiError {
  retryAfterSeconds?: number;
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  function resetMessages() {
    setFieldErrors({});
    setFormError(null);
    setUnverified(false);
    setResendSent(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    resetMessages();
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 200) {
        router.push("/"); // into the app shell (SCR-WEB-007)
        return;
      }
      const body = (await res.json()) as RetryErr;
      // On any auth failure, clear the password (D4); email is preserved.
      setPassword("");
      if (body.code === AUTH_ERROR_CODES.emailNotVerified) {
        setUnverified(true);
      } else if (body.code === AUTH_ERROR_CODES.accountLocked) {
        const mins = Math.max(1, Math.ceil((body.retryAfterSeconds ?? 60) / 60));
        setFormError(
          `Too many attempts. For your security, sign-in is paused — try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        );
      } else if (body.code === AUTH_ERROR_CODES.rateLimited) {
        setFormError(
          "Too many attempts from your device. Please wait a moment and try again.",
        );
      } else if (body.fields?.length) {
        setFieldErrors(
          Object.fromEntries(body.fields.map((f) => [f.field, f.message])),
        );
      } else {
        setFormError(
          body.message ?? "That email or password doesn't match. Please try again.",
        );
      }
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    try {
      await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
    } catch {
      setResendSent(true); // neutral either way (no enumeration)
    }
  }

  const border = (field: string) =>
    `var(--border-width-hairline) solid ${
      fieldErrors[field] ? "var(--color-danger)" : "var(--color-text-muted)"
    }`;

  return (
    <AuthShell>
      <h1
        style={{
          fontSize: "var(--font-size-h2)",
          lineHeight: "var(--font-line-height-h2)",
          color: "var(--color-text)",
          margin: `0 0 var(--space-4)`,
        }}
      >
        Sign in
      </h1>

      {formError && (
        <div
          role="alert"
          data-testid="form-error"
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-danger-subtle)",
            color: "var(--color-danger)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {formError}
        </div>
      )}

      {unverified && (
        <div
          role="alert"
          data-testid="unverified-prompt"
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-warning-subtle)",
            color: "var(--color-warning-text)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {resendSent ? (
            <span>Sent again — check your inbox.</span>
          ) : (
            <span>
              Your email isn&rsquo;t verified yet — check your inbox for the link.{" "}
              <button
                type="button"
                data-testid="resend"
                onClick={onResend}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--color-primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "var(--font-size-small)",
                }}
              >
                Resend verification email
              </button>
            </span>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label
            htmlFor="email"
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
            id="email"
            data-testid="email-input"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            style={{ ...inputBase, border: border("email") }}
          />
          {fieldErrors.email && (
            <p
              data-testid="email-error"
              style={{
                margin: `var(--space-1) 0 0`,
                fontSize: "var(--font-size-small)",
                color: "var(--color-danger)",
              }}
            >
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div style={{ marginBottom: "var(--space-5)" }}>
          <label
            htmlFor="password"
            style={{
              display: "block",
              marginBottom: "var(--space-1)",
              fontSize: "var(--font-size-caption)",
              color: "var(--color-text)",
            }}
          >
            Password
          </label>
          <input
            id="password"
            data-testid="password-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            style={{ ...inputBase, border: border("password") }}
          />
          {fieldErrors.password && (
            <p
              data-testid="password-error"
              style={{
                margin: `var(--space-1) 0 0`,
                fontSize: "var(--font-size-small)",
                color: "var(--color-danger)",
              }}
            >
              {fieldErrors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid="submit"
          disabled={submitting}
          style={{
            width: "100%",
            height: "var(--size-control-lg)",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)" as unknown as number,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p
        style={{
          marginTop: "var(--space-4)",
          fontSize: "var(--font-size-small)",
          textAlign: "center",
        }}
      >
        <Link href="/reset-password" style={{ color: "var(--color-primary)" }}>
          Forgot password?
        </Link>
      </p>
      <p
        style={{
          marginTop: "var(--space-2)",
          fontSize: "var(--font-size-small)",
          color: "var(--color-text-muted)",
          textAlign: "center",
        }}
      >
        Don&rsquo;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--color-primary)" }}>
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
