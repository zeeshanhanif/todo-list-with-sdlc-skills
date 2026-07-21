import type { Metadata } from "next";
import "./globals.css";

// Fonts come from the token stack (Inter + system fallbacks, docs/tokens.json)
// rather than next/font/google, so the build has no network font dependency.
export const metadata: Metadata = {
  title: "To-Do — Walking Skeleton",
  description: "Private multi-user personal task manager (skeleton).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
