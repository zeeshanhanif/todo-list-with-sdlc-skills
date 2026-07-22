import { test, expect } from "@playwright/test";

// FEAT-001 T8 — Sign Up (SCR-WEB-001) wired end-to-end against the real stack
// (web shell -> BFF proxy -> API -> Postgres). Demonstrates the task done-when:
// the form submits, shows the notice on 201, and renders field errors on 400/409.
const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const VALID_PW = "9x!vQ2mLp0zR";

test("valid sign up lands on the check-your-email notice", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(VALID_PW);
  await page.getByTestId("submit").click();

  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByTestId("notice-body")).toContainText(email);
});

test("malformed email shows an inline email field error", async ({ page }) => {
  await page.goto("/signup");
  await page.getByTestId("email-input").fill("not-an-email");
  await page.getByTestId("password-input").fill(VALID_PW);
  await page.getByTestId("submit").click();

  await expect(page.getByTestId("email-error")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/); // did not navigate
});

test("already-registered email shows the 'already in use' form error", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  // Seed the account directly against the API.
  const seed = await request.post("http://localhost:3001/auth/register", {
    data: { email, password: VALID_PW },
  });
  expect(seed.status()).toBe(201);

  await page.goto("/signup");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(VALID_PW);
  await page.getByTestId("submit").click();

  await expect(page.getByTestId("form-error")).toContainText(/already in use/i);
});
