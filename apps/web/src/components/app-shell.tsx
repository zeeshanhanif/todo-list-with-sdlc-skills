import type { ReactNode } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

// SCR-WEB-007 app-shell frame (design.md §3): persistent left sidebar +
// centered content column. Extracted from app/page.tsx by FEAT-006 so the
// authenticated settings screens (SCR-WEB-014/015) render in the same frame and
// the sidebar's Settings nav item is declared once (FEAT-006 ui-design D2).
// Nav items are text-only: design.md specs Lucide icons but no icon library is
// wired yet — the same carried deviation the sign-out control records.
// All colors/spacing come from token CSS variables.

/** Sidebar nav items the shell knows about. Smart views and lists are placeholders
 * until FEAT-009/FEAT-016 make them real; `settings` is live as of FEAT-006. */
export type ShellNav = "none" | "settings";

export function AppShell({
  children,
  active = "none",
}: {
  children: ReactNode;
  active?: ShellNav;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: "var(--size-sidebar-width)",
          background: "var(--color-surface)",
          borderRight: "var(--border-width-hairline) solid var(--color-border)",
          padding: "var(--space-6)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            color: "var(--color-primary)",
            fontWeight: "var(--font-weight-semibold)" as unknown as number,
            fontSize: "var(--font-size-body-lg)",
          }}
        >
          To-Do
        </div>
        <nav
          style={{
            marginTop: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            color: "var(--color-text-muted)",
          }}
        >
          <span>Today</span>
          <span>Upcoming</span>
          <span>Overdue</span>
          <span>Inbox</span>
        </nav>

        <div style={{ marginTop: "var(--space-6)" }}>
          <SidebarNavItem
            href="/settings/security"
            label="Settings"
            selected={active === "settings"}
          />
        </div>

        <SignOutButton />
      </aside>

      <main style={{ flex: 1, padding: "var(--space-8)" }}>
        <div style={{ maxWidth: "var(--size-content-max)", margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** design.md §4 `sidebar-nav-item`: selected uses --color-primary-subtle bg +
 * --color-primary text + a left accent bar. 44px min target (§5). */
function SidebarNavItem({
  href,
  label,
  selected,
}: {
  href: string;
  label: string;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid="nav-settings"
      aria-current={selected ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 44,
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-md)",
        borderLeft: selected
          ? "var(--border-width-thick) solid var(--color-primary)"
          : "var(--border-width-thick) solid transparent",
        background: selected ? "var(--color-primary-subtle)" : "transparent",
        color: selected ? "var(--color-primary)" : "var(--color-text-muted)",
        fontSize: "var(--font-size-body)",
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}
