import { test, expect } from "../fixtures/auth";
import { test as baseTest } from "@playwright/test";

baseTest.describe("Org picker — unauthenticated", () => {
  baseTest("unauthenticated user sees landing page", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Snow Gum" })
    ).toBeVisible();
    await expect(
      page.getByText("Modern booking and membership management")
    ).toBeVisible();
  });
});

test.describe("Org picker — authenticated", () => {
  test("single-org user auto-redirects to dashboard", async ({
    memberPage,
  }) => {
    await memberPage.goto("/");
    await memberPage.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(
      memberPage.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("root page does not error for logged-in user", async ({
    memberPage,
  }) => {
    const response = await memberPage.goto("/");
    expect(response?.status()).not.toBe(500);
  });
});
