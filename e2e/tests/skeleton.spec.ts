import { test, expect } from "@playwright/test";

// The walking skeleton's done-when condition, local half, encoded:
// a request flows end-to-end (web shell -> API /healthz/ping -> Postgres
// write+read -> back) in a running local environment, and the token-styled shell
// renders the result. (Liveness is the dependency-free GET /healthz.)
// Later work extends this suite with the architecture's critical flows.
test("shell renders API + DB health end-to-end", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("api-status")).toHaveText("ok");
  await expect(page.getByTestId("db-status")).toHaveText("up");
  await expect(page.getByTestId("overall-status")).toHaveText("healthy");
});
