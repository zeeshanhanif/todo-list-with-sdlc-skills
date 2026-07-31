import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// The shell around SCR-WEB-009, as a LAYOUT rather than part of the page
// (FEAT-016 ui-design). This is what makes the screen's `loading` state work as
// specified: `loading.tsx` is nested inside the layout and wraps only the page,
// so the sidebar and the shell stay on screen while the tasks stream in. With
// the shell inside the page — the shape every earlier screen uses, none of
// which has a loading fallback — the skeleton would blank the whole frame.
export default function SmartViewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
