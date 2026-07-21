import { test, expect } from "@playwright/test";
import { login, emailInput, passwordInput, DEMO } from "./helpers";

test.describe("authentication", () => {
  test("shows the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expect(emailInput(page)).toBeVisible();
  });

  test("logs in with the demo account and reaches the dashboard", async ({ page }) => {
    await login(page);
    // The seeded family has two children, each linked from the overview. Scope to
    // links named exactly after the child so we don't collide with activity rows
    // that merely mention the name ("👧 Emma · il y a 5 h").
    await expect(page.getByRole("link", { name: /Emma/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Lucas/ }).first()).toBeVisible();
  });

  test("the demo prefill button fills the credentials", async ({ page }) => {
    await page.goto("/login?demo=1");
    await expect(emailInput(page)).toHaveValue(DEMO.email);
    await expect(passwordInput(page)).toHaveValue(DEMO.password);
  });

  test("rejects wrong credentials with an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await emailInput(page).fill(DEMO.email);
    await passwordInput(page).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText(/incorrect/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
