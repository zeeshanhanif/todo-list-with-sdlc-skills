"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ListSummary, UserProfile } from "@todo/shared";
import { SignOutButton } from "@/components/sign-out-button";
import { ListsNav } from "@/components/lists-nav";
import { SyncProvider } from "@/components/sync-provider";
import { PreferencesProvider } from "@/components/preferences-provider";

// SCR-WEB-007 app-shell frame (design.md §3; FEAT-009 ui-design D3). Persistent
// 280px sidebar ≥ md; below md a hamburger opens the sidebar as a full drawer over
// a scrim, with the main column full-width — the responsive behavior design.md
// specified and FEAT-006 §8 recorded as unbuilt. Client component because the
// drawer and the list affordances are interactive; the lists themselves are
// fetched server-side by app-shell.tsx and passed in.
// Nav items are text-only: design.md specs Lucide icons but no icon library is
// wired yet — the same carried deviation the sign-out control records.
// All colors/spacing come from token CSS variables.

/** Sidebar nav items the shell knows about. Smart views are placeholders until
 * FEAT-016 makes them real; `settings` is live as of FEAT-006. */
export type ShellNav = "none" | "settings";

export function ShellFrame({
  children,
  active = "none",
  lists,
  activeListId,
  profile,
}: {
  children: ReactNode;
  active?: ShellNav;
  /** The caller's lists, or null when the fetch failed (sidebar error state). */
  lists: ListSummary[] | null;
  /** The list currently open, for the selected state (FEAT-010). */
  activeListId?: string;
  /** The caller's preferences, or null when the fetch failed (FEAT-008). */
  profile?: UserProfile | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);

  // Esc closes the drawer and returns focus to its trigger (design.md §5).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    // The preference host (FEAT-008 technical-design §5.2): everything inside the
    // authenticated shell reads the caller's timezone and theme from here, and a
    // saved change re-renders every consumer at once (ui-design D9).
    <PreferencesProvider profile={profile ?? null}>
      <div className="shell" data-drawer={drawerOpen ? "open" : "closed"}>
        {/* Cross-device sync (FEAT-019). Renders nothing — it only decides when
          to refetch. Mounted HERE rather than in the root layout because the
          shell is the authenticated zone: no token is minted and no socket is
          opened on /signin, /signup, /verify or /reset-password (AC-10), and
          signing out unmounts it. */}
        <SyncProvider />
        <div className="shell-topbar">
          <button
            type="button"
            ref={hamburgerRef}
            data-testid="drawer-toggle"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            style={{
              minWidth: "var(--size-touch-target)",
              minHeight: "var(--size-touch-target)",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "transparent",
              color: "var(--color-text)",
              fontSize: "var(--font-size-body-lg)",
              cursor: "pointer",
            }}
          >
            ☰
          </button>
          <span
            style={{
              color: "var(--color-primary)",
              fontWeight: "var(--font-weight-semibold)" as unknown as number,
              fontSize: "var(--font-size-body-lg)",
            }}
          >
            To-Do
          </span>
        </div>

        <div
          className="shell-scrim"
          data-testid="drawer-scrim"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />

        <aside
          className="shell-sidebar"
          ref={drawerRef}
          tabIndex={-1}
          aria-label="Main navigation"
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
            aria-label="Smart views"
          >
            <span>Today</span>
            <span>Upcoming</span>
            <span>Overdue</span>
          </nav>

          <ListsNav
            lists={lists}
            activeListId={activeListId}
            onNavigate={() => setDrawerOpen(false)}
          />

          <div style={{ marginTop: "var(--space-6)" }}>
            <SidebarNavItem
              href="/settings/security"
              label="Settings"
              selected={active === "settings"}
              onClick={() => setDrawerOpen(false)}
            />
          </div>

          <SignOutButton />
        </aside>

        <main className="shell-main">
          <div
            style={{ maxWidth: "var(--size-content-max)", margin: "0 auto" }}
          >
            {children}
          </div>
        </main>
      </div>
    </PreferencesProvider>
  );
}

/** design.md §4 `sidebar-nav-item`: selected uses --color-primary-subtle bg +
 * --color-primary text + a left accent bar. 44px min target (§5). */
function SidebarNavItem({
  href,
  label,
  selected,
  onClick,
}: {
  href: string;
  label: string;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      data-testid="nav-settings"
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
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
