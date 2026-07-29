"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_ERROR_CODES,
  PASSWORD_MIN_LENGTH,
  type ApiError,
} from "@todo/shared";

// SCR-WEB-015 form island (ui-design.md). Consumes POST /api/auth/change-password
// (BFF → API). States: default, submitting, success, error (wrong current
// password / weak new password / rate-limited) and the unauthenticated redirect
// (ui-design D3/D4). Input is preserved on every error (NFR-REL-004). Mirrors the
// field/alert/button treatments of the auth screens; all values are design tokens.
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

const helpStyle = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--font-size-small)",
  color: "var(--color-text-muted)",
};

const errorStyle = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--font-size-small)",
  color: "var(--color-danger)",
};

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    setCurrentError(null);
    setNewError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.status === 200) {
        // The rotated session cookie arrived with this response — the user stays
        // signed in here (ui-design D3). Clear the fields, keep the screen.
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        return;
      }
      if (res.status === 401) {
        // The session was revoked while the form was open (ui-design D4).
        router.push("/signin");
        return;
      }
      const body = (await res.json()) as ApiError;
      if (res.status === 429) {
        setFormError("Too many attempts. Please wait a moment and try again.");
      } else if (body.code === AUTH_ERROR_CODES.currentPasswordInvalid) {
        setCurrentError(
          body.fields?.[0]?.message ?? "That current password is incorrect.",
        );
      } else if (body.fields?.length) {
        for (const f of body.fields) {
          if (f.field === "newPassword") setNewError(f.message);
          if (f.field === "currentPassword") setCurrentError(f.message);
        }
        if (!body.fields.some((f) => f.field.endsWith("Password"))) {
          setFormError(body.message);
        }
      } else {
        setFormError(body.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "var(--border-width-hairline) solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "var(--space-6)",
      }}
    >
      {success && (
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
          Your password has been changed. You&rsquo;re still signed in on this
          device; any other devices have been signed out.
        </div>
      )}
      {formError && (
        <div
          role="alert"
          data-testid="form-error"
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-warning-subtle)",
            color: "var(--color-warning-text)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {formError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label htmlFor="currentPassword" style={labelStyle}>
            Current password
          </label>
          <input
            id="currentPassword"
            data-testid="current-password-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={Boolean(currentError)}
            style={{
              ...inputBase,
              border: `var(--border-width-hairline) solid ${
                currentError
                  ? "var(--color-danger)"
                  : "var(--color-text-muted)"
              }`,
            }}
          />
          {currentError && (
            <p data-testid="current-password-error" style={errorStyle}>
              {currentError}
            </p>
          )}
        </div>

        <div style={{ marginBottom: "var(--space-5)" }}>
          <label htmlFor="newPassword" style={labelStyle}>
            New password
          </label>
          <input
            id="newPassword"
            data-testid="new-password-input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={Boolean(newError)}
            aria-describedby="newPassword-help"
            style={{
              ...inputBase,
              border: `var(--border-width-hairline) solid ${
                newError ? "var(--color-danger)" : "var(--color-text-muted)"
              }`,
            }}
          />
          {newError ? (
            <p data-testid="new-password-error" style={errorStyle}>
              {newError}
            </p>
          ) : (
            <p id="newPassword-help" style={helpStyle}>
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
        </div>

        {/* row at ≥ sm, stacked below it (globals.css .form-actions) */}
        <div className="form-actions">
          <button
            type="submit"
            data-testid="submit"
            disabled={submitting}
            style={{
              flex: 1,
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
            {submitting ? "Changing…" : "Change password"}
          </button>
          <button
            type="button"
            data-testid="cancel"
            onClick={() => router.push("/settings/security")}
            style={{
              height: "var(--size-control-lg)",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "transparent",
              color: "var(--color-primary)",
              fontSize: "var(--font-size-body)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
