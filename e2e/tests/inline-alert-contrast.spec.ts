import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  alertPairings,
  assertAll,
  assertTheme,
  useTheme,
} from "./contrast";

// DEF-006's regression guard — the third member of the project's accessibility
// sweep family, after DEF-005's `control-contrast.spec.ts` (control boundaries)
// and DEF-011's `touch-target.spec.ts` (target size).
//
// design.md §5: body text needs ≥ 4.5:1, and — stated by name because this
// exact pairing has now caused three defects — "never `--color-danger` on
// `--color-danger-subtle` (3.95:1); a tint takes its `*-text` partner (§2)".
// `--color-danger-text` measures 6.80:1 light / 8.31:1 dark and exists for this.
//
// DEF-003 fixed the pairing in one component and DEF-004 swept the chip/badge
// family, but neither swept the **inline alerts** — the error banner every auth
// screen shows. This sweep drives each screen to its real error state and
// measures what the browser actually painted, so it cannot be satisfied by a
// component that merely looks right in source.
//
// Measured as a computed RATIO rather than expected hex values, for the same
// reason as the sibling guards: the criterion is the ratio, so a token change
// that keeps the rule stays green while one that breaks it goes red.
const API = process.env.API_URL ?? "http://localhost:3001";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo";
const PW = "9x!vQ2mLp0zR";
const MIN_BODY = 4.5;

const uniqueEmail = () =>
  `e2e-alert-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

// DEF-012: every sweep below runs in BOTH themes. Until then these guards only
// ever measured light, so `--color-danger-text`'s dark-theme ratio was an
// annotation in tokens.json that nothing checked.
const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  test(`DEF-006: the sign-up alert (and the links inside it) meet AA on the tint [${theme}]`, async ({
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

    await useTheme(page, theme);

    // Registering the same address again is the real path to this alert.
    await page.goto("/signup");
    await assertTheme(page, theme);
    await page.getByTestId("email-input").fill(email);
    await page.getByTestId("password-input").fill(PW);
    await page.getByTestId("submit").click();

    await expect(page.getByTestId("form-error")).toBeVisible();
    assertAll(
      await alertPairings(page, `SCR-WEB-001 sign-up [${theme}]`),
      MIN_BODY,
      `sign-up [${theme}]`,
    );
  });

  test(`DEF-006: the sign-in alert meets AA on the tint [${theme}]`, async ({
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

    await useTheme(page, theme);

    await page.goto("/signin");
    await assertTheme(page, theme);
    await page.getByTestId("email-input").fill(email);
    await page.getByTestId("password-input").fill("wrong-password-entirely");
    await page.getByTestId("submit").click();

    await expect(page.getByTestId("form-error")).toBeVisible();
    assertAll(
      await alertPairings(page, `SCR-WEB-004 sign-in [${theme}]`),
      MIN_BODY,
      `sign-in [${theme}]`,
    );
  });

  test(`DEF-006: the reset-password alert meets AA on the tint [${theme}]`, async ({
    page,
  }) => {
    // This screen's `form-error` is the unreachable-server branch — an invalid
    // token renders its own dedicated state instead (FEAT-005), so the honest
    // way to the alert is to make the request actually fail. Aborting the route
    // is deterministic and exercises the same rendered element a real outage
    // would.
    await page.route("**/api/auth/forgot", (route) => route.abort());

    await useTheme(page, theme);

    await page.goto("/reset-password");
    await assertTheme(page, theme);
    await page.getByTestId("email-input").fill("someone@example.com");
    await page.getByTestId("submit").click();

    await expect(page.getByTestId("form-error")).toBeVisible();
    assertAll(
      await alertPairings(page, `SCR-WEB-005 forgot-password [${theme}]`),
      MIN_BODY,
      `forgot-password [${theme}]`,
    );
  });
}
