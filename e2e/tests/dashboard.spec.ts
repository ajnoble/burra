import { test, expect } from "../fixtures/auth";

test.describe("Member dashboard", () => {
  test("dashboard loads without errors", async ({ memberPage }) => {
    await memberPage.goto("/polski/dashboard");
    await expect(memberPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("shows welcome message with member name", async ({ memberPage }) => {
    await memberPage.goto("/polski/dashboard");
    await expect(memberPage.getByText("Welcome back, Katarzyna")).toBeVisible();
  });

  test("book a stay button links to booking page", async ({ memberPage }) => {
    await memberPage.goto("/polski/dashboard");
    const bookButton = memberPage.getByRole("link", { name: "Book a Stay", exact: true });
    await expect(bookButton).toBeVisible();
    await expect(bookButton).toHaveAttribute("href", "/polski/book");
  });

  test("upcoming bookings section renders", async ({ memberPage }) => {
    await memberPage.goto("/polski/dashboard");
    await expect(memberPage.getByRole("heading", { name: "Upcoming Bookings" })).toBeVisible();
  });

  test("sign out button works from dashboard", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/member.json",
    });
    const page = await context.newPage();
    await page.goto("/polski/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await context.close();
  });
});
