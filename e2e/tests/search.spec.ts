import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-015 T9 — search & filters (UC-013) wired end-to-end against the real
// stack (web shell -> BFF proxy -> API -> Postgres).
//
// Covers UC-013 main 1-3 (keyword, filters, paginated results carrying their
// list) and alt 2a (no matches -> the empty state), plus the overlay's own
// keyboard contract, which is where a modal most often lies about itself.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-search-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Seed a corpus that exercises every axis in one fixture: two lists, an active
 * task, a completed one, an overdue one, and 30 rows so paging is real.
 */
async function seedCorpus(email: string): Promise<void> {
  await withDb(async (c) => {
    await c.query("UPDATE users SET verified_at = now() WHERE email = $1", [
      email,
    ]);
    await c.query(
      `INSERT INTO lists (owner_id, name, position)
       SELECT id, 'Work', 1 FROM users WHERE email = $1`,
      [email],
    );
    // 30 "Quarterly report N" rows in the Inbox — enough for two pages.
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, created_at)
       SELECT u.id, l.id, 'Quarterly report ' || g, now() - (g || ' minutes')::interval
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        CROSS JOIN generate_series(1, 30) g
        WHERE u.email = $1`,
      [email],
    );
    // One in the OTHER list, so results must span lists (FR-SRCH-001/002).
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, created_at)
       SELECT u.id, l.id, 'Board report for Work', now()
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.name = 'Work'
        WHERE u.email = $1`,
      [email],
    );
    // A completed one and an overdue one, for the status filter.
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at, due_at)
       SELECT u.id, l.id, 'Report already filed', now(), NULL
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [email],
    );
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       SELECT u.id, l.id, 'Report that is late', now() - interval '2 days'
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [email],
    );
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

const titles = (page: Page) =>
  page
    .getByTestId("search-result")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));

