import type { Config } from "jest";
import nextJest from "next/jest.js";

// Web-tier unit test runner — the engineering-foundations item FEAT-012, FEAT-013
// and FEAT-019 each recorded as missing (the api and worker have had Jest since
// the skeleton; only the web tier lacked one, so every client-side assertion had
// to be paid for at Playwright prices).
//
// `next/jest` is Next's own transformer: it wires the Next compiler for TS/JSX,
// mocks stylesheets/images/next-font, loads .env, and resolves the tsconfig
// `@/*` path alias — so this config carries only what is genuinely ours.
// Per Next's testing guide: async Server Components are NOT unit-testable here
// (E2E covers those); synchronous components, client islands and pure modules are.
const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Specs live beside the code they test (`src/**/*.spec.ts[x]`), matching the
  // api and worker convention rather than a separate __tests__ tree.
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/src/**/*.spec.tsx"],
  // A previous `next build --output standalone` leaves a copy of package.json
  // under .next/, which Jest's haste map reports as a duplicate module name.
  // next/jest already ignores .next for test *resolution*; this ignores it for
  // module mapping too, so a stale build directory never noises up a run.
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
};

export default createJestConfig(config);
