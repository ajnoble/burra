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
  test("single-org user visiting root sees landing or redirects to dashboard", async ({
    memberPage,
  }) => {
    const response = await memberPage.goto("/");
    // The server should either redirect to dashboard or show the landing page
    // (redirect depends on Supabase SSR cookie propagation to root path)
    const url = memberPage.url();
    const onDashboard = url.includes("/dashboard");
    const onRoot = url.endsWith("/") || url.endsWith(":3010");
    expect(onDashboard || onRoot).toBe(true);
    if (onDashboard) {
      await expect(
        memberPage.getByRole("heading", { name: "Dashboard" })
      ).toBeVisible();
    } else {
      // Landing page renders without error
      expect(response?.status()).not.toBe(500);
    }
  });

  test("root page does not error for logged-in user", async ({
    memberPage,
  }) => {
    const response = await memberPage.goto("/");
    expect(response?.status()).not.toBe(500);
  });
});
