import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import type { AccountExportDocument } from "@todo/shared";

// FEAT-017 T7 — data export (UC-015) wired end-to-end against the real stack
// (web shell → BFF proxy → API → Postgres). The path this feature completes:
// sign in → Security & account → Export → a real file arrives.
//
// The file is the product here, so the assertions read the DOWNLOADED BYTES
// rather than the API response: a screen that shows "ready" while handing the
// browser an empty or malformed blob would pass any check made earlier in the
// chain.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";
const MIN_BODY = 4.5;

const uniqueEmail = () =>
  `e2e-export-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function sql(text: string, params: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function markVerified(email: string): Promise<void> {
  await sql("UPDATE users SET verified_at = now() WHERE email = $1", [email]);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

/** WCAG 2.1 contrast ratio between two `rgb(...)` strings — the same
 * computation the sibling accessibility guards use (a ratio, not a hex, so a
 * token change that keeps the rule stays green). */
function contrastRatio(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) throw new Error(`unparseable colour: ${c}`);
    const [r, g, bl] = m
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

async function registerWithData(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
): Promise<void> {
  expect(
    (
      await request.post(`${API}/auth/register`, {
        data: { email, password: PW },
      })
    ).status(),
  ).toBe(201);
  await markVerified(email);

  // A second list, so "all of the user's current lists" means more than one.
  await sql(
    `INSERT INTO lists (owner_id, name, position)
     SELECT id, 'Work', 1 FROM users WHERE email = $1`,
    [email],
  );
  // One active, one completed, one soft-deleted — the three states FR-DATA-002
  // and D7 distinguish between.
  await sql(
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

test("UC-015: a signed-in user exports their data and gets a real file", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);

  await signIn(page, email);

  // UC-015 main 1 — reached through the settings hub, not by typing a URL.
  await page.getByTestId("nav-settings").click();
  await page.waitForURL("/settings/profile");
  await page.getByTestId("settings-tab-inactive").click();
  await page.waitForURL("/settings/security");
  await page.getByTestId("row-export").click();
  await page.waitForURL("/settings/security/export");

  // AC-13's return leg: the screen links back to the hub it came from.
  await expect(page.getByTestId("back-to-security")).toBeVisible();

  // UC-015 main 2-3 — the download itself.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-button").click(),
  ]);

  // AC-12: the filename follows the shared rule.
  expect(download.suggestedFilename()).toMatch(
    /^todo-export-\d{4}-\d{2}-\d{2}\.json$/,
  );

  // The bytes the browser actually received — not the API's response.
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const doc = JSON.parse(
    Buffer.concat(chunks).toString("utf8"),
  ) as AccountExportDocument;

  // AC-1
  expect(Object.keys(doc).sort()).toEqual([
    "account",
    "exportedAt",
    "formatVersion",
    "lists",
  ]);
  expect(doc.formatVersion).toBe(1);
  expect(doc.account.email).toBe(email);

  // AC-2 — every list, Inbox first.
  expect(doc.lists.map((l) => l.name)).toEqual(["Inbox", "Work"]);
  expect(doc.lists[0].isDefault).toBe(true);
  expect(doc.lists[1].tasks).toEqual([]);

  // AC-3 — active and completed both present, with the right completedAt.
  const inbox = doc.lists[0];
  const titles = inbox.tasks.map((t) => t.title).sort();
  expect(titles).toEqual(["Already finished", "Still to do"]);
  expect(inbox.tasks.find((t) => t.title === "Still to do")!.completedAt).toBeNull();
  expect(
    inbox.tasks.find((t) => t.title === "Already finished")!.completedAt,
  ).toMatch(/Z$/);

  // AC-4 — the soft-deleted task is nowhere in the FILE, not merely absent
  // from one array.
  expect(JSON.stringify(doc)).not.toContain("Thrown away");

  // AC-8 — no credential material reached the user's disk.
  const serialized = JSON.stringify(doc);
  for (const forbidden of ["password", "token", "verified_at", "verifiedAt"]) {
    expect(serialized).not.toContain(forbidden);
  }

  // AC-12 — the ready state names the file and counts what is in it.
  await expect(page.getByTestId("export-ready")).toBeVisible();
  await expect(page.getByTestId("export-filename")).toHaveText(
    download.suggestedFilename(),
  );
  await expect(page.getByTestId("export-counts")).toHaveText("2 lists · 2 tasks.");
});

test("AC-14: a failed export shows an error state and downloads nothing", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);
  await signIn(page, email);

  await page.goto("/settings/security/export");
  await page.route("**/api/account/export", (route) =>
    route.fulfill({ status: 500, body: '{"code":"internal_error"}' }),
  );

  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await page.getByTestId("export-button").click();
  await expect(page.getByTestId("export-error")).toBeVisible();
  expect(downloaded).toBe(false);

  // The session survives a failed export — this is not an auth failure.
  await expect(page.getByTestId("export-button")).toBeEnabled();

  // AC-15: the danger tint takes its partner ink. Measured on what the browser
  // painted, in the theme it painted it in — `--color-danger` here would be
  // 3.95:1, the pairing DEF-006 fixed in seven other places.
  const alert = page.getByTestId("export-error");
  const pairing = await alert.evaluate((el) => ({
    fg: getComputedStyle(el).color,
    bg: getComputedStyle(el).backgroundColor,
  }));
  expect(
    contrastRatio(pairing.fg, pairing.bg),
    `export error alert measures ${contrastRatio(pairing.fg, pairing.bg).toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(MIN_BODY);

  // The retry link inside the tint carries its own colour — the exact shape
  // DEF-006 found had been missed twice.
  const retry = await page
    .getByTestId("export-retry")
    .evaluate((el) => getComputedStyle(el).color);
  expect(contrastRatio(retry, pairing.bg)).toBeGreaterThanOrEqual(MIN_BODY);

  // Retry works: unroute, click, and the download arrives.
  await page.unroute("**/api/account/export");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-retry").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^todo-export-/);
  await expect(page.getByTestId("export-ready")).toBeVisible();
});

test("AC-15: the export screen's controls show the design system's focus ring", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await registerWithData(request, email);
  await signIn(page, email);
  await page.goto("/settings/security/export");

  // Tab first: `:focus-visible` is a heuristic on input MODALITY, and on a
  // <button> Chromium matches it only while the user is navigating by keyboard
  // — a bare programmatic .focus() reports `outline: none` (DEF-009's note).
  await page.keyboard.press("Tab");
  await page.getByTestId("export-button").focus();

  const ring = await page
    .getByTestId("export-button")
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });

  expect(ring.style).not.toBe("none");
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
});

test("AC-6: the export screen is not reachable signed out", async ({ page }) => {
  await page.goto("/settings/security/export");

  await page.waitForURL(/\/signin/);
});
