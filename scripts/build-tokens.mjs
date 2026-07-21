// Transform the DTCG design tokens (docs/tokens.json) into CSS custom properties
// consumed by the web shell. This is the design-system *wiring*: the shell reads
// var(--color-*) etc., so if docs/tokens.json is deleted this build fails and the
// shell visibly breaks (that is the intended coupling — see docs/ux-foundations.md
// and .claude/skills project-scaffolding verification §5).
//
// Light values are the default (:root); the `colorDark`/`priorityDark` groups
// re-value the same roles under [data-theme="dark"].

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(here, "../docs/tokens.json");
const OUT = resolve(here, "../apps/web/src/styles/tokens.generated.css");

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function formatValue(type, value) {
  if (Array.isArray(value)) {
    // fontFamily -> comma list; cubicBezier -> cubic-bezier()
    if (type === "cubicBezier") return `cubic-bezier(${value.join(", ")})`;
    return value.join(", ");
  }
  if (value && typeof value === "object") {
    // shadow token
    const { offsetX, offsetY, blur, spread, color } = value;
    return `${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
  }
  return String(value);
}

// Walk a DTCG subtree, emitting `--<prefix>-<path>: <value>;` for every leaf
// (a node carrying $value). $type is inherited from the nearest ancestor.
function collect(node, path, inheritedType, out, prefixOverride) {
  const type = node.$type ?? inheritedType;
  if (Object.prototype.hasOwnProperty.call(node, "$value")) {
    const name = (prefixOverride ? [prefixOverride, ...path.slice(1)] : path)
      .map(kebab)
      .join("-");
    out.push(`  --${name}: ${formatValue(type, node.$value)};`);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (child && typeof child === "object") {
      collect(child, [...path, key], type, out, prefixOverride);
    }
  }
}

const tokens = JSON.parse(readFileSync(TOKENS, "utf8"));

// Light / theme-agnostic groups -> :root
const rootGroups = [
  "color",
  "priority",
  "font",
  "space",
  "radius",
  "borderWidth",
  "shadow",
  "motion",
  "size",
];
const rootLines = [];
for (const g of rootGroups) {
  if (tokens[g]) collect(tokens[g], [g], tokens[g].$type, rootLines);
}

// Dark re-valuations -> [data-theme="dark"] / .dark, remapped onto the light names
const darkLines = [];
if (tokens.colorDark) collect(tokens.colorDark, ["colorDark"], tokens.colorDark.$type, darkLines, "color");
if (tokens.priorityDark) collect(tokens.priorityDark, ["priorityDark"], tokens.priorityDark.$type, darkLines, "priority");

const css = `/* AUTO-GENERATED from docs/tokens.json by scripts/build-tokens.mjs — do not edit by hand. */
:root {
${rootLines.join("\n")}
}

:root[data-theme="dark"],
.dark {
${darkLines.join("\n")}
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, css, "utf8");
console.log(`build-tokens: wrote ${rootLines.length} root + ${darkLines.length} dark custom properties -> ${OUT}`);
