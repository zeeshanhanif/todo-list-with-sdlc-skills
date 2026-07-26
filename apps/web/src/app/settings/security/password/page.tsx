import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ChangePasswordForm } from "@/components/change-password-form";
import { requireSession } from "@/lib/session";

// SCR-WEB-015 — Change Password (ui-design.md). Server-gated shell (an
// unresolved session redirects to /signin, ui-design D4) around the form island
// that consumes POST /api/auth/change-password. All values are design tokens.
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  await requireSession();

  return (
    <AppShell active="settings">
      <Link
        href="/settings/security"
        style={{
          display: "inline-block",
          marginBottom: "var(--space-4)",
          color: "var(--color-primary)",
          fontSize: "var(--font-size-small)",
          textDecoration: "none",
        }}
      >
        ← Security &amp; account
      </Link>
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          lineHeight: "var(--font-line-height-h1)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-6)",
        }}
      >
        Change password
      </h1>
      <ChangePasswordForm />
    </AppShell>
  );
}
