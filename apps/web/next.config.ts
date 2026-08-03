import type { NextConfig } from "next";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // Standalone output for a lean Cloud Run container image (ADR-004).
  output: "standalone",
  // DEF-014: the E2E suite drives this app in dev mode, and the dev tools
  // indicator is a `<nextjs-portal>` fixed to the viewport's bottom-left —
  // where the shell's sign-out control lives. It hit-tests above the app, so
  // Playwright's actionability check refuses to click through it, and the
  // indicator mounts ~1s after paint, making that a race the fast machine wins
  // and CI loses. Off only when the harness asks (the flag is set in
  // e2e/playwright.config.ts); a developer running `npm run dev` keeps it.
  // Dev-only either way: `next build` output has no indicator to disable.
  devIndicators: process.env.NEXT_DISABLE_DEV_INDICATORS === "1" ? false : undefined,
  // Monorepo: resolve modules and trace files from the repo root, so the
  // hoisted workspace package @todo/shared (in the root node_modules) resolves.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
