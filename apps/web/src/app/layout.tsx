import type { Metadata } from "next";
import "./globals.css";
import { UndoHost } from "@/components/undo-snackbar";

// Fonts come from the token stack (Inter + system fallbacks, docs/tokens.json)
// rather than next/font/google, so the build has no network font dependency.
export const metadata: Metadata = {
  title: "To-Do — Walking Skeleton",
  description: "Private multi-user personal task manager (skeleton).",
};

// `detail` is the shell's DETAIL HOST slot (SCR-WEB-007's FEAT-011 extension) —
// a parallel route that the intercepting route app/@detail/(.)tasks/[id] fills
// when a task is opened from a list row. Empty the rest of the time:
// @detail/default.tsx renders null, so the host costs no layout when unused.
//
// `UndoHost` wraps BOTH slots, and that is the whole reason FEAT-013 touches
// this file (technical-design D6): `children` and `detail` are siblings, so a
// snackbar hosted inside the shell would be invisible to the detail panel that
// triggers the deletion, and one hosted inside the panel would die when the
// panel closes. It sits inside <body> rather than around <html> — as deep as
// the requirement allows, per Next's own guidance on provider placement.
export default function RootLayout({
  children,
  detail,
}: Readonly<{ children: React.ReactNode; detail: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <UndoHost>
          {children}
          {detail}
        </UndoHost>
      </body>
    </html>
  );
}
