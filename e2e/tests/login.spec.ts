import { test, expect } from "@playwright/test";

test.describe("Login flow", () => {
  test("password login succeeds and redirects to dashboard", async ({ page }) => {
    await page.goto("/polski/login");
    await page.getByLabel("Email").fill("marek.kowalski@example.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/polski/login");
    await page.getByLabel("Email").fill("marek.kowalski@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
  });

  test("magic link tab renders and accepts email", async ({ page }) => {
    await page.goto("/polski/login");
    await page.getByRole("button", { name: "Magic Link" }).click();
    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("test@example.com");
    await expect(page.getByRole("button", { name: "Send magic link" })).toBeEnabled();
  });

  test("forgot password link navigates to reset page", async ({ page }) => {
    await page.goto("/polski/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.waitForURL("**/auth/reset-password");
    await expect(page.getByText("Reset Password")).toBeVisible();
  });

  test("sign out redirects to login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/admin.json",
    });
    const page = await context.newPage();
    await page.goto("/polski/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await context.close();
  });
});
