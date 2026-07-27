import type { ReactNode } from "react";
import { fetchLists } from "@/lib/lists";
import { ShellFrame, type ShellNav } from "@/components/shell-frame";

// SCR-WEB-007 app shell — the server half: it resolves the caller's lists so the
// sidebar arrives with the first paint, then hands them to the interactive frame.
// FEAT-009 made the sidebar the product's primary navigation; FEAT-010 made its
// rows navigational, so the open list is passed down for the selected state.
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
  const lists = await fetchLists();
  return (
    <ShellFrame active={active} lists={lists} activeListId={activeListId}>
      {children}
    </ShellFrame>
  );
}
