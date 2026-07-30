import type { ReactNode } from "react";
import { fetchLists } from "@/lib/lists";
import { fetchProfile } from "@/lib/profile";
import { ShellFrame, type ShellNav } from "@/components/shell-frame";

// SCR-WEB-007 app shell — the server half: it resolves the caller's lists and
// their profile, then hands both to the interactive frame.
// FEAT-009 made the sidebar the product's primary navigation; FEAT-010 made its
// rows navigational, so the open list is passed down for the selected state.
// FEAT-008 makes the shell the PREFERENCES HOST (technical-design §5.2): the
// profile is fetched in the SAME Promise.all as the lists, so the timezone and
// theme cost one parallel primary-key read rather than a second round-trip of
// latency (D7) — and both arrive before the first paint.
export type { ShellNav };

export async function AppShell({
  children,
  active = "none",
  activeListId,
}: {
  children: ReactNode;
  active?: ShellNav;
  /** The list currently open, for the `sidebar-nav-item` selected state. */
  activeListId?: string;
}) {
  const [lists, profile] = await Promise.all([fetchLists(), fetchProfile()]);
  return (
    <ShellFrame
      active={active}
      lists={lists}
      activeListId={activeListId}
      profile={profile}
    >
      {children}
    </ShellFrame>
  );
}
