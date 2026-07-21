"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PASSWORD_MIN_LENGTH, type ApiError } from "@todo/shared";
import { AuthShell } from "@/components/auth-shell";

// SCR-WEB-001 — Sign Up (ui-design.md). Realizes UC-001 main + alt 3a/3b.
// Posts to the BFF proxy (/api/auth/register); renders default / validating /
// field-error states. All values are design tokens.
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

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 201) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      const body = (await res.json()) as ApiError;
      if (res.status === 409) {
        setFormError(body.message);
      } else if (body.fields?.length) {
        setFieldErrors(
          Object.fromEntries(body.fields.map((f) => [f.field, f.message])),
        );
      } else {
        setFormError(body.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const border = (field: string) =>
    `var(--border-width-hairline) solid ${
      fieldErrors[field] ? "var(--color-danger)" : "var(--color-border-strong)"
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
        Create your account
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
          {formError}{" "}
          <Link href="/signin" style={{ color: "var(--color-danger)", textDecoration: "underline" }}>
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/reset-password" style={{ color: "var(--color-danger)", textDecoration: "underline" }}>
            reset your password
          </Link>
          .
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="password-help"
            style={{ ...inputBase, border: border("password") }}
          />
          {fieldErrors.password ? (
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
          ) : (
            <p
              id="password-help"
              style={{
                margin: `var(--space-1) 0 0`,
                fontSize: "var(--font-size-small)",
                color: "var(--color-text-muted)",
              }}
            >
              At least {PASSWORD_MIN_LENGTH} characters.
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p
        style={{
          marginTop: "var(--space-4)",
          fontSize: "var(--font-size-small)",
          color: "var(--color-text-muted)",
          textAlign: "center",
        }}
      >
        Already have an account?{" "}
        <Link href="/signin" style={{ color: "var(--color-primary)" }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
