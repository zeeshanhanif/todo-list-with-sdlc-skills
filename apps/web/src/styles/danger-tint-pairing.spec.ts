import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// DEF-006's second guard, and the one that would have prevented DEF-003,
// DEF-004 and DEF-006 alike: a source sweep for the single pairing design.md §5
// forbids by name — `--color-danger` text on a `--color-danger-subtle` fill,
// which measures **3.95:1** against the 4.5:1 body-text rule. The tint's partner
// `--color-danger-text` (6.80:1 light / 8.31:1 dark) exists for exactly this.
//
// Why a source sweep when `e2e/tests/inline-alert-contrast.spec.ts` already
// measures the RENDERED ratio: the rendered sweep is the stronger check and is
// the one that catches a token regression, but it can only reach states a
// browser can be driven into. Two of DEF-006's five sites — the sidebar's
// "couldn't load your lists" alert and the list dialog's form error — need the
// API to fail mid-session, which no honest E2E path produces. Those are exactly
// the sites that stayed broken through two previous fixes, so they get a check
// that does not depend on reachability.
//
// This asserts a **token pairing**, not a colour value: if design.md's rule ever
// changes, this test is supposed to be updated with it.
const SRC = path.join(__dirname, "..");
const TINT = "--color-danger-subtle";
/** `--color-danger` NOT followed by `-text` / `-hover` / `-subtle`. */
const WRONG_INK = /var\(--color-danger\)/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return /\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Every style object in the file that paints the danger tint, paired with the
 * ink used inside that same object.
 *
 * Scoped to the enclosing object literal rather than "the next few lines" so a
 * reformat cannot silently narrow the check: it walks braces from the `style={{`
 * that contains the tint to its matching close.
 */
function tintedBlocks(source: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const hit = source.indexOf(TINT, from);
    if (hit === -1) break;
    from = hit + TINT.length;

    // Walk back to the opening `{` of the enclosing object literal.
    let depth = 0;
    let start = hit;
    while (start > 0) {
      const ch = source[start];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) break;
        depth--;
      }
      start--;
    }
    // ...and forward to its matching close.
    let end = start + 1;
    depth = 0;
    while (end < source.length) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") {
        if (depth === 0) break;
        depth--;
      }
      end++;
    }
    blocks.push(source.slice(start, end + 1));
  }
  return blocks;
}

describe("design.md §5 — the danger tint takes its partner ink (DEF-006)", () => {
  const files = tsxFiles(SRC);

  it("finds the web tier's source to sweep", () => {
    // Without this the suite could pass by reading nothing at all.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.includes("lists-nav"))).toBe(true);
  });

  it("no element pairs --color-danger-subtle with --color-danger", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const block of tintedBlocks(readFileSync(file, "utf8"))) {
        // Comments name the forbidden pairing all over this codebase precisely
        // because it keeps recurring; strip them before judging the code.
        const code = block
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (WRONG_INK.test(code)) {
          offenders.push(
            `${path.relative(SRC, file)} paints --color-danger on --color-danger-subtle (3.95:1) — use --color-danger-text`,
          );
        }
      }
    }
    // The offending paths ARE the message: jest's expect takes no second
    // argument, so the diff has to carry the diagnosis.
    expect(offenders).toEqual([]);
  });
});
