import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "demo@kidora.app", password: "kidora1234" } as const;

// The form's <label> elements aren't associated to their inputs (no htmlFor), so
// target the inputs by their autocomplete tokens — stable and semantic.
export const emailInput = (page: Page) => page.locator('input[autocomplete="email"]');
export const passwordInput = (page: Page) => page.locator('input[autocomplete="current-password"]');

/** Log in through the real form and land on the dashboard. */
export async function login(page: Page, creds = DEMO): Promise<void> {
  await page.goto("/login");
  await emailInput(page).fill(creds.email);
  await passwordInput(page).fill(creds.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
}
