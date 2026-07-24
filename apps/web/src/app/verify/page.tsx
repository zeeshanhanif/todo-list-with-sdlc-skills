"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { type ApiError } from "@todo/shared";
import { AuthShell } from "@/components/auth-shell";
import { ResendVerification } from "@/components/resend-verification";

// SCR-WEB-003 — Verify Email · Result (ui-design.md). Target of the email link
// (${PUBLIC_APP_URL}/verify?token=…). Reads the token, POSTs it to
// /api/auth/verify on mount (verifying state), and renders success / expired /
// invalid from the response (FEAT-002; FR-AUTH-006, UC-002). The API is POST
// (not a GET link), which is what protects the single-use token (technical-design
// D1); the client-side auto-POST realizes the verifying-on-load spec in
// ui-design.md. All values are design tokens.
type State = "verifying" | "success" | "expired" | "invalid";

function heading(fontSize: string) {
  return {
    fontSize: `var(--font-size-${fontSize})`,
    lineHeight: `var(--font-line-height-${fontSize})`,
    color: "var(--color-text)",
    margin: "0 0 var(--space-3)",
  };
}

function Result() {
  const token = useSearchParams().get("token");
  // No token → invalid immediately (set as initial state, not in the effect).
  const [state, setState] = useState<State>(token ? "verifying" : "invalid");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // guard React strict-mode double-invoke
    started.current = true;

    const run = async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.status === 200) {
          setState("success");
          return;
        }
        const body = (await res.json()) as ApiError;
        setState(body.code === "token_expired" ? "expired" : "invalid");
      } catch {
        setState("invalid");
      }
    };
    void run();
  }, [token]);

  if (state === "verifying") {
    return (
      <AuthShell>
        <div style={{ textAlign: "center" }} data-testid="verify-verifying">
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              margin: "0 auto var(--space-3)",
              border:
                "3px solid var(--color-border-strong)",
              borderTopColor: "var(--color-primary)",
              borderRadius: "var(--radius-full)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            Verifying your email…
          </p>
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </div>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell>
        <div style={{ textAlign: "center" }} data-testid="verify-success">
          <div
            aria-hidden
            style={{
              fontSize: "var(--font-size-display)",
              color: "var(--color-success)",
              marginBottom: "var(--space-2)",
            }}
          >
            ✅
          </div>
          <h1 style={heading("h2")}>Email verified</h1>
          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--font-line-height-body)",
              color: "var(--color-text-muted)",
              margin: "0 0 var(--space-5)",
            }}
          >
            Your account is active. You can sign in now.
          </p>
          <Link
            href="/signin"
            data-testid="verify-signin"
            style={{
              display: "block",
              width: "100%",
              height: "var(--size-control-lg)",
              lineHeight: "var(--size-control-lg)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)" as unknown as number,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  // expired | invalid — both offer the email recovery form + a sign-in link.
  const expired = state === "expired";
  return (
    <AuthShell>
      <div style={{ textAlign: "center" }} data-testid={`verify-${state}`}>
        <div
          aria-hidden
          style={{
            fontSize: "var(--font-size-display)",
            color: "var(--color-warning)",
            marginBottom: "var(--space-2)",
          }}
        >
          ⚠️
        </div>
        <h1 style={heading("h2")}>
          {expired ? "This link has expired" : "This link didn't work"}
        </h1>
        <p
          style={{
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--font-line-height-body)",
            color: "var(--color-text-muted)",
            margin: "0 0 var(--space-4)",
          }}
        >
          {expired
            ? "Verification links are good for 24 hours. Enter your email and we'll send a fresh one."
            : "It may have already been used or replaced by a newer email. Enter your email to get a new link — or just sign in if you're already verified."}
        </p>
        <ResendVerification />
        <p
          style={{
            marginTop: "var(--space-5)",
            fontSize: "var(--font-size-small)",
          }}
        >
          <Link href="/signin" style={{ color: "var(--color-primary)" }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <Result />
    </Suspense>
  );
}
