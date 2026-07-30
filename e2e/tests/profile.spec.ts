import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-008 T10 — profile & settings (UC-007) wired end-to-end against the real
// stack (web shell -> BFF proxy -> API -> Postgres). This is the suite's first
// coverage of the DARK THEME, which the design system has specified since
// ux-foundations and which no screen could reach until this feature.
//
// Covers UC-007 main 1-4 and alt 3a/4a: view, edit display name, timezone and
// theme; the theme applying without a reload and surviving one; a due date
// re-reading in the chosen zone (FR-PROF-003); and the pre-paint application
// that AC-11 is really about — asserted on the FIRST paint of a fresh
// navigation, not on the settled DOM.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** Seed one task with a due date, so the zone change has something to re-read. */
async function seedDueTask(email: string, dueAtIso: string): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       SELECT u.id, l.id, 'Zoned task', $2::timestamptz
         FROM users u
         JOIN lists l ON l.owner_id = u.id AND l.is_default = true
        WHERE u.email = $1`,
      [email, dueAtIso],
    );
  } finally {
    await client.end();
  }
}

const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

test("UC-007: a signed-in user views and edits their profile, and it sticks", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  const registered = await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  expect(registered.status()).toBe(201);
  await markVerified(email);
  // Two days out at 02:30Z: inside the window where design.md §6 renders a
  // weekday AND a time, so the zone's effect on the clock is actually visible.
  // 02:30Z is 08:00 in India (+05:30, no DST) and the previous evening in New
  // York — one instant, a different wall clock and a different calendar day.
  // The zone is spelled `Asia/Calcutta` because that is what THIS browser's ICU
  // offers (measured: its supportedValuesOf has Calcutta, not Kolkata, and no
  // UTC at all). Which spelling a runtime prefers is an ICU-version detail —
  // exactly why the server stores the string verbatim (technical-design D2).
  const due = new Date(Date.now() + 2 * 86_400_000);
  due.setUTCHours(2, 30, 0, 0);
  await seedDueTask(email, due.toISOString());

  await signIn(page, email);

  // UC-007 main 1 — Settings now lands on Profile & Preferences (D5).
  await page.getByTestId("nav-settings").click();
  await page.waitForURL("/settings/profile");
  await expect(page.getByTestId("profile-form")).toBeVisible();

  // UC-007 main 2 — the email is shown, and shown as text, not a control.
  await expect(page.getByTestId("profile-email")).toHaveText(email);
  await expect(page.locator('input[name="email"]')).toHaveCount(0);

  // UC-007 main 3-4 — display name (FR-PROF-002)
  await page.getByLabel("Display name").fill("  Ada Lovelace  ");
  await page.getByTestId("save-display-name").click();
  await expect(page.getByTestId("profile-status")).toHaveText("Saved");
  await expect(page.getByLabel("Display name")).toHaveValue("Ada Lovelace");

  // UC-007 alt 3a — an invalid name is refused with a field error, and the
  // typed value survives (NFR-REL-004). maxLength blocks an over-long name in
  // the UI, so the reachable trigger is a pasted control character.
  await page.getByLabel("Display name").fill("Ada\u0007Lovelace");
  await page.getByTestId("save-display-name").click();
  await expect(page.getByText(/without special control characters/)).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("Ada\u0007Lovelace");

  // FR-PROF-003 — timezone (saved on change, ui-design D7)
  await page.getByLabel("Timezone").selectOption("Asia/Calcutta");
  await expect(page.getByTestId("profile-status")).toHaveText("Saved");

  // FR-PROF-004 — theme applies to the WHOLE product in the same tick, with no
  // reload (ui-design D1).
  expect(await themeAttr(page)).toBe("light");
  await page.getByLabel("Dark").check();
  await expect(page.getByTestId("profile-status")).toHaveText("Saved");
  expect(await themeAttr(page)).toBe("dark");

  // FR-PROF-005 — all three survive a reload...
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Calcutta");
  await expect(page.getByLabel("Dark")).toBeChecked();

  // AC-11 — ...and the theme is on the document at FIRST PAINT of a fresh
  // navigation. Asserted before the page has settled: `domcontentloaded` plus a
  // read of the attribute the pre-paint script sets. A useEffect-only
  // implementation shows light here and only corrects after hydration.
  const fresh = await page.context().newPage();
  await fresh.goto("/settings/profile", { waitUntil: "domcontentloaded" });
  expect(await themeAttr(fresh)).toBe("dark");
  await fresh.close();

  // UC-007 alt 4a / FR-PROF-003 — the due date now reads in the chosen zone.
  // +05:30 puts 02:30Z at 08:00 the same morning, and India has no DST, so this
  // clock is stable whatever day the suite runs on.
  await page.goto("/");
  await expect(page.getByTestId("due-chip")).toContainText("8:00");
  const inIndia = await page.getByTestId("due-chip").innerText();

  await page.getByTestId("nav-settings").click();
  await page.getByLabel("Timezone").selectOption("America/New_York");
  await expect(page.getByTestId("profile-status")).toHaveText("Saved");
  await page.goto("/");
  // Same instant, same stored row, read in a different zone: the chip must move
  // — a different clock and, at 02:30Z, the previous evening. Asserted as a
  // DIFFERENCE rather than an exact string, because New York's offset depends on
  // whether the run lands in DST, and the requirement is that the zone governs
  // the reading, not that it produces one particular clock.
  const inNewYork = await page.getByTestId("due-chip").innerText();
  expect(inNewYork).not.toBe(inIndia);
  expect(inNewYork).not.toContain("8:00");
  expect(inNewYork).toMatch(/PM/);

  // D3 — signing out clears the device mirror, so the next visitor to this
  // browser does not inherit the account's theme.
  await page.getByTestId("sign-out").click();
  await page.waitForURL("/signin");
  const mirror = (await page.context().cookies()).find((c) => c.name === "theme");
  expect(mirror?.value ?? "").not.toBe("dark");
});

test("AC-7: a first sign-in adopts the browser's timezone once", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  await markVerified(email);

  // Count what the browser sends, so "exactly once" is measured rather than
  // inferred from the end state.
  let adoptions = 0;
  await context.route("**/api/profile", (route) => {
    const req = route.request();
    if (req.method() === "PATCH" && req.postData()?.includes("timezone")) {
      adoptions += 1;
    }
    return route.continue();
  });

  await signIn(page, email);
  await expect(page.getByTestId("list-row").first()).toBeVisible();

  // The shell adopted the browser's zone on the first authenticated render...
  await page.goto("/settings/profile");
  const expected = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await expect(page.getByLabel("Timezone")).toHaveValue(expected);

  // ...and does not do it again on subsequent renders (it is no longer null).
  const afterFirst = adoptions;
  await page.goto("/");
  await page.goto("/settings/profile");
  await expect(page.getByTestId("profile-form")).toBeVisible();
  expect(adoptions).toBe(afterFirst);
  expect(afterFirst).toBe(1);
});
