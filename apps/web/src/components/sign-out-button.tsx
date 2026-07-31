"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearThemeCookie } from "@/components/theme-sync";

// SCR-WEB-007 sign-out control (ui-design.md). A sidebar-footer button-tertiary
// (ghost) that POSTs to the BFF /api/auth/logout and routes to /signin. Logout
// is idempotent server-side, so a network error still ends on /signin (there is
// no error state — technical-design/ui-design D2). Note: ui-design specs a
// Lucide LogOut icon (decorative); the web has no icon library wired and prior
// auth screens are text-only, so this is realized text-only to match the
// codebase (icon deferred to when Lucide lands). All values are design tokens.
export function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Idempotent: end on /signin regardless — the local session is abandoned.
    } finally {
      // The theme mirror belongs to the ACCOUNT, not the device (FEAT-008
      // technical-design D3): leaving it behind would dress the next person's
      // sign-in screen in this account's preference on a shared browser.
      clearThemeCookie();
      router.push("/signin");
    }
  }

  return (
    <button
      type="button"
      data-testid="sign-out"
      onClick={onSignOut}
      disabled={signingOut}
      style={{
        marginTop: "auto",
        alignSelf: "flex-start",
        background: "none",
        border: "none",
        padding: "var(--space-2) 0",
        color: "var(--color-text-muted)",
        fontSize: "var(--font-size-small)",
        cursor: signingOut ? "not-allowed" : "pointer",
        opacity: signingOut ? 0.6 : 1,
        minHeight: 44,
        textAlign: "left",
      }}
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
