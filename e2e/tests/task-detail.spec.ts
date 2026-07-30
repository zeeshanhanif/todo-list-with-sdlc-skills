import { test, expect } from "@playwright/test";
import { Client } from "pg";

// FEAT-011 T8 — the next thing a user came for, end to end against the real
// stack (web shell -> BFF proxy -> API -> Postgres): add a task, open its
// detail, schedule it, prioritize it, watch the list row react, then clear the
// due date and watch the overdue treatment go. [UC-010 main 1-3, alt 2a]
//
// This is also the only place the INTERCEPTED presentation (ui-design D1) can be
// exercised: soft navigation from a row opens the shell's detail panel, while a
// direct load of the same URL renders the full page. Both are asserted, because
// "one URL, two presentations" is a claim that only a real browser can check.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-detail-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** A `datetime-local` value, N days from now, at 09:00 local. */
function localDateTime(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

test("UC-010: open a task, schedule it, prioritize it, then clear the due date", async ({
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

  await page.getByTestId("quick-add-input").fill("Renew passport");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  // Nothing set yet: no chip, no dot (the default state is the absence of a mark)
  await expect(page.getByTestId("due-chip")).toHaveCount(0);
  await expect(page.getByTestId("priority-dot")).toHaveCount(0);

  // --- open the detail by clicking the row: the INTERCEPTED panel ---
  await page.getByTestId("task-row-link").click();
  await page.waitForURL(/\/tasks\//);
  await expect(page.getByTestId("detail-panel")).toBeVisible();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  // FR-TASK-004's five details, including the list — read-only, no picker
  await expect(page.getByTestId("detail-title")).toHaveValue("Renew passport");
  await expect(page.getByTestId("detail-list")).toHaveText("Inbox");
  // Status. FEAT-011 shipped this as read-only text ("Active") and recorded
  // that the control was FEAT-012's; FEAT-012 delivered it, so the assertion
  // moves to the control — an unchecked checkbox offering "Mark complete",
  // which states strictly more than the old text did. Updated toward the
  // design, not toward the code.
  await expect(page.getByTestId("detail-status")).toHaveText("Mark complete");
  await expect(
    page.getByTestId("detail-status").getByTestId("task-checkbox"),
  ).toHaveAttribute("data-completed", "false");

  // --- FR-TASK-005: edit the title, saved on blur (no Save button) ---
  await page.getByTestId("detail-title").fill("Renew passport urgently");
  await page.getByTestId("detail-title").blur();
  await expect(page.getByTestId("detail-title")).toHaveValue(
    "Renew passport urgently",
  );

  // --- FR-TASK-006/007: a PAST due date, which is legal and immediately overdue
  await page.getByTestId("detail-due").fill(localDateTime(-3));
  await expect(page.getByTestId("detail-due-clear")).toBeVisible();
  // The word, not just the colour (design.md §5 — never colour alone)
  await expect(
    page.getByTestId("detail-due").locator("xpath=..").getByTestId("due-chip"),
  ).toContainText("Overdue");

  // --- FR-TASK-008: priority, shown with its LABEL in the detail view ---
  await page.getByTestId("detail-priority").getByRole("radio", { name: /High/ }).click();
  await expect(
    page.getByTestId("detail-priority").getByRole("radio", { name: /High/ }),
  ).toHaveAttribute("aria-checked", "true");

  // --- close the panel and see the list row carry both indicators ---
  await page.keyboard.press("Escape"); // design.md §5: Esc closes panels
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await expect(page.getByTestId("task-row")).toContainText(
    "Renew passport urgently",
  );
  await expect(page.getByTestId("due-chip")).toHaveAttribute(
    "data-overdue",
    "true",
  );
  await expect(page.getByTestId("due-chip")).toContainText("Overdue");
  await expect(page.getByTestId("priority-dot")).toHaveAttribute(
    "data-priority",
    "high",
  );

  // --- UC-010 alt 2a: clearing the due date removes the overdue treatment ---
  await page.getByTestId("task-row-link").click();
  await expect(page.getByTestId("detail-panel")).toBeVisible();
  await page.getByTestId("detail-due-clear").click();
  await expect(page.getByTestId("detail-due-clear")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("due-chip")).toHaveCount(0);
  // ...while the priority it never mentioned survives (technical-design D4)
  await expect(page.getByTestId("priority-dot")).toHaveAttribute(
    "data-priority",
    "high",
  );
});

test("ui-design D1: the same URL is a panel on soft navigation and a full page on direct load", async ({
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

  await page.getByTestId("quick-add-input").fill("Deep-linkable");
  await page.keyboard.press("Enter");
  await page.getByTestId("task-row-link").click();
  await page.waitForURL(/\/tasks\//);

  // Soft navigation → the shell's detail host, over the list.
  await expect(page.getByTestId("detail-panel")).toBeVisible();
  const url = page.url();

  // Hard navigation to the SAME url → the full page, no panel. This is what
  // makes the detail refreshable, bookmarkable and shareable; a client-only
  // panel would lose the task here.
  await page.goto(url);
  await expect(page.getByTestId("task-detail")).toBeVisible();
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("detail-title")).toHaveValue("Deep-linkable");
  await expect(page.getByTestId("detail-back")).toBeVisible();
});

test("UC-009 step 2: quick-add can set a due date and priority at creation", async ({
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

  // The affordances design.md's `quick-add` always specified, which FEAT-010
  // deferred to this feature.
  await page.getByTestId("quick-add-due").fill(localDateTime(2));
  await page.getByTestId("quick-add-priority").selectOption("medium");
  await page.getByTestId("quick-add-input").fill("Book the flights");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await expect(page.getByTestId("due-chip")).toBeVisible();
  await expect(page.getByTestId("due-chip")).toHaveAttribute(
    "data-overdue",
    "false",
  );
  await expect(page.getByTestId("priority-dot")).toHaveAttribute(
    "data-priority",
    "medium",
  );

  // Both affordances reset, so the next task does not inherit a stale date.
  await expect(page.getByTestId("quick-add-due")).toHaveValue("");
  await expect(page.getByTestId("quick-add-priority")).toHaveValue("none");

  // ...and a title-only create still works exactly as it did before (D8).
  await page.getByTestId("quick-add-input").fill("Plain task");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(2);
  await expect(page.getByTestId("due-chip")).toHaveCount(1); // only the first
});

test("AC-13: a rejected edit shows the field error and KEEPS what the user typed", async ({
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

  await page.getByTestId("quick-add-input").fill("Keeps its name");
  await page.keyboard.press("Enter");
  await page.getByTestId("task-row-link").click();
  await expect(page.getByTestId("detail-panel")).toBeVisible();

  // A whitespace-only title fails FR-TASK-002. design.md §6's voice is "we kept
  // your changes — try again", so the field must NOT silently revert: losing a
  // user's typing to a validation error is the failure NFR-REL-004 names.
  await page.getByTestId("detail-title").fill("   ");
  await page.getByTestId("detail-title").blur();

  await expect(page.getByTestId("detail-title-error")).toBeVisible();
  await expect(page.getByTestId("detail-title")).toHaveValue("   ");

  // The rest of the panel stays operable — a failure on one field does not
  // freeze the others, which is the point of saving per field.
  await page.getByTestId("detail-priority").getByRole("radio", { name: /Low/ }).click();
  await expect(
    page.getByTestId("detail-priority").getByRole("radio", { name: /Low/ }),
  ).toHaveAttribute("aria-checked", "true");

  // ...and nothing was stored for the bad title.
  await page.reload();
  await expect(page.getByTestId("detail-title")).toHaveValue("Keeps its name");
});

test("R2/design.md §5: the panel traps focus while open and restores it on close", async ({
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

  await page.getByTestId("quick-add-input").fill("Focus me");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);

  // Open from the row, by keyboard, so there is a real opener to restore to.
  await page.getByTestId("task-row-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail-panel")).toBeVisible();

  // The panel declares aria-modal="true"; that claim must be true. Tab all the
  // way round and confirm focus never leaves the panel — before this fix it
  // walked straight out into the list behind the scrim.
  const insidePanel = async () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-testid="detail-panel"]');
      return !!panel && panel.contains(document.activeElement);
    });

  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await insidePanel()).toBe(true);
  }
  // ...and backwards too.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await insidePanel()).toBe(true);
  }

  // On close, focus returns to the row that opened it (design.md §5).
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("task-row-link")).toBeFocused();
});

