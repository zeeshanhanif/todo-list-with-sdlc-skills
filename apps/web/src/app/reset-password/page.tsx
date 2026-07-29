"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PASSWORD_MIN_LENGTH, type ApiError } from "@todo/shared";
import { AuthShell } from "@/components/auth-shell";

// SCR-WEB-005 / SCR-WEB-006 (ui-design.md). One route /reset-password: no ?token=
// renders the forgot-request form (SCR-WEB-005); ?token=… renders the set-new-
// password form (SCR-WEB-006, the reset-email link target). All values are tokens.
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

const labelStyle = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text)",
};

const h1Style = {
  fontSize: "var(--font-size-h2)",
  lineHeight: "var(--font-line-height-h2)",
  color: "var(--color-text)",
  margin: "0 0 var(--space-4)",
};

function DangerAlert({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function SuccessAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      data-testid="success"
      style={{
        marginBottom: "var(--space-4)",
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-success-subtle)",
        color: "var(--color-success-text)",
        fontSize: "var(--font-size-small)",
      }}
    >
      {children}
    </div>
  );
}

const submitStyle = (busy: boolean) => ({
  width: "100%",
  height: "var(--size-control-lg)",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "var(--color-primary)",
  color: "var(--color-on-primary)",
  fontSize: "var(--font-size-body)",
  fontWeight: "var(--font-weight-medium)" as unknown as number,
  cursor: busy ? "not-allowed" : "pointer",
  opacity: busy ? 0.6 : 1,
});

// --- SCR-WEB-005: request a reset link ---
function ForgotForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setEmailError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 200) {
        setSubmitted(true);
        return;
      }
      const body = (await res.json()) as ApiError;
      if (res.status === 429) {
        setFormError("Too many requests. Please wait a moment and try again.");
      } else if (body.fields?.length) {
        setEmailError(body.fields[0].message);
      } else {
        setFormError(body.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <>
        <h1 style={h1Style}>Reset your password</h1>
        <SuccessAlert>
          If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a
          link to reset your password. Check your inbox.
        </SuccessAlert>
        <p style={{ fontSize: "var(--font-size-small)", textAlign: "center" }}>
          <Link href="/signin" style={{ color: "var(--color-primary)" }}>
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={h1Style}>Reset your password</h1>
      {formError && <DangerAlert>{formError}</DangerAlert>}
      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label htmlFor="email" style={labelStyle}>
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
            aria-invalid={Boolean(emailError)}
            style={{
              ...inputBase,
              border: `var(--border-width-hairline) solid ${
                emailError ? "var(--color-danger)" : "var(--color-text-muted)"
              }`,
            }}
          />
          {emailError && (
            <p
              data-testid="email-error"
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--font-size-small)",
                color: "var(--color-danger)",
              }}
            >
              {emailError}
            </p>
          )}
        </div>
        <button type="submit" data-testid="submit" disabled={submitting} style={submitStyle(submitting)}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-small)", textAlign: "center" }}>
        <Link href="/signin" style={{ color: "var(--color-primary)" }}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}

// --- SCR-WEB-006: set a new password from the link ---
function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<"invalid" | "expired" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setPasswordError(null);
    setTokenError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.status === 200) {
        setSuccess(true);
        return;
      }
      const body = (await res.json()) as ApiError;
      if (body.code === "token_expired") setTokenError("expired");
      else if (body.code === "token_invalid") setTokenError("invalid");
      else if (res.status === 429)
        setFormError("Too many attempts. Please wait a moment and try again.");
      else if (body.fields?.length) setPasswordError(body.fields[0].message);
      else setFormError(body.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <>
        <h1 style={h1Style}>Password reset</h1>
        <SuccessAlert>
          Your password has been reset. All other sessions have been signed out.
        </SuccessAlert>
        <Link href="/signin" style={{ textDecoration: "none" }}>
          <button type="button" style={submitStyle(false)}>
            Sign in
          </button>
        </Link>
      </>
    );
  }

  if (tokenError) {
    return (
      <>
        <h1 style={h1Style}>Set a new password</h1>
        <DangerAlert>
          {tokenError === "expired"
            ? "This reset link has expired."
            : "This reset link is invalid or has already been used."}
        </DangerAlert>
        <p style={{ fontSize: "var(--font-size-small)", textAlign: "center" }}>
          <Link href="/reset-password" style={{ color: "var(--color-primary)" }}>
            Request a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={h1Style}>Set a new password</h1>
      {formError && <DangerAlert>{formError}</DangerAlert>}
      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label htmlFor="password" style={labelStyle}>
            New password
          </label>
          <input
            id="password"
            data-testid="password-input"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(passwordError)}
            aria-describedby="password-help"
            style={{
              ...inputBase,
              border: `var(--border-width-hairline) solid ${
                passwordError ? "var(--color-danger)" : "var(--color-text-muted)"
              }`,
            }}
          />
          {passwordError ? (
            <p
              data-testid="password-error"
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--font-size-small)",
                color: "var(--color-danger)",
              }}
            >
              {passwordError}
            </p>
          ) : (
            <p
              id="password-help"
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--font-size-small)",
                color: "var(--color-text-muted)",
              }}
            >
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
        </div>
        <button type="submit" data-testid="submit" disabled={submitting} style={submitStyle(submitting)}>
          {submitting ? "Setting…" : "Set new password"}
        </button>
      </form>
    </>
  );
}

function ResetPasswordInner() {
  const token = useSearchParams().get("token");
  return <AuthShell>{token ? <ResetForm token={token} /> : <ForgotForm />}</AuthShell>;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell>Loading…</AuthShell>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
