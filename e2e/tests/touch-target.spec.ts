import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// DEF-011's regression guard — the project's cross-cutting accessibility check
// for **touch target size**, the sibling of `control-contrast.spec.ts`
// (DEF-005's guard for control boundaries).
//
// design.md §5 Targets: "≥ 44×44px on touch viewports (`--touch-target`); the
// compact desktop density (§3) applies only with a pointer." §4's `icon-button`
// says the same thing in its own words: "40px (**44px touch**) square".
//
// `apps/web` has no coarse-pointer rule anywhere, so an icon-only control is
// ONE size on every viewport — which means the only way to satisfy §5 on touch
// is for that size to be 44px. This spec measures the rendered boxes at a
// phone viewport, where the rule binds.
//
// Measured as a real bounding box rather than asserted against the style
// string, for the same reason the contrast guard computes ratios rather than
// comparing hex values: the criterion is the rendered size, and a token change
// that keeps the rule should stay green while one that breaks it goes red.
//
// Scope: **icon-only buttons** — controls whose entire accessible name is an
// `aria-label`, which design.md §4 calls out by name. Text buttons, inputs and
// selects carry their own labels and their own §4 sizing, and are not swept
// here.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";
const MIN = 44;

/** A phone viewport — where §5's rule applies without argument. */
const TOUCH = { width: 390, height: 844 };

const uniqueEmail = () =>
  `e2e-target-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** Assert one control's rendered box meets the minimum, naming it in the
 * failure so a red run says *which* control shrank. */
async function assertTarget(
  page: Page,
  testId: string,
  label: string,
): Promise<void> {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box, `${label} (${testId}) should be rendered`).not.toBeNull();
  const { width, height } = box!;
  expect(
    Math.min(width, height),
    `${label} (${testId}) is ${width}×${height}; design.md §5 requires ≥ ${MIN}×${MIN} on touch`,
  ).toBeGreaterThanOrEqual(MIN);
}

test("DEF-011: every icon-only control meets the 44px touch target", async ({
  page,
  request,
}) => {
  await page.setViewportSize(TOUCH);

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

  // The shell's own control, below `lg` where the drawer exists.
  await assertTarget(page, "drawer-toggle", "Shell drawer toggle");

  // Two active tasks, so the reorder affordance renders (FEAT-014).
  for (const title of ["alpha", "beta"]) {
    await page.getByTestId("quick-add-input").fill(title);
    await page.getByTestId("quick-add-input").press("Enter");
    await expect(
      page.getByTestId("task-row").filter({ hasText: title }),
    ).toBeVisible();
  }

  await assertTarget(page, "reorder-handle", "Task reorder handle");

  // The moving state's controls, which only exist once the handle is activated.
  await page.getByTestId("reorder-handle").first().click();
  await assertTarget(page, "move-up", "Task move-up");
  await assertTarget(page, "move-down", "Task move-down");

  // The sidebar's controls live in the drawer at this width.
  await page.getByTestId("drawer-toggle").click();
  await assertTarget(page, "new-list", "Sidebar new-list");
  await assertTarget(page, "list-menu-trigger", "List row menu trigger");
});
