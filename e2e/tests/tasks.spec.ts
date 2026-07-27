import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-010 T7 — the path a user actually came for, end to end against the real
// stack (web shell -> BFF proxy -> API -> Postgres): sign in, land on the app
// home, see the Inbox, add a task, watch it appear with the sidebar badge
// updated, and open another list with its own empty state. [UC-009 main 1/3/4,
// alt 3a]
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-tasks-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Verification is FEAT-002's flow with its own coverage; this suite needs a
 * signed-in user, not a second verify test. */
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

const taskTitles = (page: Page) =>
  page
    .getByTestId("task-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title")));

test("AC-11/AC-1: a signed-in user lands on their Inbox and adds their first tasks", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  expect(
    (
      await request.post(`${API}/auth/register`, {
        data: { email, password: PW },
      })
    ).status(),
  ).toBe(201);
  await markVerified(email);

  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  // The home is the default list's view, and a brand-new account gets the
  // first-run state (SCR-WEB-018, ui-design D1).
  await expect(page.getByTestId("list-title")).toHaveText("Inbox");
  await expect(page.getByTestId("first-run-empty")).toBeVisible();
  await expect(page.getByTestId("task-row")).toHaveCount(0);

  // UC-009 main 1/3/4 — AC-11 is "one field and one action with no navigation",
  // and the field being **already focused** is what makes that true: without it
  // the user owes a click first. Asserted here rather than assumed.
  await expect(page.getByTestId("quick-add-input")).toBeFocused();

  await page.getByTestId("quick-add-input").fill("Buy milk");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await expect(page.getByTestId("first-run-empty")).toHaveCount(0);

  // ...and a second lands AFTER the first (append order, technical-design D4)
  await page.getByTestId("quick-add-input").fill("Call the vet");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(2);
  expect(await taskTitles(page)).toEqual(["Buy milk", "Call the vet"]);

  // The sidebar's count badge tracks the tasks just created (FEAT-009 AC-13,
  // now meaningful because tasks can exist)
  await expect(page.getByTestId("list-count").first()).toHaveText("2");

  // UC-009 alt 3a — a blank title is refused, with the typed value preserved
  await page.getByTestId("quick-add-input").fill("   ");
  await page.getByTestId("quick-add-submit").click();
  await expect(page.getByTestId("quick-add-error")).toBeVisible();
  await expect(page.getByTestId("task-row")).toHaveCount(2);
  await expect(page.getByTestId("quick-add-input")).toHaveValue("   ");
});

test("AC-7/AC-12: each list has its own tasks, reached from the sidebar", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  await markVerified(email);

  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  await page.getByTestId("quick-add-input").fill("Inbox task");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);

  // A second list, reached by clicking its sidebar row
  await page.getByTestId("new-list").click();
  await page.getByTestId("list-name-input").fill("Groceries");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);

  await page.getByTestId("list-row").nth(1).getByTestId("list-link").click();
  await page.waitForURL(/\/lists\//);

  await expect(page.getByTestId("list-title")).toHaveText("Groceries");
  // Its own state: empty, and the GENERIC empty state — the account is no
  // longer new, so first-run does not apply (ui-design D1)
  await expect(page.getByTestId("list-empty")).toBeVisible();
  await expect(page.getByTestId("first-run-empty")).toHaveCount(0);
  await expect(page.getByTestId("task-row")).toHaveCount(0);
  // ...and the open list's row is the selected one
  await expect(page.getByTestId("list-row").nth(1)).toHaveAttribute(
    "data-selected",
    "true",
  );

  // Tasks added here belong to this list only (FR-LIST-009)
  await page.getByTestId("quick-add-input").fill("Oat milk");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  expect(await taskTitles(page)).toEqual(["Oat milk"]);

  await page.getByTestId("list-row").nth(0).getByTestId("list-link").click();
  await expect(page.getByTestId("list-title")).toHaveText("Inbox");
  expect(await taskTitles(page)).toEqual(["Inbox task"]);
});

test("AC-5/AC-10: an unknown or unowned list renders one uniform not-found", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  await markVerified(email);
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  await page.goto("/lists/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("list-not-found")).toBeVisible();
  // the shell is still operable — a data failure never strands the frame
  await expect(page.getByTestId("lists-nav")).toBeVisible();
  await page.getByTestId("back-home").click();
  await expect(page.getByTestId("list-title")).toHaveText("Inbox");
});
