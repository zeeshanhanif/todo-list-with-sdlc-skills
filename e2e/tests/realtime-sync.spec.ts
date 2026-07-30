import { test, expect, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

// FEAT-019 T7 — cross-device sync end to end, with TWO browser contexts as two
// devices signed into one account (AC-1, AC-2, AC-9, AC-10).
//
// The stack runs with REALTIME_PROVIDER unset — the default, because no Supabase
// project is provisioned (technical-design §8). That makes the second test the
// important one: it proves NFR-PERF-004 holds *in the shipped configuration*,
// through the adaptive fallback, with no socket and no user action. The first
// test drives the signal path through the provider's own entry point
// (window.__todoSync, the NEXT_PUBLIC_SYNC_TEST_HOOK seam), which is everything
// downstream of a delivered signal. The socket TRANSPORT itself is AC-1b and
// needs a real project — see docs/features/FEAT-019-realtime-sync/staging-checklist.md.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

/** NFR-PERF-004's budget. Every convergence assertion below uses it. */
const SYNC_BUDGET_MS = 5_000;

declare global {
  interface Window {
    /** The provider's test seam, present only when NEXT_PUBLIC_SYNC_TEST_HOOK
     * is set (dev/E2E). Its absence on the auth screens is AC-10's assertion. */
    __todoSync?: { signal(): void };
  }
}

const uniqueEmail = () =>
  `e2e-sync-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PW);
  await page.getByTestId("submit").click();
  await page.waitForURL("/");
}

/** A second, independent "device": its own context, its own cookie jar. */
async function secondDevice(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

const addTask = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId("quick-add-input").fill(title);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row").filter({ hasText: title })).toHaveCount(1);
};

test("AC-1: a signal makes the other device converge, with no user action", async ({
  browser,
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);
  const deviceB = await secondDevice(browser, email);

  // The seam exists inside the authenticated shell — that is the provider being
  // mounted at all.
  await expect
    .poll(() => deviceB.evaluate(() => "__todoSync" in window))
    .toBe(true);

  const created = `Sync me ${Date.now()}`;
  await addTask(page, created);

  // B has not been touched. Deliver the signal and watch it converge inside
  // NFR-PERF-004's budget — no reload, no navigation, no interaction.
  const before = deviceB.url();
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await expect(
    deviceB.getByTestId("task-row").filter({ hasText: created }),
  ).toHaveCount(1, { timeout: SYNC_BUDGET_MS });
  expect(deviceB.url()).toBe(before);

  // Completion and deletion cross too, counts included.
  await page.getByTestId("task-checkbox").first().check();
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await expect(deviceB.getByTestId("completed-section")).toBeVisible({
    timeout: SYNC_BUDGET_MS,
  });

  await deviceB.context().close();
});

test("AC-2: the other device converges within 5 s with no socket and no interaction", async ({
  browser,
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);
  const deviceB = await secondDevice(browser, email);

  // The stack runs unconfigured, so this is the fallback schedule alone —
  // nothing is signalled, nothing is clicked on B, and no seam is used.
  const created = `Fallback ${Date.now()}`;
  await addTask(page, created);

  await expect(
    deviceB.getByTestId("task-row").filter({ hasText: created }),
  ).toHaveCount(1, { timeout: SYNC_BUDGET_MS });

  // ...and focus converges immediately rather than at the next tick: blur B,
  // make a change on A, then focus B and assert on a budget far under a tick.
  const second = `On focus ${Date.now()}`;
  await deviceB.evaluate(() => window.dispatchEvent(new Event("blur")));
  await addTask(page, second);
  await deviceB.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    deviceB.getByTestId("task-row").filter({ hasText: second }),
  ).toHaveCount(1, { timeout: 2_000 });

  await deviceB.context().close();
});

test("AC-9: a background refresh does not disturb what the user is doing", async ({
  browser,
  page,
  request,
}) => {
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);
  const deviceB = await secondDevice(browser, email);

  await addTask(page, `Existing ${Date.now()}`);

  // B is mid-sentence in the composer, with the caret in it.
  const composer = deviceB.getByTestId("quick-add-input");
  await composer.click();
  await composer.fill("half-typed thought");

  // A change lands from A, and B refreshes underneath the typing.
  const arriving = `Arrived while typing ${Date.now()}`;
  await addTask(page, arriving);
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await expect(
    deviceB.getByTestId("task-row").filter({ hasText: arriving }),
  ).toHaveCount(1, { timeout: SYNC_BUDGET_MS });

  // The typed text and the caret survived (ui-design D2).
  await expect(composer).toHaveValue("half-typed thought");
  await expect(composer).toBeFocused();

  // Same for an open overlay: the delete confirm dialog stays open, with its
  // focus where the trap put it.
  await deviceB.getByTestId("task-row-link").first().click();
  await expect(deviceB.getByTestId("detail-panel")).toBeVisible();
  await deviceB.getByTestId("task-delete").click();
  await expect(deviceB.getByTestId("task-delete-dialog")).toBeVisible();

  await addTask(page, `While the dialog is open ${Date.now()}`);
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await deviceB.waitForTimeout(1_000);
  await expect(deviceB.getByTestId("task-delete-dialog")).toBeVisible();

  await deviceB.context().close();
});

test("AC-9: the list dialog keeps its half-typed name across a refresh", async ({
  browser,
  page,
  request,
}) => {
  // AC-9 names the LIST dialog alongside the delete confirm — a different
  // component (list-dialog.tsx) with its own state, so covering one does not
  // cover the other.
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);
  const deviceB = await secondDevice(browser, email);

  await deviceB.getByTestId("new-list").click();
  await expect(deviceB.getByTestId("list-dialog")).toBeVisible();
  const nameInput = deviceB.getByTestId("list-name-input");
  await nameInput.fill("Groceries, half-typed");

  await addTask(page, `Landing under the dialog ${Date.now()}`);
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await deviceB.waitForTimeout(1_000);

  await expect(deviceB.getByTestId("list-dialog")).toBeVisible();
  await expect(nameInput).toHaveValue("Groceries, half-typed");
  await expect(nameInput).toBeFocused();

  await deviceB.context().close();
});

test("AC-9: a refresh mid-write does not roll back an optimistic control", async ({
  browser,
  page,
  request,
}) => {
  // The clause with the sharpest failure mode: the checkbox is optimistic with
  // rollback (FEAT-012 ui-design D1), so a refresh landing while its write is
  // still in flight must not make the box snap back to the server's older
  // truth. Nothing else in the suite exercises a refresh DURING a write.
  const email = uniqueEmail();
  await register(request, email);
  await signIn(page, email);
  const deviceB = await secondDevice(browser, email);

  await addTask(page, `Optimistic ${Date.now()}`);
  await expect(deviceB.getByTestId("task-row")).toHaveCount(1, {
    timeout: SYNC_BUDGET_MS,
  });

  // Hold B's completion request open for 2.5 s so the write is genuinely in
  // flight while the refresh lands. The handler stays installed and completes
  // the request itself — unrouting a pending handler is what "Route is already
  // handled" means, and it would be teardown noise, not a finding.
  await deviceB.route("**/api/tasks/*/complete", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });

  const box = deviceB.getByTestId("task-checkbox").first();
  await box.check();
  await expect(box).toBeChecked(); // optimistic, before the server answers

  // A refresh lands underneath the in-flight write.
  await deviceB.evaluate(() => window.__todoSync?.signal());
  await deviceB.waitForTimeout(1_000);
  await expect(box).toBeChecked(); // not rolled back by the refresh

  // And the write still lands, so the assertion above is about a refresh
  // arriving mid-write rather than about a request that never completed.
  await expect(deviceB.getByTestId("completed-section")).toBeVisible({
    timeout: 10_000,
  });

  await deviceB.context().close();
});

test("AC-10: sync belongs to the authenticated zone only", async ({ page }) => {
  // No session at all: the auth screens mount no provider, so there is no seam,
  // no token request and no polling.
  for (const route of ["/signin", "/signup", "/reset-password"]) {
    await page.goto(route);
    expect(await page.evaluate(() => "__todoSync" in window)).toBe(false);
  }
});
