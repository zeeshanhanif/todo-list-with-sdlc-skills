import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DeleteAccount } from "@/components/delete-account";
import { requireSession } from "@/lib/session";

// SCR-WEB-017 — Delete Account (ui-design.md). The third and last leaf under the
// Security & Account hub, built to the shape SCR-WEB-015/016 established: back
// link, h1, card — and no settings sub-nav, which belongs to the two settings
// SECTIONS rather than their leaves. Server-gated (an unresolved session
// redirects to /signin, FEAT-006 ui-design D4) around the island that consumes
// POST /api/account/delete.
//
// The email is resolved HERE and passed down: after the deletion succeeds there
// is no session left to read it from, and the confirmation names the address it
// just released (ui-design SCR-WEB-017 confirmed). All values are design tokens.
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const user = await requireSession();

  return (
    <AppShell active="settings">
      <Link
        href="/settings/security"
        data-testid="back-to-security"
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
          margin: "0 0 var(--space-2)",
        }}
      >
        Delete your account
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-body)",
        }}
      >
        This removes your account and everything in it, for good. Read what
        follows before you confirm.
      </p>

      <DeleteAccount email={user.email} />
    </AppShell>
  );
}
