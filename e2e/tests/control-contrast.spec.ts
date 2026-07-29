import { test, expect, type Page } from "@playwright/test";
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
    await client.query("UPDATE users SET verified_at = now() WHERE email = $1", [
      email,
    ]);
  } finally {
    await client.end();
  }
}

/** WCAG 2.1 contrast ratio between two `rgb(...)` strings. */
function contrastRatio(a: string, b: string): number {
  const lum = (c: string): number => {
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) throw new Error(`unparseable colour: ${c}`);
    const [r, g, bl] = m.slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

interface Boundary {
  what: string;
  border: string;
  against: string;
}

/**
 * Every visible outline-identified control on the page, with the colour its
 * boundary is drawn against — its own fill when it has one, otherwise the
 * nearest opaque ancestor background (which is what the eye actually compares
 * the outline to).
 */
async function boundaries(page: Page, screen: string): Promise<Boundary[]> {
  return page.evaluate((screenName) => {
    const opaqueBehind = (el: Element): string => {
      let node: Element | null = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && !/rgba?\([^)]*,\s*0\s*\)/.test(bg) && bg !== "transparent") {
          return bg;
        }
        node = node.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const out: Boundary[] = [];
    for (const el of Array.from(
      document.querySelectorAll("input, textarea, select"),
    )) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden") continue;
      if (s.borderTopWidth === "0px" && s.outlineWidth === "0px") continue;
      const own = s.backgroundColor;
      const against =
        own && !/rgba?\([^)]*,\s*0\s*\)/.test(own) && own !== "transparent"
          ? own
          : opaqueBehind(el.parentElement ?? el);
      out.push({
        what: `${screenName} → <${el.tagName.toLowerCase()}${
          (el as HTMLInputElement).type
            ? ` type=${(el as HTMLInputElement).type}`
            : ""
        }${
          el.getAttribute("data-testid")
            ? ` testid=${el.getAttribute("data-testid")}`
            : ""
        }>`,
        border: s.borderTopColor,
        against,
      });
    }
    return out;
  }, screen);
}

function assertAll(found: Boundary[]): void {
  expect(found.length, "no controls found — the sweep would pass vacuously")
    .toBeGreaterThan(0);
  for (const b of found) {
    const ratio = contrastRatio(b.border, b.against);
    expect(
      ratio,
      `${b.what}: border ${b.border} on ${b.against} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);
  }
}

test("design.md §5: every control boundary meets 3:1 — signed-out screens [DEF-005]", async ({
  page,
}) => {
  const found: Boundary[] = [];

  await page.goto("/signup");
  await expect(page.getByTestId("email-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-001 sign-up")));

  await page.goto("/signin");
  await expect(page.getByTestId("email-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-004 sign-in")));

  await page.goto("/reset-password");
  await expect(page.getByTestId("email-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-005 forgot")));

  // ?token= renders the set-new-password stage; the token is only validated on
  // submit, so a probe value reaches the form.
  await page.goto("/reset-password?token=probe");
  await expect(page.getByTestId("password-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-006 set new password")));

  await page.goto("/verify-email?email=probe%40example.com");
  found.push(...(await boundaries(page, "SCR-WEB-002 verify notice")));

  assertAll(found);
});

test("design.md §5: every control boundary meets 3:1 — signed-in screens [DEF-005]", async ({
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

  const found: Boundary[] = [];

  // SCR-WEB-008's quick-add: title input, due input, priority select.
  await expect(page.getByTestId("quick-add-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-008 list view + quick-add")));

  // SCR-WEB-011's create-list dialog.
  await page.getByTestId("new-list").click();
  await expect(page.getByTestId("list-name-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-011 list dialog")));
  await page.keyboard.press("Escape");

  // SCR-WEB-010's detail: title input, due input, and the complete checkbox.
  await page.getByTestId("quick-add-input").fill("Contrast sweep");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await page.getByTestId("task-row-link").click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-010 task detail")));
  await page.keyboard.press("Escape");

  // SCR-WEB-015's change-password form.
  await page.goto("/settings/security/password");
  await expect(page.getByTestId("current-password-input")).toBeVisible();
  found.push(...(await boundaries(page, "SCR-WEB-015 change password")));

  assertAll(found);
});