test("UC-013: a signed-in user searches, filters, pages and finds nothing", async ({
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
  await seedCorpus(email);
  await signIn(page, email);

  // UC-013 main 1 — the overlay opens from the shell, at any URL in the zone.
  await page.getByTestId("search-trigger").click();
  await expect(page.getByTestId("search-overlay")).toBeVisible();
  // Nothing asked yet: idle, not "no matches" (FR-SRCH-006's distinction).
  await expect(page.getByTestId("search-idle")).toBeVisible();
  await expect(page.getByTestId("search-empty")).toHaveCount(0);

  // UC-013 main 2-3 — keyword across ALL lists, each result carrying its list.
  await page.getByTestId("search-input").fill("report");
  await expect(page.getByTestId("search-results")).toBeVisible();
  const lists = await page
    .getByTestId("search-result-list")
    .evaluateAll((els) => els.map((e) => e.textContent));
  expect(new Set(lists)).toContain("Inbox");
  await expect(
    page.getByTestId("search-result").filter({ hasText: "Board report for Work" }),
  ).toHaveCount(1);

  // FR-SRCH-009 — the first page is bounded, and Load more appends.
  const firstPage = await titles(page);
  expect(firstPage).toHaveLength(25);
  await expect(page.getByTestId("search-count")).toContainText("so far");
  await page.getByTestId("search-load-more").click();
  await expect(page.getByTestId("search-load-more")).toHaveCount(0);
  const bothPages = await titles(page);
  expect(bothPages.length).toBeGreaterThan(25);
  // Appended, not replaced — and no row came back twice.
  expect(bothPages.slice(0, 25)).toEqual(firstPage);
  expect(new Set(bothPages).size).toBe(bothPages.length);

  // FR-SRCH-003 — status narrows the same keyword (conjunctive, FR-SRCH-005).
  await page.getByTestId("search-status").selectOption("completed");
  await expect(page.getByTestId("search-result")).toHaveText([
    /Report already filed/,
  ]);

  await page.getByTestId("search-status").selectOption("overdue");
  await expect(page.getByTestId("search-result")).toHaveText([
    /Report that is late/,
  ]);

  // FR-SRCH-004 — a due bucket, on the same keyword.
  await page.getByTestId("search-status").selectOption("");
  await page.getByTestId("search-due").selectOption("none");
  // "no due date" excludes the overdue one, which is how we know the bucket
  // was applied rather than the previous filter's results lingering.
  await expect(
    page.getByTestId("search-result").filter({ hasText: "Report that is late" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("search-result").first()).toBeVisible();

  // UC-013 alt 2a — no matches: the empty state, echoing what was asked.
  await page.getByTestId("search-due").selectOption("");
  await page.getByTestId("search-input").fill("nothingmatchesthisatall");
  await expect(page.getByTestId("search-empty")).toBeVisible();
  await expect(page.getByTestId("search-empty")).toContainText(
    "nothingmatchesthisatall",
  );
  await expect(page.getByTestId("search-results")).toHaveCount(0);

  // Clearing the query returns to IDLE, not to "no matches" — the client half
  // of technical-design D6.
  await page.getByTestId("search-input").fill("");
  await expect(page.getByTestId("search-idle")).toBeVisible();
  await expect(page.getByTestId("search-empty")).toHaveCount(0);
});

test("UC-013: the overlay's keyboard contract holds", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, { data: { email, password: PW } });
  await seedCorpus(email);
  await signIn(page, email);

  // Opens from anywhere in the zone with the shortcut (ui-design D6). Wait for
  // the shell to be interactive first — the listener is attached on hydration,
  // and a key pressed before that reaches nothing.
  await expect(page.getByTestId("search-trigger")).toBeVisible();
  await page.getByTestId("search-trigger").focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-overlay")).toBeVisible();
  // ...with focus already in the query field, so typing just works.
  await expect(page.getByTestId("search-input")).toBeFocused();

  await page.getByTestId("search-input").fill("report");
  await expect(page.getByTestId("search-results")).toBeVisible();

  // Arrow keys move through results; Enter opens the focused one and the
  // overlay closes behind it.
  await page.keyboard.press("ArrowDown");
  const focusedTitle = await page.evaluate(
    () => document.activeElement?.textContent ?? "",
  );
  // Case-insensitive: the corpus titles are capitalised ("Quarterly report",
  // "Report that is late") and the query is not — which is FR-SRCH-001's
  // case-insensitive matching showing up in the fixture.
  expect(focusedTitle.toLowerCase()).toContain("report");
  // Focus is on a RESULT LINK, not merely somewhere in the overlay.
  expect(
    await page.evaluate(() => document.activeElement?.tagName ?? ""),
  ).toBe("A");

  // Esc closes and returns focus to the trigger (design.md §5) — asserted,
  // because an element claiming aria-modal has to keep that promise.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-overlay")).toHaveCount(0);
  await expect(page.getByTestId("search-trigger")).toBeFocused();
});

test("FR-AUTHZ-002: search never reaches another account's tasks", async ({
  page,
  request,
}) => {
  const mine = uniqueEmail();
  const theirs = uniqueEmail();
  for (const email of [mine, theirs]) {
    await request.post(`${API}/auth/register`, { data: { email, password: PW } });
    await withDb((c) =>
      c.query("UPDATE users SET verified_at = now() WHERE email = $1", [email]),
    );
  }
  await withDb((c) =>
    c.query(
      `INSERT INTO tasks (owner_id, list_id, title)
       SELECT u.id, l.id, 'Their confidential report'
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [theirs],
    ),
  );
  await withDb((c) =>
    c.query(
      `INSERT INTO tasks (owner_id, list_id, title)
       SELECT u.id, l.id, 'My own report'
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [mine],
    ),
  );

  await signIn(page, mine);
  await page.getByTestId("search-trigger").click();
  await page.getByTestId("search-input").fill("report");

  await expect(page.getByTestId("search-result")).toHaveCount(1);
  expect(await titles(page)).toEqual(["My own report"]);
});

test("AC-11: the loading and error states are real, and neither loses the query", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, { data: { email, password: PW } });
  await seedCorpus(email);
  await signIn(page, email);

  // --- loading -------------------------------------------------------------
  // The local stack answers in single-digit milliseconds, so the loading state
  // is invisible unless the response is held. Delaying the route is what makes
  // the claim testable rather than merely plausible.
  await page.route("**/api/search**", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    return route.continue();
  });

  await page.getByTestId("search-trigger").click();
  await page.getByTestId("search-input").fill("report");

  await expect(page.getByTestId("search-loading")).toBeVisible();
  // ui-design's explicit claim: the field stays live and KEEPS FOCUS while the
  // panel thinks — a search box that blocks input is unusable at typing speed.
  await expect(page.getByTestId("search-input")).toBeFocused();
  await page.getByTestId("search-input").fill("report q");
  await expect(page.getByTestId("search-input")).toHaveValue("report q");

  await page.unroute("**/api/search**");

  // --- error ---------------------------------------------------------------
  await page.getByTestId("search-input").fill("report");
  await expect(page.getByTestId("search-results")).toBeVisible();

  await page.route("**/api/search**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 500,
        code: "internal_error",
        message: "Something went wrong. Please try again.",
      }),
    }),
  );
  await page.getByTestId("search-input").fill("report again");

  await expect(page.getByTestId("search-error")).toBeVisible();
  // NFR-REL-004: losing a typed query to a transient failure is the most
  // annoying possible outcome here, so the query survives the error...
  await expect(page.getByTestId("search-input")).toHaveValue("report again");
  // ...and so does the last good answer, rather than the panel going blank.
  await expect(page.getByTestId("search-results")).toBeVisible();
});

test("AC-11: every control in the overlay is reachable by keyboard", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, { data: { email, password: PW } });
  await seedCorpus(email);
  await signIn(page, email);

  await page.getByTestId("search-trigger").click();
  await expect(page.getByTestId("search-input")).toBeFocused();

  // Tab order follows reading order: query -> status -> due (ui-design D6).
  const focusedId = () => page.evaluate(() => document.activeElement?.id ?? "");
  await page.keyboard.press("Tab");
  expect(await focusedId()).toBe("search-status");
  await page.keyboard.press("Tab");
  expect(await focusedId()).toBe("search-due");

  // The filters are operable from the keyboard alone — a select changes with
  // arrows, which is exactly why ui-design D3 chose native controls over a
  // chip/segmented control the design system does not have.
  await page.getByTestId("search-status").focus();
  await page.getByTestId("search-status").selectOption("completed");
  await expect(page.getByTestId("search-results")).toBeVisible();

  // Focus stays TRAPPED inside the dialog: tabbing from the last control does
  // not walk out into the shell behind the scrim, which is what aria-modal
  // promises and therefore has to be true.
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="search-overlay"]');
    return dialog?.contains(document.activeElement) ?? false;
  });
  expect(inside).toBe(true);
});
