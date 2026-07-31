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
//
// FEAT-008 adds the pre-paint theme script (technical-design D3). It runs in
// `<head>`, synchronously, before the browser paints anything, because
// FR-PROF-004 says the theme is "applied on load" — resolving it after
// hydration would show every dark-theme user a white flash first. It is an
// inline <script> rather than next/script: `beforeInteractive` is for external
// `src` scripts and explicitly does not block hydration, which is precisely the
// guarantee this needs. It reads the `theme` cookie ThemeSync mirrors; the
// database row remains the truth and corrects the cookie on every shell render.
const THEME_BOOTSTRAP = `(function(){try{
var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);
var p=m?decodeURIComponent(m[1]):'system';
var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=d?'dark':'light';
}catch(e){}})()`;

export default function RootLayout({
  children,
  detail,
}: Readonly<{ children: React.ReactNode; detail: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` covers exactly one attribute: the `data-theme`
    // the script above writes before React hydrates. The mismatch is the
    // mechanism working, not a bug — React's documented escape hatch for a
    // deliberate server/client difference. It applies to this element only, so
    // a genuine mismatch anywhere else still warns.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full">
        <UndoHost>
          {children}
          {detail}
        </UndoHost>
      </body>
    </html>
  );
}