test("FR-AUTHZ-003: an unknown task id renders one uniform not-found, in the shell", async ({
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

  await page.goto("/tasks/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("task-not-found")).toBeVisible();
  // The shell stays operable — a data failure never strands the frame.
  await expect(page.getByTestId("lists-nav")).toBeVisible();
});

/**
 * WCAG 2.1 contrast ratio between two `rgb(r, g, b)` strings, as the browser
 * reports computed styles. Lives here rather than in a helper module because
 * this is the only suite that measures colour today; move it when a second one
 * needs it.
 */
function contrastRatio(fg: string, bg: string): number {
  const parse = (c: string): number[] => {
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) throw new Error(`unparseable colour: ${c}`);
    return m.slice(0, 3).map(Number);
  };
  const lum = (rgb: number[]): number => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(parse(fg)), lum(parse(bg))];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * DEF-004 regression guard, and the first automated contrast check in the
 * project.
 *
 * design.md §5 requires **4.5:1** for text at `caption` (12px) size, and the
 * due-date `chip` is the component that has failed it twice: DEF-003 fixed the
 * overdue variant's text and action, and DEF-004 is the ORDINARY variant —
 * `--color-text-muted` on `--color-surface-sunken`, which measures 4.34:1.
 *
 * Asserted as a RATIO computed from the rendered colours rather than as
 * expected hex values, deliberately: the criterion is the ratio, so a future
 * token change that keeps the rule stays green while one that breaks it goes
 * red — which a hardcoded-colour assertion could not tell apart.
 */
test("NFR-USE-004 / design.md §5: both due-chip variants meet 4.5:1 [DEF-004]", async ({
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

  await page.getByTestId("quick-add-input").fill("Contrast check");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);

  const chipColours = async () =>
    page
      .getByTestId("task-row")
      .getByTestId("due-chip")
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor };
      });

  // --- the ORDINARY variant: a due date that has not passed (DEF-004) ---
  await page.getByTestId("task-row-link").click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  await page.getByTestId("detail-due").fill(localDateTime(3));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("due-chip")).toHaveAttribute(
    "data-overdue",
    "false",
  );

  const upcoming = await chipColours();
  const upcomingRatio = contrastRatio(upcoming.color, upcoming.background);
  expect(
    upcomingRatio,
    `upcoming due chip ${upcoming.color} on ${upcoming.background} = ${upcomingRatio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(4.5);

  // --- the OVERDUE variant: the one DEF-003 already fixed, guarded so it
  //     cannot regress while the other is being changed ---
  await page.getByTestId("task-row-link").click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  await page.getByTestId("detail-due").fill(localDateTime(-3));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("due-chip")).toHaveAttribute(
    "data-overdue",
    "true",
  );

  const overdue = await chipColours();
  const overdueRatio = contrastRatio(overdue.color, overdue.background);
  expect(
    overdueRatio,
    `overdue due chip ${overdue.color} on ${overdue.background} = ${overdueRatio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(4.5);

  // --- the SECOND instance of DEF-004: the sidebar count badge, which uses the
  //     identical muted-on-sunken pairing at the identical size. Found by
  //     grepping the pairing rather than by stopping at the reported component,
  //     and guarded here so the two cannot drift apart again. ---
  const badge = await page
    .getByTestId("list-count")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
  const badgeRatio = contrastRatio(badge.color, badge.background);
  expect(
    badgeRatio,
    `sidebar count badge ${badge.color} on ${badge.background} = ${badgeRatio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(4.5);
});
