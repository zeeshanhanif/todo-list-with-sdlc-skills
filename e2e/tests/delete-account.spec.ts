import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { assertTheme, contrastRatio, useTheme } from "./contrast";

// FEAT-018 T8 — account deletion (UC-016) wired end-to-end against the real
// stack (web shell → BFF proxy → API → Postgres). The path this feature
// completes: sign in → Security & account → Delete account → the warning names
// what will be lost → a wrong password is refused with the data still there →
// the correct password deletes → the confirmation renders → the app is signed
// out → the same email registers again.
//
// The assertions read the DATABASE either side of the destructive step, not the
// screen's own claims: a UI that says "deleted" while rows survive is precisely
// the failure this feature cannot have.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";
const MIN_BODY = 4.5;

const uniqueEmail = () =>
  `e2e-delete-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

/** Register + verify + seed a second list and three tasks — one active, one
 * completed, one soft-deleted. The soft-deleted one matters: it is counted in
 * the warning (ui-design D4) and destroyed with the rest. */
async function registerWithData(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
): Promise<void> {
  expect(
    (await request.post(`${API}/auth/register`, { data: { email, password: PW } }))
      .status(),
  ).toBe(201);
  await query("UPDATE users SET verified_at = now() WHERE email = $1", [email]);
  await query(
    `INSERT INTO lists (owner_id, name, position)
     SELECT id, 'Work', 1 FROM users WHERE email = $1`,
    [email],
  );
  await query(
    `INSERT INTO tasks (owner_id, list_id, title, completed_at, deleted_at)
     SELECT u.id, l.id, v.title, v.completed, v.deleted
       FROM users u
       JOIN lists l ON l.owner_id = u.id AND l.is_default = true
       CROSS JOIN (VALUES
         ('Still to do', NULL::timestamptz, NULL::timestamptz),
         ('Already finished', now(), NULL::timestamptz),
         ('Thrown away', NULL::timestamptz, now())
       ) AS v(title, completed, deleted)
      WHERE u.email = $1`,
    [email],
  );
}

/** Every row the account owns, per table. */
async function rowCounts(userId: string): Promise<Record<string, number>> {
  const [row] = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM users    WHERE id       = $1) AS users,
            (SELECT count(*) FROM lists    WHERE owner_id = $1) AS lists,
            (SELECT count(*) FROM tasks    WHERE owner_id = $1) AS tasks,
            (SELECT count(*) FROM sessions WHERE user_id  = $1) AS sessions`,
    [userId],
  );
  return {
    users: Number(row.users),
    lists: Number(row.lists),
    tasks: Number(row.tasks),
    sessions: Number(row.sessions),
  };
}

