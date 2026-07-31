import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-016 T8 — smart views (UC-014) wired end-to-end against the real stack
// (web shell -> BFF proxy -> API -> Postgres).
//
// Covers UC-014 main 1-3 (choose a view, membership computed in the user's
// zone, tasks shown with their originating list) and alt 2a (an empty view ->
// its own empty state), plus the two properties a screen most easily gets wrong
// once it is real: that the four views actually hold DIFFERENT tasks, and that
// paging appends rather than replaces.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-views-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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
 * One fixture holding a member of every view: two lists, a task due later
 * today, one due at the very start of today (so it is in Today AND Overdue —
 * FR-SRCH-008's own overlap), one due tomorrow, one with no due date at all
 * (All only), plus a completed and a soft-deleted one that must appear nowhere.
 * The zone is pinned to UTC so the day boundaries are the ones the SQL uses.
 */
/**
 * A fixed-offset zone where it is currently ~02:00, so "later today" always has
 * room (DEF-010).
 *
 * The bug this replaces: the fixture pinned the user to UTC and seeded tasks at
 * `now() + 3h` / `now() + 5h`, expecting both in Today and NEITHER in Overdue.
 * After 19:00 UTC those instants fall on tomorrow, so the suite failed for the
 * last five hours of every UTC day. Nothing was wrong with the product — Today
 * correctly excluded a task due tomorrow.
 *
 * The fix keeps every assertion and removes the wall-clock premise instead: the
 * views are computed in the USER'S zone (FR-PROF-003), so choosing a zone whose
 * local clock reads 02:00 makes "earlier today" and "later today" both
 * available at any real hour. `Etc/GMT±N` has fixed offsets and no DST (sign
 * inverted by POSIX convention — `Etc/GMT-5` is UTC+5).
 */
function earlyMorningZone(now: Date = new Date()): string {
  const raw = (2 - now.getUTCHours() + 24) % 24;
  const offset = raw > 12 ? raw - 24 : raw;
  return `Etc/GMT${offset >= 0 ? "-" : "+"}${Math.abs(offset)}`;
}

async function seedViews(email: string): Promise<void> {
  const zone = earlyMorningZone();
  await withDb(async (c) => {
    await c.query(
      "UPDATE users SET verified_at = now(), timezone = $2 WHERE email = $1",
      [email, zone],
    );
    await c.query(
      `INSERT INTO lists (owner_id, name, position)
       SELECT id, 'Work', 1 FROM users WHERE email = $1`,
      [email],
    );
    const seed = (
      list: "Inbox" | "Work",
      title: string,
      due: string | null,
      extra = "",
    ) =>
      c.query(
        `INSERT INTO tasks (owner_id, list_id, title, due_at${extra ? `, ${extra}` : ""})
         SELECT u.id, l.id, $2, ${due ?? "NULL"}${extra ? ", now()" : ""}
           FROM users u JOIN lists l ON l.owner_id = u.id AND ${
             list === "Inbox" ? "l.is_default = true" : "l.name = 'Work'"
           }
          WHERE u.email = $1`,
        [email, title],
      );

    // `::timestamp` before AT TIME ZONE is load-bearing — a bare date casts
    // through timestamptz and comes back zone-less.
    //
    // Every instant below is expressed as an OFFSET FROM THE USER'S START OF
    // DAY rather than from `now()`, which is what makes the memberships fixed
    // facts instead of a function of when the suite runs (DEF-010). With local
    // time at ~02:00: hour 0 is earlier today (Today AND Overdue), hours 8 and
    // 10 are later today (Today, not Overdue), and +2 days is Upcoming.
    const at = (expr: string) =>
      `((now() AT TIME ZONE '${zone}')::date::timestamp + ${expr}) AT TIME ZONE '${zone}'`;

    await seed("Inbox", "Draft the quarterly report", at("interval '8 hour'"));
    await seed("Work", "Call the supplier back", at("interval '10 hour'"));
    await seed("Inbox", "Missed this morning", at("interval '0 hour'"));
    await seed("Work", "Ship the release notes", at("interval '2 day'"));
    await seed("Inbox", "Someday maybe", null);
    await seed("Inbox", "Already finished", at("interval '9 hour'"), "completed_at");
    await seed("Inbox", "Thrown away", at("interval '9 hour'"), "deleted_at");
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
    .getByTestId("view-task-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-task-title")));

async function register(
  request: { post: (url: string, opts: { data: unknown }) => Promise<{ status: () => number }> },
  email: string,
): Promise<void> {
  expect(
    (await request.post(`${API}/auth/register`, { data: { email, password: PW } })).status(),
  ).toBe(201);
}

test("UC-014: a signed-in user reviews Today, Upcoming, Overdue and All", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await seedViews(email);
  await signIn(page, email);

  // UC-014 main 1 — the views are navigation, reachable from the shell.
  await page.getByTestId("nav-view-today").click();
  await page.waitForURL("**/views/today");
  await expect(page.getByTestId("view-title")).toHaveText("Today");
  await expect(page.getByTestId("nav-view-today")).toHaveAttribute(
    "aria-current",
    "page",
  );

  // UC-014 main 2-3 — membership, aggregated across lists, each row carrying
  // the list it came from. Due-ascending, so the order is asserted exactly.
  expect(await titles(page)).toEqual([
    "Missed this morning",
    "Draft the quarterly report",
    "Call the supplier back",
  ]);
  const lists = await page
    .getByTestId("view-list-badge")
    .evaluateAll((els) => els.map((e) => e.textContent));
  expect(new Set(lists)).toEqual(new Set(["Inbox", "Work"]));

  // Completed and soft-deleted are excluded from every view (FR-SRCH-008).
  for (const view of ["today", "upcoming", "overdue", "all"]) {
    await page.goto(`/views/${view}`);
    await expect(page.getByTestId("view-title")).toBeVisible();
    const shown = await titles(page);
    expect(shown).not.toContain("Already finished");
    expect(shown).not.toContain("Thrown away");
  }

  // Each view holds a DIFFERENT set — the point of having four.
  // The heading is what says the new view has ARRIVED: waitForURL resolves as
  // soon as the address changes, while the previous view's rows are still on
  // screen, so reading them there compares the wrong screen.
  await page.getByTestId("nav-view-upcoming").click();
  await expect(page.getByTestId("view-title")).toHaveText("Upcoming");
  expect(await titles(page)).toEqual(["Ship the release notes"]);

  await page.getByTestId("nav-view-overdue").click();
  await expect(page.getByTestId("view-title")).toHaveText("Overdue");
  expect(await titles(page)).toEqual(["Missed this morning"]);
  // The overlap is FR-SRCH-008's own semantics, not a leak: the same task is in
  // Today, and its chip says overdue on both screens.
  await expect(page.getByTestId("due-chip")).toHaveAttribute(
    "data-overdue",
    "true",
  );

  await page.getByTestId("nav-view-all").click();
  await expect(page.getByTestId("view-title")).toHaveText("All");
  const all = await titles(page);
  expect(new Set(all)).toEqual(
    new Set([
      "Draft the quarterly report",
      "Call the supplier back",
      "Missed this morning",
      "Ship the release notes",
      "Someday maybe", // the undated task only All can show
    ]),
  );
});

test("UC-014 alt 2a: an empty view shows its own empty state", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await withDb((c) =>
    c.query(
      "UPDATE users SET verified_at = now(), timezone = 'UTC' WHERE email = $1",
      [email],
    ),
  );
  await signIn(page, email);

  // A brand-new account has an Inbox and nothing in it, so every view is empty.
  await page.goto("/views/today");
  await expect(page.getByTestId("view-empty")).toContainText(
    "Nothing due today",
  );
  await expect(page.getByTestId("view-empty-action")).toBeVisible();

  // Distinct copy per view, and an empty Overdue is good news — so it offers
  // no "add a task" action at all (ui-design D3).
  await page.goto("/views/overdue");
  await expect(page.getByTestId("view-empty")).toContainText("Nothing overdue");
  await expect(page.getByTestId("view-empty-action")).toHaveCount(0);

  // A view name outside the four is a URL typo, answered in-shell (D6).
  await page.goto("/views/yesterday");
  await expect(page.getByTestId("view-not-found")).toBeVisible();
  await expect(page.getByTestId("lists-nav")).toBeVisible();
});

