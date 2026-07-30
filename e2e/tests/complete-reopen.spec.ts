import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-012 T7 — the loop a user actually came for, end to end against the real
// stack (web shell -> BFF proxy -> API -> Postgres): sign in, add tasks, finish
// one from its row, watch it leave the active section for an expandable
// Completed section with the counts moving, then reopen it from inside that
// section and watch everything reverse. [UC-011 main 1-4]
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-complete-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

const activeTitles = (page: Page) =>
  page
    .getByTestId("active-tasks")
    .getByTestId("task-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title")));

const completedTitles = (page: Page) =>
  page
    .getByTestId("completed-tasks")
    .getByTestId("task-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title")));

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

async function addTasks(page: Page, titles: string[]): Promise<void> {
  for (const [i, title] of titles.entries()) {
    await page.getByTestId("quick-add-input").fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("task-row")).toHaveCount(i + 1);
  }
}

test("UC-011: a task is completed from its row, collapses into Completed, and is reopened from there", async ({
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
  await signIn(page, email);

  await addTasks(page, ["Buy milk", "Call the vet", "Renew passport"]);
  // Nothing is completed yet, so the section does not exist at all — not an
  // empty heading (AC-10).
  await expect(page.getByTestId("completed-section")).toHaveCount(0);
  await expect(page.getByTestId("list-count").first()).toHaveText("3");

  // UC-011 main 1/2 — finish the first task from its own row.
  await page
    .getByTestId("active-tasks")
    .getByTestId("task-checkbox")
    .first()
    .click();

  await expect(page.getByTestId("completed-section")).toBeVisible();
  expect(await activeTitles(page)).toEqual(["Call the vet", "Renew passport"]);
  // The counts moved, with no page navigation (AC-11).
  await expect(page.getByTestId("list-subtitle")).toHaveText("2 tasks left");
  await expect(page.getByTestId("list-count").first()).toHaveText("2");

  // Collapsed by default, and the count is visible while it is (AC-10).
  await expect(page.getByTestId("completed-heading")).toHaveText(
    /Completed \(1\)/i,
  );
  expect(
    await page
      .getByTestId("completed-section")
      .evaluate((el) => (el as HTMLDetailsElement).open),
  ).toBe(false);

  // ...and it opens by KEYBOARD alone (AC-10) — the native <summary> behaviour
  // the design chose it for.
  await page.getByTestId("completed-heading").focus();
  await page.keyboard.press("Enter");
  expect(
    await page
      .getByTestId("completed-section")
      .evaluate((el) => (el as HTMLDetailsElement).open),
  ).toBe(true);
  expect(await completedTitles(page)).toEqual(["Buy milk"]);

  // AC-11's presentation clause, asserted rather than eyeballed: a completed
  // title renders strikethrough in --color-text-muted (#64748B), which is what
  // design.md §8 specifies for a finished task. Added by acceptance
  // verification — the build demonstrated this by screenshot, which is real
  // evidence but not a rerunnable one.
  // The title is the first span inside the row link (the strikethrough belongs
  // to the title, not to the whole row — the right cluster is not struck out).
  const completedTitle = page
    .getByTestId("completed-tasks")
    .getByTestId("task-row-link")
    .locator("span")
    .first();
  await expect(completedTitle).toHaveText("Buy milk");
  await expect(completedTitle).toHaveCSS("text-decoration-line", "line-through");
  await expect(completedTitle).toHaveCSS("color", "rgb(100, 116, 139)");

  // UC-011 main 3/4 — reopen it from inside the section.
  await page
    .getByTestId("completed-tasks")
    .getByTestId("task-checkbox")
    .first()
    .click();

  // Back among the active, in its original append position, and the section is
  // gone again because it has nothing left to hold.
  await expect(page.getByTestId("completed-section")).toHaveCount(0);
  expect(await activeTitles(page)).toEqual([
    "Buy milk",
    "Call the vet",
    "Renew passport",
  ]);
  await expect(page.getByTestId("list-count").first()).toHaveText("3");
});

test("AC-12: a failed transition rolls the checkbox back and says so", async ({
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
  await signIn(page, email);
  await addTasks(page, ["Will not save"]);

  // Break the write, and only the write.
  await page.route("**/api/tasks/*/complete", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 500, code: "internal_error" }),
    }),
  );

  const box = page.getByTestId("active-tasks").getByTestId("task-checkbox");
  await box.click();

  // The box must NOT be left reading completed — a control that lies about
  // what is stored is the failure this criterion exists to forbid.
  await expect(box).toHaveAttribute("data-completed", "false");
  await expect(page.getByTestId("task-checkbox-error")).toBeVisible();
  // The row never moved, and no Completed section was invented.
  expect(await activeTitles(page)).toEqual(["Will not save"]);
  await expect(page.getByTestId("completed-section")).toHaveCount(0);
  await expect(page.getByTestId("list-count").first()).toHaveText("1");

  // ...and the same action succeeds once the server is reachable again.
  await page.unroute("**/api/tasks/*/complete");
  await box.click();
  await expect(page.getByTestId("completed-section")).toBeVisible();
  // The badge is HIDDEN at zero — its presence is what carries meaning
  // (FEAT-009 ui-design D2), so the count reaching zero means no badge.
  await expect(page.getByTestId("list-count")).toHaveCount(0);
});

test("UC-011: completing clears the overdue treatment, and reopening brings it back", async ({
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
  await signIn(page, email);

  await addTasks(page, ["Pay the bill"]);

  // Give it a due date in the past through the detail surface (FEAT-011's
  // route), so the row shows the overdue chip.
  await page.getByTestId("task-row-link").first().click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  await page.getByTestId("detail-due").fill("2020-01-01T09:00");
  await expect(page.getByTestId("detail-due-clear")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  // Scoped to the ROW's chip — the panel renders one of its own, so an
  // unscoped locator is ambiguous rather than wrong.
  await expect(
    page.getByTestId("active-tasks").getByTestId("due-chip"),
  ).toHaveAttribute("data-overdue", "true");

  // Completing it clears the overdue indication (FR-TASK-009's own note) —
  // from the server's isOverdue, which the screen never re-derives.
  await page
    .getByTestId("active-tasks")
    .getByTestId("task-checkbox")
    .first()
    .click();
  await expect(page.getByTestId("completed-section")).toBeVisible();
  await page.getByTestId("completed-heading").click();
  await expect(
    page.getByTestId("completed-tasks").getByTestId("due-chip"),
  ).toHaveAttribute("data-overdue", "false");

  // Reopening a still-late task makes it overdue again.
  await page
    .getByTestId("completed-tasks")
    .getByTestId("task-checkbox")
    .first()
    .click();
  await expect(
    page.getByTestId("active-tasks").getByTestId("due-chip"),
  ).toHaveAttribute("data-overdue", "true");
});