test("UC-016: a signed-in user deletes their account, and the address is free again", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);
  const [{ id: userId }] = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );

  await signIn(page, email);

  // UC-016 main 1 — reached through the settings hub, not by typing a URL.
  await page.getByTestId("nav-settings").click();
  await page.waitForURL("/settings/profile");
  await page.getByTestId("settings-tab-inactive").click();
  await page.waitForURL("/settings/security");

  // AC-18 says the row is **keyboard-reachable**, so it is reached by keyboard
  // rather than by click — a click would pass on a div with an onClick handler,
  // which is what this criterion exists to rule out.
  const row = page.getByTestId("row-delete");
  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await row.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "the Delete account row never received keyboard focus").toBe(
    true,
  );
  await page.keyboard.press("Enter");
  await page.waitForURL("/settings/security/delete");

  // AC-18's return leg: the screen links back to the hub it came from.
  await expect(page.getByTestId("back-to-security")).toBeVisible();

  // AC-18's other half: the row is *visually* marked as the destructive one —
  // a mark in the danger token, not just different words (ui-design D6). Read
  // as a computed colour rather than a class name, so a refactor that keeps the
  // markup but drops the token fails here.
  await page.goBack();
  await page.waitForURL("/settings/security");
  const markStroke = await page
    .getByTestId("row-delete")
    .locator("svg")
    .evaluate((el) => getComputedStyle(el).stroke);
  const rowColours = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      danger: root.getPropertyValue("--color-danger").trim(),
      text: root.getPropertyValue("--color-text").trim(),
    };
  });
  const asRgb = async (hex: string) =>
    page.evaluate((h) => {
      const probe = document.createElement("span");
      probe.style.color = h;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, hex);
  expect(markStroke).toBe(await asRgb(rowColours.danger));
  // …and the LABEL is not the danger token: on this row's hovered background
  // (`--color-surface-sunken`) danger text measures 4.41:1, under §5's 4.5:1,
  // which is why the mark carries the meaning instead (ui-design D6).
  const labelColour = await page
    .getByTestId("row-delete")
    .locator("span")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(labelColour).toBe(await asRgb(rowColours.text));
  await page.getByTestId("row-delete").click();
  await page.waitForURL("/settings/security/delete");

  // AC-15 (before): permanence, quantified, with the export offered first.
  await expect(page.getByTestId("delete-warning")).toContainText("permanent");
  // Two lists and three tasks were seeded — the third task is soft-deleted, and
  // it IS counted here (ui-design D4), which is the number's whole subtlety.
  await expect(page.getByTestId("delete-counts")).toContainText("2 lists");
  await expect(page.getByTestId("delete-counts")).toContainText("3 tasks");
  await expect(page.getByTestId("export-first")).toHaveAttribute(
    "href",
    "/settings/security/export",
  );

  const before = await rowCounts(userId);
  expect(before).toEqual({ users: 1, lists: 2, tasks: 3, sessions: 1 });

  // UC-016 alt 2a — cancelling the dialog changes nothing.
  await page.getByTestId("delete-password").fill(PW);
  await page.getByTestId("delete-button").click();
  await expect(page.getByTestId("delete-dialog")).toBeVisible();
  // AC-16 / ui-design D3: the SAFE button holds focus, so a stray Enter after
  // the password field cannot destroy the account.
  await expect(page.getByTestId("delete-dialog-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("delete-dialog")).toBeHidden();
  expect(await rowCounts(userId)).toEqual(before);

  // UC-016 alt 3a — a wrong password is refused, and nothing is deleted.
  await page.getByTestId("delete-password").fill("not-my-password");
  await page.getByTestId("delete-button").click();
  await page.getByTestId("delete-dialog-confirm").click();
  await expect(page.getByTestId("delete-password-error")).toContainText(
    "Nothing has been deleted",
  );
  await expect(page.getByTestId("delete-dialog")).toBeHidden();
  expect(await rowCounts(userId)).toEqual(before);
  // The session survived the refusal — the user is still on the screen, not
  // bounced to sign-in (technical-design D4: 400, not 401).
  await expect(page.getByTestId("delete-card")).toBeVisible();

  // UC-016 main 3-4 — the real thing.
  await page.getByTestId("delete-password").fill(PW);
  await page.getByTestId("delete-button").click();
  await expect(page.getByTestId("delete-dialog-body")).toContainText("2 lists");
  await page.getByTestId("delete-dialog-confirm").click();

  // AC-15 (after) / AC-17: the confirmation renders in place, while signed out.
  await expect(page.getByTestId("deleted-card")).toBeVisible();
  await expect(page.getByTestId("deleted-card")).toContainText(email);
  expect(
    await page
      .context()
      .cookies()
      .then((cs) => cs.find((c) => c.name === "sid")?.value),
  ).toBeFalsy();

  // AC-2: every table, empty — asserted against the database, not the screen.
  expect(await rowCounts(userId)).toEqual({
    users: 0,
    lists: 0,
    tasks: 0,
    sessions: 0,
  });

  // AC-11: the audit row survived the cascade that erased everything else.
  const audit = await query<{ user_id: string | null; detail: { userId: string } }>(
    `SELECT user_id, detail FROM audit_log
      WHERE event = 'account_deleted' AND detail->>'userId' = $1`,
    [userId],
  );
  expect(audit).toHaveLength(1);
  expect(audit[0].user_id).toBeNull();

  // AC-17's second half: the next navigation lands on sign-in, not on an
  // authenticated screen.
  await page.getByTestId("deleted-signin").click();
  await page.waitForURL(/\/signin/);

  // AC-4: the address is free — the same email registers a brand-new account.
  const again = await request.post(`${API}/auth/register`, {
    data: { email, password: PW },
  });
  expect(again.status()).toBe(201);
  const [fresh] = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  expect(fresh.id).not.toBe(userId);

  // Clean up the account this test just created by re-registering.
  await query("DELETE FROM users WHERE email = $1", [email]);
});

test("AC-3: deleting on one device signs the other one out", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);

  // Two independent browser contexts = two devices with their own sessions.
  const first = await browser.newContext();
  const second = await browser.newContext();
  const deviceA = await first.newPage();
  const deviceB = await second.newPage();
  await signIn(deviceA, email);
  await signIn(deviceB, email);

  // Device B is genuinely signed in before the deletion.
  await deviceB.goto("/settings/security");
  await expect(deviceB.getByTestId("security-hub")).toBeVisible();

  await deviceA.goto("/settings/security/delete");
  await deviceA.getByTestId("delete-password").fill(PW);
  await deviceA.getByTestId("delete-button").click();
  await deviceA.getByTestId("delete-dialog-confirm").click();
  await expect(deviceA.getByTestId("deleted-card")).toBeVisible();

  // Device B's next navigation resolves no session and lands on sign-in
  // (FR-DATA-005 — its session was revoked by the cascade, not by anything the
  // client did).
  await deviceB.goto("/settings/security");
  await deviceB.waitForURL(/\/signin/);

  await first.close();
  await second.close();
  await query("DELETE FROM users WHERE email = $1", [email]);
});

