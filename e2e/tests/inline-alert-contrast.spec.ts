import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// DEF-006's regression guard — the third member of the project's accessibility
// sweep family, after DEF-005's `control-contrast.spec.ts` (control boundaries)
// and DEF-011's `touch-target.spec.ts` (target size).
//
// design.md §5: body text needs ≥ 4.5:1, and — stated by name because this
// exact pairing has now caused three defects — "never `--color-danger` on
// `--color-danger-subtle` (3.95:1); a tint takes its `*-text` partner (§2)".
// `--color-danger-text` measures 6.80:1 light / 8.31:1 dark and exists for this.
//
// DEF-003 fixed the pairing in one component and DEF-004 swept the chip/badge
// family, but neither swept the **inline alerts** — the error banner every auth
// screen shows. This sweep drives each screen to its real error state and
// measures what the browser actually painted, so it cannot be satisfied by a
// component that merely looks right in source.
//
// Measured as a computed RATIO rather than expected hex values, for the same
// reason as the sibling guards: the criterion is the ratio, so a token change
// that keeps the rule stays green while one that breaks it goes red.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";
const MIN_BODY = 4.5;

const uniqueEmail = () =>
  `e2e-alert-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** WCAG 2.1 contrast ratio between two `rgb(...)` strings. */
function contrastRatio(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = c.match(/\d+(\.\d+)?/g);
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

/**
 * The alert's own text colour and every colour used *inside* it (links carry
 * their own), each against the alert's painted background.
 *
 * The nested-link case is not hypothetical: the sign-up alert puts a "Sign in"
 * link on the tint, and a sweep that only read the container's `color` would
 * have declared that screen fixed while the link stayed at 3.95:1.
 */
async function alertPairings(
  page: Page,
  screen: string,
): Promise<{ what: string; fg: string; bg: string }[]> {
  return page.evaluate((screenName) => {
    const el = document.querySelector('[data-testid="form-error"]');
    if (!el) return [];
    const bg = getComputedStyle(el).backgroundColor;
    const out = [{ what: `${screenName} → alert text`, fg: getComputedStyle(el).color, bg }];
    for (const child of Array.from(el.querySelectorAll("*"))) {
      const s = getComputedStyle(child);
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({
        what: `${screenName} → <${child.tagName.toLowerCase()}> inside the alert`,
        fg: s.color,
        bg,
      });
    }
    return out;
  }, screen);
}

function assertAll(found: { what: string; fg: string; bg: string }[]): void {
  expect(
    found.length,
    "no alert found — the sweep would pass vacuously",
  ).toBeGreaterThan(0);
  for (const p of found) {
    const ratio = contrastRatio(p.fg, p.bg);
    expect(
      ratio,
      `${p.what}: ${p.fg} on ${p.bg} = ${ratio.toFixed(2)}:1 (design.md §5 requires ≥ ${MIN_BODY}:1)`,
    ).toBeGreaterThanOrEqual(MIN_BODY);
  }
}

async function markVerified(email: string): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("UPDATE users SET verified_at = now() WHERE email = $1", [
      email,
    ]);
  } finally {
    await client.end();
  }
}

test("DEF-006: the sign-up alert (and the link inside it) meet AA on the tint", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  expect(
    (await request.post(`${API}/auth/register`, { data: { email, password: PW } }))
      .status(),
  ).toBe(201);

  // Registering the same address again is the real path to this alert.
  await page.goto("/signup");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();

  await expect(page.getByTestId("form-error")).toBeVisible();
  assertAll(await alertPairings(page, "SCR-WEB-001 sign-up"));
});

test("DEF-006: the sign-in alert meets AA on the tint", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  expect(
    (await request.post(`${API}/auth/register`, { data: { email, password: PW } }))
      .status(),
  ).toBe(201);
  await markVerified(email);

  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill("wrong-password-entirely");
  await page.getByTestId("submit").click();

  await expect(page.getByTestId("form-error")).toBeVisible();
  assertAll(await alertPairings(page, "SCR-WEB-004 sign-in"));
});

test("DEF-006: the reset-password alert meets AA on the tint", async ({
  page,
}) => {
  // This screen's `form-error` is the unreachable-server branch — an invalid
  // token renders its own dedicated state instead (FEAT-005), so the honest way
  // to the alert is to make the request actually fail. Aborting the route is
  // deterministic and exercises the same rendered element a real outage would.
  await page.route("**/api/auth/forgot", (route) => route.abort());

  await page.goto("/reset-password");
  await page.getByTestId("email-input").fill("someone@example.com");
  await page.getByTestId("submit").click();

  await expect(page.getByTestId("form-error")).toBeVisible();
  assertAll(await alertPairings(page, "SCR-WEB-005 forgot-password"));
});
