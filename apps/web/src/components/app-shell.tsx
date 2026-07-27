import type { ReactNode } from "react";
import { fetchLists } from "@/lib/lists";
import { ShellFrame, type ShellNav } from "@/components/shell-frame";

// SCR-WEB-007 app shell — the server half: it resolves the caller's lists so the
// sidebar arrives with the first paint (no loading flash), then hands them to the
// interactive frame. FEAT-009 made the sidebar the product's primary navigation;
// the frame itself (drawer, nav items, sign-out) lives in shell-frame.tsx.
export type { ShellNav };

export async function AppShell({
  children,
  active = "none",
}: {
  children: ReactNode;
  active?: ShellNav;
}) {
  const lists = await fetchLists();
  return (
    <ShellFrame active={active} lists={lists}>
      {children}
    </ShellFrame>
  );
}
