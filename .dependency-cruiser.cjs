// Module-boundary enforcement — the architecture's seams (ADR-001 modular
// monolith; ADR-002 separate deployables) made checkable by tooling rather than
// discipline. Run with `npm run boundaries`. A violation exits non-zero.
module.exports = {
  forbidden: [
    {
      name: "no-cross-app",
      comment:
        "Deployable units (apps/*) must not import each other's source — they talk over HTTP/queues, not module imports (ADR-002). Share via packages/*.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-cross-module",
      comment:
        "Inside the API modular monolith, capability modules must not reach into each other's internals (ADR-001). Cross-module use goes through explicit shared/domain interfaces, added per-slice.",
      severity: "error",
      from: { path: "^apps/api/src/modules/([^/]+)/" },
      to: {
        path: "^apps/api/src/modules/",
        pathNot: "^apps/api/src/modules/$1/",
      },
    },
    {
      name: "shared-stays-shared",
      comment:
        "packages/shared is a leaf — it must never depend on an app (that would invert the dependency direction and couple contracts to a deployable).",
      severity: "error",
      from: { path: "^packages/shared/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies are forbidden.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^(apps|packages)/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    exclude: {
      path: "(\\.spec\\.ts$|\\.test\\.ts$|\\.e2e-spec\\.ts$|/dist/|/\\.next/|/coverage/)",
    },
  },
};
