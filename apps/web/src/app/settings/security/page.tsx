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
        <HubRow
          href="/settings/security/delete"
          label="Delete account"
          help="Permanently delete your account and everything in it."
          divider
          destructive
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
  destructive = false,
}: {
  href: string;
  label: string;
  help: string;
  /** Draws the base spec's 1px rule BETWEEN rows. A top rule rather than a
   * bottom one so it is set by each row after the first — the card never grows
   * a trailing rule as FEAT-018 appends its own. */
  divider?: boolean;
  /** Marks the row as the destructive one (FEAT-018 ui-design D6) — by an icon
   * in `--color-danger`, NOT a red label: the row's own hover background is
   * `--color-surface-sunken`, where `--color-danger` text measures 4.41:1,
   * under design.md §5's 4.5:1. An icon is a UI graphic at ≥ 3:1 and clears
   * every state in both themes. Colour never carries it alone (§7) — the label
   * and help copy say "delete" and "permanently". */
  destructive?: boolean;
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
        {destructive && <TrashGlyph />}
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

/** The destructive row's mark (FEAT-018 ui-design D6). `aria-hidden` because
 * the label already says "Delete account" — it pairs with the text rather than
 * carrying meaning alone (design.md §7). Inline rather than from an icon
 * package: this app has no icon dependency, and adding one for a single mark
 * would be a bigger change than the feature. */
function TrashGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-danger)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      // `inline-block` explicitly: Tailwind's preflight sets `svg { display:
      // block }`, which would drop the mark onto its own line above the label.
      style={{
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: "var(--space-2)",
      }}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
