import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-014 T8 — the path this feature completes, end to end against the real
// stack (web shell -> BFF proxy -> API -> Postgres): sign in, add three tasks,
// reorder them from the list view, reload and find the SAME order, then
// complete one and watch the survivors keep their relative places.
// [UC-010 main 2-3 — the organize half; the edit half is FEAT-011's spec]
//
// AC-1 (the order is the rendered order), AC-2 (it survives a fresh page load,
// which is the only way to observe that it lives on the server rather than in
// this tab), AC-8 (completing leaves the survivors' relative order alone).
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-reorder-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** Move the task at `index` one place, and **wait for the write to land**.
 *
 * The wait is not incidental: the move is optimistic (ui-design D2), so the
 * rows re-render before the request resolves — and a `page.reload()` fired in
 * that window cancels the in-flight write, which is exactly how the first draft
 * of this spec produced a convincing false failure. Awaiting the response is
 * the deterministic fix; a timeout would only make it rarer.
 */
async function moveBy(page: Page, index: number, key: "ArrowUp" | "ArrowDown") {
  const handle = page.getByTestId("reorder-handle").nth(index);
  await handle.focus();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/tasks/reorder") && r.request().method() === "POST",
    ),
    page.keyboard.press(key),
  ]);
  expect(response.status()).toBe(200);
}

test("AC-1/AC-2/AC-8: a manual order persists across a reload and survives completing a task", async ({
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

  for (const title of ["alpha", "beta", "gamma"]) {
    await page.getByTestId("quick-add-input").fill(title);
    await page.getByTestId("quick-add-input").press("Enter");
    await expect(
      page.getByTestId("task-row").filter({ hasText: title }),
    ).toBeVisible();
  }
  // Creation order is the starting order — new tasks append (AC-3).
  expect(await taskTitles(page)).toEqual(["alpha", "beta", "gamma"]);

  // The keyboard path, which is the one AC-12 makes non-optional. Two presses
  // on the SAME handle: focus travels with the row, so `alpha` walks to last.
  await moveBy(page, 0, "ArrowDown");
  expect(await taskTitles(page)).toEqual(["beta", "alpha", "gamma"]);
  await moveBy(page, 1, "ArrowDown");
  expect(await taskTitles(page)).toEqual(["beta", "gamma", "alpha"]);

  // AC-2 — a fresh page load, so nothing of this tab's state survives. The
  // order comes back from the server.
  await page.reload();
  await expect(page.getByTestId("task-row")).toHaveCount(3);
  expect(await taskTitles(page)).toEqual(["beta", "gamma", "alpha"]);

  // AC-8 — completing the middle task removes it from the active order; the
  // two survivors keep their relative places rather than reverting to creation
  // order, and the completed section takes it.
  await page
    .getByTestId("task-row")
    .filter({ hasText: "gamma" })
    .getByRole("checkbox")
    .check();
  await expect(page.getByTestId("completed-section")).toBeVisible();
  await expect(page.getByTestId("active-tasks").getByTestId("task-row")).toHaveCount(
    2,
  );
  expect(
    await page
      .getByTestId("active-tasks")
      .getByTestId("task-row")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title"))),
  ).toEqual(["beta", "alpha"]);

  // And the reduced order is itself persisted.
  await page.reload();
  expect(
    await page
      .getByTestId("active-tasks")
      .getByTestId("task-row")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title"))),
  ).toEqual(["beta", "alpha"]);
});
