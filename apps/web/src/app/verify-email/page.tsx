"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

// SCR-WEB-002 — Verify Email · Notice (ui-design.md), default/arrival state after
// a successful registration. The Resend control and its resend-sent / rate-limited
// states bind to POST /auth/verify/resend, owned by FEAT-002 — added there.
function Notice() {
  const email = useSearchParams().get("email") ?? "your email";
  return (
    <AuthShell>
      <div style={{ textAlign: "center" }}>
        <div
          aria-hidden
          style={{
            fontSize: "var(--font-size-display)",
            color: "var(--color-primary-bright)",
            marginBottom: "var(--space-2)",
          }}
        >
          ✉️
        </div>
        <h1
          style={{
            fontSize: "var(--font-size-h2)",
            lineHeight: "var(--font-line-height-h2)",
            color: "var(--color-text)",
            margin: `0 0 var(--space-3)`,
          }}
        >
          Check your email
        </h1>
        <p
          data-testid="notice-body"
          style={{
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--font-line-height-body)",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          We sent a verification link to{" "}
          <strong style={{ color: "var(--color-text)" }}>{email}</strong>. Click it
          to activate your account.
        </p>
        <p style={{ marginTop: "var(--space-5)", fontSize: "var(--font-size-small)" }}>
          <Link href="/signin" style={{ color: "var(--color-primary)" }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Notice />
    </Suspense>
  );
}
