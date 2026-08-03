import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// DEF-014's regression guard — the suite drives the web tier in **dev mode**
// (`npm run dev -w @todo/web`, playwright.config.ts webServer), and Next's dev
// tooling renders a `<nextjs-portal>` overlay that is fixed to the viewport's
// **bottom-left corner** — the exact corner the app shell puts its sign-out
// control in (`sign-out-button.tsx`: `marginTop: auto` in the sidebar footer).
//
// The overlay is dev-only: it does not exist in `next build` output, so no user
// ever meets it. But it hit-tests above the app, so Playwright's actionability
// check refuses to click anything under it — and the suite's verdicts stop
// being about the product.
//
// The failure this guards against is a **race, not a constant**: the indicator
// mounts asynchronously, roughly a second after the shell paints. A test whose
// click lands before that wins; one that lands after it times out. That is why
// UC-007 passed on a warm developer machine (whole test: 1.6s) and failed in CI
// (same click, ~20s into the test) — the same code, decided by machine speed.
//
// So this guard asserts the property the suite actually depends on: **after the
// overlay has had time to mount, every shell control is still the topmost thing
// at its own click point.** It settles deliberately past the mount window
// rather than racing it — a guard that can win the race is not a guard.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

/** Comfortably past the observed ~1s mount, so a green run means "not covered",
 * never "measured too early". */
const SETTLE_MS = 4000;

const uniqueEmail = () =>
  `e2e-overlay-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

/**
 * Assert that the control at `testId` owns its own click point — i.e. that
 * `elementFromPoint` at the centre Playwright would click resolves to that
 * control or something inside it, not to an overlay sitting on top.
 *
 * Reported with the intercepting element's tag name, so a red run names what
 * covered the control instead of only saying that something did.
 */
async function assertNothingIntercepts(
  page: Page,
  testId: string,
): Promise<void> {
  const target = page.getByTestId(testId).first();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${testId} should have a rendered box`).not.toBeNull();

  const hit = await page.evaluate(
    ([x, y, id]) => {
      const top = document.elementFromPoint(x as number, y as number);
      if (!top) return { tag: "none", owned: false };
      const owner = top.closest(`[data-testid="${id as string}"]`);
      return { tag: top.tagName.toLowerCase(), owned: owner !== null };
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2, testId] as const,
  );

  expect(
    hit.owned,
    `[${testId}] is covered at its click point by <${hit.tag}> — a dev-only ` +
      `overlay must never hit-test above the app's own controls`,
  ).toBe(true);
}

test("DEF-014: no dev-only overlay covers the app shell's controls", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, { data: { email, password: PW } });
  await markVerified(email);
  await signIn(page, email);

  // Let the dev tooling mount whatever it is going to mount. The product is
  // idle by now; anything that appears in this window is the harness's.
  await page.waitForTimeout(SETTLE_MS);

  // The sidebar footer is the corner at issue (sign-out), but the rule is not
  // "sign-out specifically" — it is that the shell's controls are clickable, so
  // the sweep covers the persistent chrome a signed-in user always has.
  for (const testId of ["sign-out", "search-trigger", "new-list"]) {
    await assertNothingIntercepts(page, testId);
  }
});
