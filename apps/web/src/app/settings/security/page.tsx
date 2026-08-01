import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SettingsNav } from "@/components/settings-nav";
import { requireSession } from "@/lib/session";

// SCR-WEB-014 — Settings › Security & Account (ui-design.md). The hub for the
// account-security actions: change password now, export (FEAT-017) and delete
// account (FEAT-018) later. Pure navigation — consumes no endpoint; an
// unresolved session redirects to /signin server-side (ui-design D4). Rows are
// real links (keyboard navigable). All values are design tokens.
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const user = await requireSession();

  return (
    <AppShell active="settings">
      {/* FEAT-008 extension: the settings sub-nav. Required, not cosmetic — the
          sidebar's Settings item now targets /settings/profile, so this is how
          the two sibling screens reach each other (FEAT-008 ui-design D3). */}
      <SettingsNav active="security" />
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          lineHeight: "var(--font-line-height-h1)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Security &amp; account
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-body)",
        }}
      >
        Signed in as {user.email}
      </p>

      <section
        data-testid="security-hub"
        style={{
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        {/* Rows run least- to most-consequential, so FEAT-018's irreversible
            "Delete account" lands last rather than beside a routine action
            (FEAT-017 ui-design). */}
        <HubRow
          href="/settings/security/password"
          label="Change password"
          help="Update your password. Other devices will be signed out."
        />
        <HubRow
          href="/settings/security/export"
          label="Export data"
          help="Download your lists and tasks as a JSON file."
          divider
        />
      </section>
    </AppShell>
  );
}

/** design.md §4 generic `list-row`: label over one line of help, full row is the
 * target, 44px minimum height (§5). */
function HubRow({
  href,
  label,
  help,
  divider = false,
}: {
  href: string;
  label: string;
  help: string;
  /** Draws the base spec's 1px rule BETWEEN rows. A top rule rather than a
   * bottom one so it is set by each row after the first — the card never grows
   * a trailing rule as FEAT-018 appends its own. */
  divider?: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid={`row-${href.split("/").pop()!}`}
      style={{
        display: "block",
        minHeight: 44,
        padding: "var(--space-4) var(--space-5)",
        textDecoration: "none",
        ...(divider
          ? {
              borderTop:
                "var(--border-width-hairline) solid var(--color-border)",
            }
          : {}),
      }}
    >
      <span
        style={{
          display: "block",
          color: "var(--color-text)",
          fontSize: "var(--font-size-body)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "block",
          marginTop: "var(--space-1)",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-small)",
        }}
      >
        {help}
      </span>
    </Link>
  );
}
