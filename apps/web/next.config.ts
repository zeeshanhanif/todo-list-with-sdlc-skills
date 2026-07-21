import type { NextConfig } from "next";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // Standalone output for a lean Cloud Run container image (ADR-004).
  output: "standalone",
  // Monorepo: resolve modules and trace files from the repo root, so the
  // hoisted workspace package @todo/shared (in the root node_modules) resolves.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
