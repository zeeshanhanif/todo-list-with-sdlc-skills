import { expect, type Page } from "@playwright/test";

// Shared measurement for the project's contrast guards (DEF-005's
// `control-contrast.spec.ts` and DEF-006's `inline-alert-contrast.spec.ts`).
//
// Extracted and corrected by **DEF-012**. Two properties are the point of this
// module, and both were missing before it:
//
// 1. **The painted colour, not the declared one.** A background with alpha < 1
//    must be composited over whatever is behind it. The light theme's tints are
//    opaque hex, so reading `backgroundColor` directly happened to be right
//    there; the **dark** theme's tints are `rgba(…, 0.15)` over the surface, and
//    comparing text against that raw value computes a ratio no pixel on screen
//    ever had.
// 2. **One implementation, two guards.** The sweeps previously carried a
//    `contrastRatio` each. Two copies of a measurement is how two guards drift
//    into disagreeing about what they measure.
//
// Preserved from the originals, deliberately: ratios are **computed**, never
// compared against expected hex (a token change that keeps the rule stays
// green), and an empty sweep **fails** rather than passing vacuously.

/** A foreground/background pair to measure, with a human label for failures. */
export interface Pairing {
  what: string;
  fg: string;
  bg: string;
}

/** WCAG 2.1 contrast ratio between two `rgb(...)` / `rgba(...)` strings. */
export function contrastRatio(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = c.match(/[\d.]+/g);
    if (!m || m.length < 3) throw new Error(`unparseable colour: ${c}`);
    const [r, g, bl] = m
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/** Assert every pairing clears `min`, and that the sweep found something. */
export function assertAll(found: Pairing[], min: number, context: string): void {
  expect(
    found.length,
    `${context}: nothing matched — the sweep would pass vacuously`,
  ).toBeGreaterThan(0);
  for (const p of found) {
    const ratio = contrastRatio(p.fg, p.bg);
    expect(
      ratio,
      `${p.what}: ${p.fg} on ${p.bg} = ${ratio.toFixed(2)}:1 (design.md §5 requires ≥ ${min}:1)`,
    ).toBeGreaterThanOrEqual(min);
  }
}

/** Render the page in the given theme. `system` + emulated `prefers-color-scheme`
 * is how a signed-out visitor and a default-preference account both resolve it
 * (the pre-paint script in `app/layout.tsx`), so this drives the real path
 * rather than forcing an attribute the product would not have set itself. */
export async function useTheme(
  page: Page,
  theme: "light" | "dark",
): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

/** Confirm the page really is in the theme we asked for — otherwise a
 * "both themes" sweep can quietly measure the same theme twice, which is the
 * failure mode this whole defect is about. */
export async function assertTheme(
  page: Page,
  theme: "light" | "dark",
): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(theme);
}

/**
 * The alert's own text colour and every colour used *inside* it (links carry
 * their own), each against the alert's **painted** background.
 *
 * The nested-child case is not hypothetical: the sign-up alert puts links on the
 * tint, and a sweep reading only the container's `color` would have declared
 * that screen fixed while the links stayed at 3.95:1 (DEF-006).
 */
export async function alertPairings(
  page: Page,
  screen: string,
  testId = "form-error",
): Promise<Pairing[]> {
  return page.evaluate(
    ({ screenName, id }) => {
      const parse = (c: string): number[] => {
        const m = c.match(/[\d.]+/g);
        if (!m) return [255, 255, 255, 1];
        return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1].map(Number);
      };
      /** Composite this element's background over its ancestors' until opaque. */
      const painted = (node: Element | null): number[] => {
        while (node) {
          const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
          if (a === 1) return [r, g, b];
          if (a > 0) {
            const [br, bg, bb] = painted(node.parentElement);
            return [
              a * r + (1 - a) * br,
              a * g + (1 - a) * bg,
              a * b + (1 - a) * bb,
            ];
          }
          node = node.parentElement;
        }
        return [255, 255, 255];
      };

      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return [];
      const [r, g, b] = painted(el);
      const bg = `rgb(${r}, ${g}, ${b})`;
      const out = [
        {
          what: `${screenName} → alert text`,
          fg: getComputedStyle(el).color,
          bg,
        },
      ];
      for (const child of Array.from(el.querySelectorAll("*"))) {
        const rect = child.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        out.push({
          what: `${screenName} → <${child.tagName.toLowerCase()}> inside the alert`,
          fg: getComputedStyle(child).color,
          bg,
        });
      }
      return out;
    },
    { screenName: screen, id: testId },
  );
}

/**
 * Every visible `input`/`textarea`/`select` boundary against the colour actually
 * behind it — the control's own fill, or the composited paint of its nearest
 * ancestor when the fill is transparent, which is what the eye compares the
 * outline to (DEF-005).
 */
export async function controlBoundaries(
  page: Page,
  screen: string,
): Promise<Pairing[]> {
  return page.evaluate((screenName) => {
    const parse = (c: string): number[] => {
      const m = c.match(/[\d.]+/g);
      if (!m) return [255, 255, 255, 1];
      return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1].map(Number);
    };
    const painted = (node: Element | null): number[] => {
      while (node) {
        const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
        if (a === 1) return [r, g, b];
        if (a > 0) {
          const [br, bg, bb] = painted(node.parentElement);
          return [
            a * r + (1 - a) * br,
            a * g + (1 - a) * bg,
            a * b + (1 - a) * bb,
          ];
        }
        node = node.parentElement;
      }
      return [255, 255, 255];
    };

    const out: { what: string; fg: string; bg: string }[] = [];
    for (const el of Array.from(
      document.querySelectorAll("input, textarea, select"),
    )) {
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const [r, g, b] = painted(el);
      const testId = el.getAttribute("data-testid");
      const type = (el as HTMLInputElement).type;
      out.push({
        what: `${screenName} → <${el.tagName.toLowerCase()}${
          type ? ` type=${type}` : ""
        }${testId ? ` testid=${testId}` : ""}> boundary`,
        fg: s.borderTopColor,
        bg: `rgb(${r}, ${g}, ${b})`,
      });
    }
    return out;
  }, screen);
}
