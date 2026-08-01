import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// DEF-009's regression guard — the fourth member of the accessibility sweep
// family (control-contrast / touch-target / inline-alert-contrast).
//
// design.md §5 Focus: "every interactive element shows a visible **2px
// `--color-focus-ring` ring with 2px offset** on `:focus-visible`. Never remove
// outlines without a replacement." The token has existed in both themes since
// the first slice and **no CSS in `apps/web` ever set it** — every screen has
// relied on the browser's default indicator since FEAT-001. The default is
// visible, which is why this is a design-system conformance gap rather than an
// accessibility blocker, but "visible by accident" is not the same as "the ring
// the system specifies", and a future reset or component library could remove
// the default without anything noticing.
//
// Asserted on **keyboard** focus specifically: `:focus-visible` is the selector
// design.md names, and a mouse click on a button deliberately does not match it
// in Chromium. Tabbing is therefore not a convenience here — it is the only way
// to observe the state under test.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-focus-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** The focus-ring token's own value, read from the running page rather than
 * hard-coded, so a token change moves this assertion with it. */
async function focusRingColour(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-focus-ring)";
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
}

/**
 * Focus the element **as a keyboard user would**, then read the outline the
 * browser actually painted.
 *
 * The `Tab` press is not decoration. `:focus-visible` is a heuristic on input
 * MODALITY: Chromium matches it for a text input however focus arrived, but for
 * a `<button>` only when the browser believes the user is navigating by
 * keyboard. A bare programmatic `.focus()` therefore reports `outline: none` on
 * every button — which is the correct behaviour of the selector, not a missing
 * ring, and cost this spec one red run to establish. Pressing Tab first puts the
 * page in keyboard modality; focusing directly afterwards then matches, and the
 * test observes the state real keyboard users get.
 */
async function ringOn(
  page: Page,
  testId: string,
): Promise<{ width: string; style: string; colour: string; offset: string }> {
  await page.keyboard.press("Tab");
  await page.getByTestId(testId).first().focus();
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) throw new Error("nothing is focused");
    const s = getComputedStyle(el);
    return {
      width: s.outlineWidth,
      style: s.outlineStyle,
      colour: s.outlineColor,
      offset: s.outlineOffset,
    };
  });
}

async function assertRing(
  page: Page,
  testId: string,
  what: string,
  expected: string,
): Promise<void> {
  const ring = await ringOn(page, testId);
  expect(
    ring.style,
    `${what} (${testId}): outline-style is "${ring.style}" — design.md §5 requires a visible ring`,
  ).not.toBe("none");
  expect(
    parseFloat(ring.width),
    `${what} (${testId}): outline-width is ${ring.width}, design.md §5 requires 2px`,
  ).toBeCloseTo(2, 1);
  expect(
    ring.colour,
    `${what} (${testId}): outline-color is ${ring.colour}, design.md §5 requires --color-focus-ring (${expected})`,
  ).toBe(expected);
  expect(
    parseFloat(ring.offset),
    `${what} (${testId}): outline-offset is ${ring.offset}, design.md §5 requires 2px`,
  ).toBeCloseTo(2, 1);
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

test("DEF-009: signed-out screens show the specified focus ring", async ({
  page,
}) => {
  await page.goto("/signin");
  const expected = await focusRingColour(page);

  await assertRing(page, "email-input", "SCR-WEB-004 email field", expected);
  await assertRing(page, "password-input", "SCR-WEB-004 password field", expected);
  await assertRing(page, "submit", "SCR-WEB-004 submit button", expected);
});

test("DEF-009: the app shell and its controls show the specified focus ring", async ({
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
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  const expected = await focusRingColour(page);

  // The composer, the sidebar's icon button, and a task row's controls — one
  // from each of the shell's regions rather than a single lucky element.
  await assertRing(page, "quick-add-input", "SCR-WEB-008 quick-add", expected);
  await assertRing(page, "new-list", "SCR-WEB-007 new-list button", expected);

  await page.getByTestId("quick-add-input").fill("focus me");
  await page.getByTestId("quick-add-input").press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);

  await assertRing(page, "task-checkbox", "SCR-WEB-008 complete checkbox", expected);
  await assertRing(page, "task-row-link", "SCR-WEB-008 row link", expected);
});
