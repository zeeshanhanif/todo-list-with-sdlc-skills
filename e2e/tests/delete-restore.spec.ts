import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-013 T7 — the delete-and-undo loop end to end against the real stack
// (web shell -> BFF proxy -> API -> Postgres): sign in, add tasks, open one,
// back out of the confirm dialog and see the task untouched, confirm and watch
// the row leave with the counts, then undo from the snackbar and watch it come
// back to the section it left. [UC-012 main 1-4]
//
// The second test covers what only a real browser can see: leaving the snackbar
// alone dismisses it, and the task stays deleted — while the ROW SURVIVES in
// Postgres, which is the difference between FR-TASK-013 and FR-TASK-015.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-delete-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** The soft-delete state as the DATABASE holds it — the assertion that keeps
 * "recoverable" honest. */
async function storedState(
  title: string,
): Promise<{ exists: boolean; deleted: boolean }> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query<{ deleted_at: Date | null }>(
      "SELECT deleted_at FROM tasks WHERE title = $1",
      [title],
    );
    return {
      exists: r.rows.length === 1,
      deleted: r.rows[0]?.deleted_at !== null,
    };
  } finally {
    await client.end();
  }
}

const activeTitles = (page: Page) =>
  page
    .getByTestId("active-tasks")
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

async function register(
  request: { post: (u: string, o: object) => Promise<{ status: () => number }> },
  email: string,
): Promise<void> {
  const res = await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  // Fixture precondition, asserted (DEF-002 practice).
  expect(res.status()).toBe(201);
  await markVerified(email);
}

test("UC-012: a task is deleted behind a confirmation and restored from the undo snackbar", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);

  const doomed = `Cancel the gym ${Date.now()}`;
  await addTasks(page, ["Buy milk", doomed]);
  await expect(page.getByTestId("list-subtitle")).toHaveText("2 tasks left");

  // Open the task — the detail slides in as SCR-WEB-010's panel presentation.
  await page.getByTestId("task-row-link").nth(1).click();
  await expect(page.getByTestId("detail-panel")).toBeVisible();

  // UC-012 main 1 — the delete control asks first (NFR-USE-002, AC-9b).
  await page.getByTestId("task-delete").click();
  await expect(page.getByTestId("task-delete-dialog")).toBeVisible();
  // The destructive button holds focus, and the dialog names the task.
  await expect(page.getByTestId("task-delete-confirm")).toBeFocused();
  await expect(page.getByTestId("task-delete-dialog")).toContainText(doomed);

  // Backing out writes NOTHING — no request, no row change, and focus returns
  // to the control that opened it.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("task-delete-dialog")).toHaveCount(0);
  await expect(page.getByTestId("task-delete")).toBeFocused();
  expect(await storedState(doomed)).toEqual({ exists: true, deleted: false });
  await expect(page.getByTestId("undo-snackbar")).toHaveCount(0);

  // UC-012 main 2 — confirm. The panel closes, the row leaves, the counts move,
  // and the snackbar arrives over the list.
  await page.getByTestId("task-delete").click();
  await page.getByTestId("task-delete-confirm").click();

  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  expect(await activeTitles(page)).toEqual(["Buy milk"]);
  await expect(page.getByTestId("list-subtitle")).toHaveText("1 task left");
  await expect(page.getByTestId("list-count").first()).toHaveText("1");
  await expect(page.getByTestId("undo-snackbar")).toBeVisible();
  await expect(page.getByTestId("undo-snackbar")).toContainText(doomed);

  // Soft: the row is still in Postgres, flagged (FR-TASK-013, not FR-TASK-015).
  expect(await storedState(doomed)).toEqual({ exists: true, deleted: true });

  // The snackbar is announced politely and does not steal focus, so it has to
  // be reachable by keyboard — it is the next tab stop, being last in the DOM.
  await expect(page.getByTestId("undo-snackbar")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("undo-snackbar-action")).toBeFocused();

  // UC-012 main 3/4 — undo from the keyboard, and everything reverses.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(2);
  expect(await activeTitles(page)).toEqual(["Buy milk", doomed]);
  await expect(page.getByTestId("list-subtitle")).toHaveText("2 tasks left");
  await expect(page.getByTestId("undo-snackbar")).toHaveCount(0);
  expect(await storedState(doomed)).toEqual({ exists: true, deleted: false });
});

test("UC-012 alt 3a: left alone, the snackbar dismisses and the task stays deleted — but recoverable", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);

  const doomed = `Water the plants ${Date.now()}`;
  await addTasks(page, ["Buy milk", doomed]);

  await page.getByTestId("task-row-link").nth(1).click();
  await expect(page.getByTestId("detail-panel")).toBeVisible();
  await page.getByTestId("task-delete").click();
  await page.getByTestId("task-delete-confirm").click();
  await expect(page.getByTestId("undo-snackbar")).toBeVisible();

  // ~7s per design.md §4. Waiting it out is the point of this test: the window
  // is the affordance's, not the contract's.
  await expect(page.getByTestId("undo-snackbar")).toHaveCount(0, {
    timeout: 15_000,
  });

  // Gone from the view, and it stays gone across a full reload...
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  expect(await activeTitles(page)).toEqual(["Buy milk"]);

  // ...while the row itself is still there, restorable until FEAT-020's purge
  // (AC-12). Nothing in this feature hard-deletes.
  expect(await storedState(doomed)).toEqual({ exists: true, deleted: true });
});

test("UC-012: a delete that fails leaves the task on screen, and a failed undo keeps its snackbar", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);

  const survivor = `Survive the outage ${Date.now()}`;
  await addTasks(page, [survivor]);

  // A failing DELETE (AC-11): the dialog stays open with its message, and the
  // task is still in the list behind it — never a row that vanishes on a write
  // that did not land.
  await page.getByTestId("task-row-link").first().click();
  await expect(page.getByTestId("detail-panel")).toBeVisible();
  await page.route("**/api/tasks/*", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 500, body: "{}" });
      return;
    }
    await route.fallback();
  });
  await page.getByTestId("task-delete").click();
  await page.getByTestId("task-delete-confirm").click();

  await expect(page.getByTestId("task-delete-error")).toBeVisible();
  await expect(page.getByTestId("task-delete-dialog")).toBeVisible();
  await expect(page.getByTestId("undo-snackbar")).toHaveCount(0);
  expect(await storedState(survivor)).toEqual({ exists: true, deleted: false });

  // Let the delete through, then break the restore instead.
  await page.unroute("**/api/tasks/*");
  await page.route("**/api/tasks/*/restore", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.getByTestId("task-delete-confirm").click();
  await expect(page.getByTestId("undo-snackbar")).toBeVisible();

  // A failed undo keeps the snackbar AND its action — dismissing here would
  // claim a restore that never happened (AC-11).
  await page.getByTestId("undo-snackbar-action").click();
  await expect(page.getByTestId("undo-snackbar-message")).toContainText(
    /Couldn't undo|can't be restored/i,
  );
  await expect(page.getByTestId("undo-snackbar-action")).toBeEnabled();
  await page.waitForTimeout(9000);
  await expect(page.getByTestId("undo-snackbar")).toBeVisible();

  // With the route restored, the retry works and the task comes back.
  await page.unroute("**/api/tasks/*/restore");
  await page.getByTestId("undo-snackbar-action").click();
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  expect(await storedState(survivor)).toEqual({ exists: true, deleted: false });
});
