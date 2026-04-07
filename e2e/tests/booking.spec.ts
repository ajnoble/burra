import { test, expect } from "../fixtures/auth";

test.describe("Booking flow", () => {
  test("booking page loads with lodge and round", async ({ memberPage }) => {
    await memberPage.goto("/polski/book");
    await expect(memberPage.getByRole("heading", { name: "Book a Stay" })).toBeVisible();
    await expect(memberPage.getByText("Polski Lodge, Mt Buller")).toBeVisible();
  });

  test("booking round dropdown shows names not UUIDs", async ({ memberPage }) => {
    await memberPage.goto("/polski/book");
    // Open the booking round dropdown
    const trigger = memberPage.locator("[data-slot='select-trigger']").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    // Check that dropdown options contain human-readable names, not UUIDs
    const options = memberPage.getByRole("option");
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent();
      expect(text?.trim()).not.toMatch(uuidPattern);
    }
  });

  test("can select dates and proceed to add guests", async ({ memberPage }) => {
    await memberPage.goto("/polski/book");

    // Navigate forward a few months to find dates with availability
    // Calendar nav buttons contain ChevronRight/Left icons (no text label)
    const nextButton = memberPage.locator("button").filter({ has: memberPage.locator("svg") }).nth(1);

    for (let i = 0; i < 3; i++) {
      await nextButton.click();
      await memberPage.waitForTimeout(500);
    }

    // Calendar date cells are <button> elements; day number is in an inner <div>
    const firstAvailableDate = memberPage.locator("button").filter({ hasText: /^10$/ }).first();
    if (await firstAvailableDate.isVisible()) {
      await firstAvailableDate.click();
      const checkOutDate = memberPage.locator("button").filter({ hasText: /^14$/ }).first();
      if (await checkOutDate.isVisible()) {
        await checkOutDate.click();
      }
    }

    await expect(memberPage.getByText("Check-in:")).toBeVisible();

    const proceedButton = memberPage.getByRole("button", { name: "Next: Add Guests" });
    await expect(proceedButton).toBeVisible();
  });

  test("next button validates before proceeding", async ({ memberPage }) => {
    await memberPage.goto("/polski/book");
    const nextButton = memberPage.getByRole("button", { name: "Next: Add Guests" });
    await expect(nextButton).toBeDisabled();
  });
});
