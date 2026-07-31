import Link from "next/link";

// The settings sub-nav (FEAT-008 ui-design D3). Required rather than cosmetic:
// FEAT-008 moves the sidebar's "Settings" target to /settings/profile, so
// without this Security & Account would have no route into it.
//
// Semantic <nav><ul><li><a> styled with design.md §4's `tabs` treatment — NOT
// shadcn Tabs, whose semantics announce same-page panels that do not exist here
// (these are routes). Real links means Tab-and-Enter, not the arrow-key roving a
// true tablist would owe. All values are design tokens.
const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security & account" },
] as const;

export function SettingsNav({ active }: { active: "profile" | "security" }) {
  return (
    <nav aria-label="Settings sections" style={{ marginBottom: "var(--space-6)" }}>
      <ul
        style={{
          display: "flex",
          gap: "var(--space-5)",
          listStyle: "none",
          margin: 0,
          padding: 0,
          borderBottom:
            "var(--border-width-hairline) solid var(--color-border)",
        }}
      >
        {TABS.map((tab) => {
          const selected = tab.href.endsWith(active);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                data-testid={`settings-tab-${selected ? "active" : "inactive"}`}
                aria-current={selected ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 44,
                  padding: "0 var(--space-1)",
                  // The selected tab is identified by BOTH weight and rule, not
                  // colour alone (design.md §5).
                  borderBottom: selected
                    ? "var(--border-width-thick) solid var(--color-primary)"
                    : "var(--border-width-thick) solid transparent",
                  color: selected
                    ? "var(--color-text)"
                    : "var(--color-text-muted)",
                  fontSize: "var(--font-size-body)",
                  textDecoration: "none",
                }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
