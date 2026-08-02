import { test, expect } from "@playwright/test";
import {
  assertAll,
  assertTheme,
  controlBoundaries,
  useTheme,
  type Pairing,
} from "./contrast";
import { Client } from "pg";

// DEF-005's regression guard — the project's cross-cutting accessibility check
// for **control boundaries**.
//
// design.md §5 (as amended 2026-07-29): a control identified ONLY by its outline
// — `checkbox`, `radio`, `input`/`textarea`/`select` — needs **≥ 3:1** on that
// outline, because the outline is the entire visual evidence the control exists.
// Components that carry their own text or fill (`button-secondary`, cards,
// dividers) are decorative-boundary cases and are deliberately NOT asserted here.
//
// This spec belongs to no single feature: it sweeps the real screens of
// FEAT-001/002/003/005/006/009/010/011 in one pass, which is the honest shape
// for a rule that every form in the product has to keep.
//
// Asserted as a computed RATIO rather than expected hex values, for the same
// reason as the DEF-004 chip guard: the criterion is the ratio, so a future
// token change that keeps the rule stays green while one that breaks it goes
// red — a hardcoded-colour assertion cannot tell those apart.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";

const uniqueEmail = () =>
  `e2e-contrast-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function markVerified(email: string): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "UPDATE users SET verified_at = now() WHERE email = $1",
      [email],
    );
  } finally {
    await client.end();
  }
}

/**
 * Every visible outline-identified control on the page, with the colour its
 * boundary is drawn against — its own fill when it has one, otherwise the
 * nearest opaque ancestor background (which is what the eye actually compares
 * the outline to).
 */
// DEF-012: both sweeps run in BOTH themes. Until then they only ever measured
// light, so the dark theme's control boundaries were unguarded — and the shared
// helpers could not have measured them correctly anyway, since dark surfaces
// composite alpha (see ./contrast).
const MIN_NON_TEXT = 3;
const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  test(`design.md §5: every control boundary meets 3:1 — signed-out screens [DEF-005] [${theme}]`, async ({
    page,
  }) => {
    await useTheme(page, theme);
    const found: Pairing[] = [];

    await page.goto("/signup");
    await assertTheme(page, theme);
    await expect(page.getByTestId("email-input")).toBeVisible();
    found.push(...(await controlBoundaries(page, "SCR-WEB-001 sign-up")));

    await page.goto("/signin");
    await expect(page.getByTestId("email-input")).toBeVisible();
    found.push(...(await controlBoundaries(page, "SCR-WEB-004 sign-in")));

    await page.goto("/reset-password");
    await expect(page.getByTestId("email-input")).toBeVisible();
    found.push(...(await controlBoundaries(page, "SCR-WEB-005 forgot")));

    // ?token= renders the set-new-password stage; the token is only validated on
    // submit, so a probe value reaches the form.
    await page.goto("/reset-password?token=probe");
    await expect(page.getByTestId("password-input")).toBeVisible();
    found.push(
      ...(await controlBoundaries(page, "SCR-WEB-006 set new password")),
    );

    await page.goto("/verify-email?email=probe%40example.com");
    found.push(...(await controlBoundaries(page, "SCR-WEB-002 verify notice")));

    assertAll(found, MIN_NON_TEXT, `control boundaries [${theme}]`);
  });

  test(`design.md §5: every control boundary meets 3:1 — signed-in screens [DEF-005] [${theme}]`, async ({
    page,
    request,
  }) => {
    await useTheme(page, theme);
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
    await assertTheme(page, theme);

    const found: Pairing[] = [];

    // SCR-WEB-008's quick-add: title input, due input, priority select.
    await expect(page.getByTestId("quick-add-input")).toBeVisible();
    found.push(
      ...(await controlBoundaries(page, "SCR-WEB-008 list view + quick-add")),
    );

    // SCR-WEB-011's create-list dialog.
    await page.getByTestId("new-list").click();
    await expect(page.getByTestId("list-name-input")).toBeVisible();
    found.push(...(await controlBoundaries(page, "SCR-WEB-011 list dialog")));
    await page.keyboard.press("Escape");

    // SCR-WEB-010's detail: title input, due input, and the complete checkbox.
    await page.getByTestId("quick-add-input").fill("Contrast sweep");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await page.getByTestId("task-row-link").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    found.push(...(await controlBoundaries(page, "SCR-WEB-010 task detail")));
    await page.keyboard.press("Escape");

    // SCR-WEB-015's change-password form.
    await page.goto("/settings/security/password");
    await expect(page.getByTestId("current-password-input")).toBeVisible();
    found.push(
      ...(await controlBoundaries(page, "SCR-WEB-015 change password")),
    );

    assertAll(found, MIN_NON_TEXT, `control boundaries [${theme}]`);
  });
}
