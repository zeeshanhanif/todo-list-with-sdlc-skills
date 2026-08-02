import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ExportData } from "@/components/export-data";
import { requireSession } from "@/lib/session";

// SCR-WEB-016 — Export Data (ui-design.md). The second leaf under the Security
// & Account hub, built to the shape SCR-WEB-015 established: back link, h1,
// card — and no settings sub-nav, which belongs to the two settings SECTIONS
// rather than their leaves. Server-gated (an unresolved session redirects to
// /signin, FEAT-006 ui-design D4) around the island that consumes
// POST /api/account/export. All values are design tokens.
export const dynamic = "force-dynamic";

export default async function ExportDataPage() {
  await requireSession();

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
        Export your data
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-body)",
        }}
      >
        Download everything in your account as one JSON file. It&rsquo;s yours to
        keep, open, or move somewhere else.
      </p>

      <ExportData />
    </AppShell>
  );
}
