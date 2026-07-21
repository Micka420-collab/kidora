import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("dashboard (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("opens a child's detail from the overview", async ({ page }) => {
    await page.getByText("Emma").first().click();
    await expect(page).toHaveURL(/\/dashboard\/children\/[^/]+/);
    await expect(page.getByText("Emma").first()).toBeVisible();
  });

  test("navigates to the alerts page", async ({ page }) => {
    await page.goto("/dashboard/alerts");
    await expect(page).toHaveURL(/\/dashboard\/alerts$/);
    await expect(page.getByRole("heading", { name: "Alertes" })).toBeVisible();
  });

  test("navigates to settings", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  });

  test("logs out back to the login page", async ({ page }) => {
    await page.getByRole("button", { name: "Déconnexion" }).click();
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
    // The session is gone: /dashboard now bounces back to /login.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