test("FR-SRCH-009: a view longer than a page loads more without losing rows", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await withDb(async (c) => {
    await c.query(
      "UPDATE users SET verified_at = now(), timezone = 'UTC' WHERE email = $1",
      [email],
    );
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       SELECT u.id, l.id, 'Upcoming task ' || g, now() + (g || ' day')::interval
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        CROSS JOIN generate_series(1, 30) g
        WHERE u.email = $1`,
      [email],
    );
  });
  await signIn(page, email);

  await page.goto("/views/upcoming");
  const firstPage = await titles(page);
  expect(firstPage).toHaveLength(25);
  // No total is claimed while more remain — the contract carries none.
  await expect(page.getByTestId("view-subtitle")).toContainText("so far");

  await page.getByTestId("view-load-more").click();
  await expect(page.getByTestId("view-load-more")).toHaveCount(0);
  const bothPages = await titles(page);
  expect(bothPages).toHaveLength(30);
  // Appended, not replaced — and no row came back twice.
  expect(bothPages.slice(0, 25)).toEqual(firstPage);
  expect(new Set(bothPages).size).toBe(bothPages.length);
  await expect(page.getByTestId("view-subtitle")).not.toContainText("so far");
});

test("AC-12: the BFF refuses an unauthenticated request too", async ({
  request,
}) => {
  // The criterion names BOTH doors, and only the API's was covered: a proxy
  // that forwarded no cookie but answered anyway would leak one user's views to
  // an anonymous caller, and the API-side test cannot see that.
  const res = await request.get("/api/views/today");
  expect(res.status()).toBe(401);
  expect(((await res.json()) as { code: string }).code).toBe("unauthenticated");
});

test("AC-15: the view is operable from the keyboard alone", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await withDb(async (c) => {
    await c.query(
      "UPDATE users SET verified_at = now(), timezone = 'UTC' WHERE email = $1",
      [email],
    );
    await c.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       SELECT u.id, l.id, 'Upcoming task ' || g, now() + (g || ' day')::interval
         FROM users u JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        CROSS JOIN generate_series(1, 30) g
        WHERE u.email = $1`,
      [email],
    );
  });
  await signIn(page, email);

  // Reach the view itself from the sidebar without a pointer.
  await page.goto("/");
  await page.getByTestId("nav-view-upcoming").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-title")).toHaveText("Upcoming");

  // Then the two controls the screen adds: Load more, and a row's checkbox
  // (Space, which is the rule design.md §5 states for a checkbox).
  await page.getByTestId("view-load-more").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-load-more")).toHaveCount(0);
  expect(await titles(page)).toHaveLength(30);

  const first = page.getByTestId("view-task-row").first();
  const title = await first.getAttribute("data-task-title");
  await first.getByTestId("task-checkbox").focus();
  await page.keyboard.press("Space");
  // Matched on the exact title attribute, not on text: "Upcoming task 1" is a
  // substring of "Upcoming task 10", so a hasText filter would still find rows
  // after this one was removed and the check would pass for the wrong reason.
  await expect(page.locator(`[data-task-title="${title}"]`)).toHaveCount(0);
  // Back to ONE page: completing refreshes the server component, and a fresh
  // first page replaces the appended ones rather than keeping rows the server
  // may no longer place in this view. Deliberate (see the T8 commit) and
  // asserted here so the trade is visible rather than discovered.
  expect(await titles(page)).toHaveLength(25);
  await expect(page.getByTestId("view-load-more")).toBeVisible();
});

test("AC-16: completing a task from a view removes it from that view", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await seedViews(email);
  await signIn(page, email);

  await page.goto("/views/today");
  const before = await titles(page);
  expect(before).toContain("Draft the quarterly report");

  await page
    .getByTestId("view-task-row")
    .filter({ hasText: "Draft the quarterly report" })
    .getByTestId("task-checkbox")
    .click();

  // The view is active-only, so a completed task leaves it on the refresh the
  // checkbox triggers — correct, and the reason it is asserted rather than
  // treated as a disappearing-row bug.
  await expect(
    page
      .getByTestId("view-task-row")
      .filter({ hasText: "Draft the quarterly report" }),
  ).toHaveCount(0);
  expect(await titles(page)).toHaveLength(before.length - 1);
});
