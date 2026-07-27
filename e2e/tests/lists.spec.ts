import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-009 T8 — list management (UC-008) wired end-to-end against the real stack
// (web shell -> BFF proxy -> API -> Postgres). Replaces the walking skeleton's
// spec, retired in T6: the sidebar's lists are now the suite's end-to-end proof.
// Covers UC-008 main 1-5 plus alt 3a (invalid name), alt 4a (delete warning +
// confirmation, NFR-USE-002) and exc-4b (the Inbox cannot be deleted).
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-lists-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Mark an account verified. Verification itself is FEAT-002's flow and has its
 * own coverage; this suite needs a signed-in user, not a second verify test. */
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

/** Seed tasks into a named list. Task creation is FEAT-010's endpoint, which does
 * not exist yet — the rows go in directly so the count-dependent behavior this
 * feature owns (badges, the delete warning) can be exercised end to end. */
async function seedTasks(
  email: string,
  listName: string,
  count: number,
): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO tasks (owner_id, list_id, title)
       SELECT u.id, l.id, 'seeded'
         FROM users u
         JOIN lists l ON l.owner_id = u.id AND l.name = $2
         CROSS JOIN generate_series(1, $3::int)
        WHERE u.email = $1`,
      [email, listName, count],
    );
  } finally {
    await client.end();
  }
}

const rowNames = (page: Page) =>
  page
    .getByTestId("list-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-list-name")));

const openMenu = (page: Page, index: number) =>
  page.getByTestId("list-row").nth(index).getByTestId("list-menu-trigger").click();

test("a signed-in user creates, renames, reorders and deletes lists", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  const registered = await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  expect(registered.status()).toBe(201);
  await markVerified(email);

  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  // UC-008 main 1 — a fresh account shows its bootstrap Inbox (FR-LIST-003/005)
  await expect(page.getByTestId("list-row")).toHaveCount(1);
  expect(await rowNames(page)).toEqual(["Inbox"]);

  // UC-008 main 2-3 — create: trimmed, appended last (FR-LIST-001/002/008)
  await page.getByTestId("new-list").click();
  await page.getByTestId("list-name-input").fill("  Groceries  ");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);
  expect(await rowNames(page)).toEqual(["Inbox", "Groceries"]);

  // UC-008 alt 3a — an invalid name keeps the dialog open with a field error
  await page.getByTestId("new-list").click();
  await page.getByTestId("list-name-input").fill("   ");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("list-name-error")).toBeVisible();
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);

  // UC-008 main 4 — rename (FR-LIST-006)
  await openMenu(page, 1);
  await page.getByTestId("menu-rename").click();
  await page.getByTestId("list-name-input").fill("Shopping");
  await page.getByTestId("dialog-confirm").click();
  await expect.poll(async () => (await rowNames(page))[1]).toBe("Shopping");

  // UC-008 main 4-5 — reorder persists across a reload (FR-LIST-008)
  await openMenu(page, 0);
  await page.getByTestId("menu-move-down").click();
  await expect.poll(async () => (await rowNames(page))[0]).toBe("Shopping");
  await page.reload();
  await expect(page.getByTestId("list-row").first()).toBeVisible();
  expect(await rowNames(page)).toEqual(["Shopping", "Inbox"]);

  // UC-008 exc-4b — the Inbox (now row 1) offers no delete affordance
  await openMenu(page, 1);
  await expect(page.getByTestId("menu-rename")).toBeVisible();
  await expect(page.getByTestId("menu-delete")).toHaveCount(0);
  await openMenu(page, 1); // close

  // UC-008 alt 4a — delete warns first; dismissing changes nothing (NFR-USE-002)
  await openMenu(page, 0);
  await page.getByTestId("menu-delete").click();
  await expect(page.getByTestId("delete-warning")).toContainText("Shopping");
  await expect(page.getByTestId("delete-warning")).toContainText("undone");
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);

  // ...confirming removes it and says so (FR-LIST-007)
  await openMenu(page, 0);
  await page.getByTestId("menu-delete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("list-row")).toHaveCount(1);
  expect(await rowNames(page)).toEqual(["Inbox"]);
  await expect(page.getByTestId("list-toast")).toContainText("Shopping");
});

test("counts drive the sidebar badge and the delete warning", async ({
  page,
  request,
}) => {
  // AC-13 (badge shows the active-task count) and AC-12 (the confirmation
  // quantifies what will be permanently deleted, NFR-USE-002).
  const email = uniqueEmail();
  expect(
    (
      await request.post(`${API}/auth/register`, {
        data: { email, password: PW },
      })
    ).status(),
  ).toBe(201);
  await markVerified(email);
  await seedTasks(email, "Inbox", 3);

  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");

  // The Inbox badge carries its active count; a list with none has no badge at
  // all (ui-design D2 — the badge's presence is what carries meaning).
  await expect(page.getByTestId("list-count")).toHaveCount(1);
  await expect(page.getByTestId("list-count")).toHaveText("3");

  await page.getByTestId("new-list").click();
  await page.getByTestId("list-name-input").fill("Errands");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);
  await expect(page.getByTestId("list-count")).toHaveCount(1); // still just Inbox's

  // The warning names the list and the exact number of tasks going with it.
  await seedTasks(email, "Errands", 2);
  await page.reload();
  await expect(page.getByTestId("list-count")).toHaveCount(2);
  await openMenu(page, 1);
  await page.getByTestId("menu-delete").click();
  await expect(page.getByTestId("delete-warning")).toContainText("Errands");
  await expect(page.getByTestId("delete-warning")).toContainText("2 tasks");

  // Dismissing sends nothing: the list and its tasks survive.
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByTestId("list-row")).toHaveCount(2);
  await page.reload();
  expect(await rowNames(page)).toEqual(["Inbox", "Errands"]);
});

test("the app home requires a session", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
});