test("AC-19: the delete screen's danger surfaces clear 4.5:1 in BOTH themes", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);
  await signIn(page, email);

  /** The element's own colour against its PAINTED background — composited, the
   * discipline DEF-012 forced (the dark tints are rgba(…, 0.15) over the
   * surface, so the declared value is a colour no pixel ever had). */
  const ratioOf = async (testId: string): Promise<number> => {
    const pair = await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)!;
      const parse = (c: string): number[] => {
        const m = c.match(/[\d.]+/g)!.map(Number);
        return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
      };
      const painted = (node: Element | null): number[] => {
        while (node) {
          const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
          if (a === 1) return [r, g, b];
          if (a > 0) {
            const [br, bg, bb] = painted(node.parentElement);
            return [a * r + (1 - a) * br, a * g + (1 - a) * bg, a * b + (1 - a) * bb];
          }
          node = node.parentElement;
        }
        return [255, 255, 255];
      };
      const [r, g, b] = painted(el);
      return { fg: getComputedStyle(el).color, bg: `rgb(${r}, ${g}, ${b})` };
    }, testId);
    return contrastRatio(pair.fg, pair.bg);
  };

  for (const theme of ["light", "dark"] as const) {
    await useTheme(page, theme);
    await page.goto("/settings/security/delete");
    await assertTheme(page, theme);

    // The permanence notice, on the danger tint — the pairing DEF-006 was about.
    await expect(page.getByTestId("delete-warning")).toBeVisible();
    expect(
      await ratioOf("delete-warning"),
      `${theme}: the permanence alert`,
    ).toBeGreaterThanOrEqual(MIN_BODY);

    // The field error, on the card's surface.
    await page.getByTestId("delete-password").fill("wrong-password");
    await page.getByTestId("delete-button").click();
    await page.getByTestId("delete-dialog-confirm").click();
    await expect(page.getByTestId("delete-password-error")).toBeVisible();
    expect(
      await ratioOf("delete-password-error"),
      `${theme}: the password field error`,
    ).toBeGreaterThanOrEqual(MIN_BODY);

    // The form-level alert and the retry control inside it, on the danger tint.
    await page.route("**/api/account/delete", (route) => route.abort());
    await page.getByTestId("delete-password").fill("whatever");
    await page.getByTestId("delete-button").click();
    await page.getByTestId("delete-dialog-confirm").click();
    await expect(page.getByTestId("delete-error")).toBeVisible();
    expect(
      await ratioOf("delete-error"),
      `${theme}: the form-level alert`,
    ).toBeGreaterThanOrEqual(MIN_BODY);
    expect(
      await ratioOf("delete-retry"),
      `${theme}: the retry control inside the alert`,
    ).toBeGreaterThanOrEqual(MIN_BODY);
    await page.unroute("**/api/account/delete");
  }

  await query("DELETE FROM users WHERE email = $1", [email]);
});

test("AC-7: the delete screen is not reachable signed out", async ({ page }) => {
  await page.goto("/settings/security/delete");

  await page.waitForURL(/\/signin/);
});
