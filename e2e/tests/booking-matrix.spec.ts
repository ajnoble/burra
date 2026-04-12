import { test, expect } from "../fixtures/auth";

test.describe("Member availability view", () => {
  test("availability page loads with matrix grid", async ({ memberPage }) => {
    await memberPage.goto("/polski/availability");
    await expect(
      memberPage.getByRole("heading", { name: "Check Availability" })
    ).toBeVisible();
    // Legend should show availability statuses
    await expect(memberPage.getByText("Available")).toBeVisible();
    await expect(memberPage.getByText("Booked")).toBeVisible();
  });

  test("clicking an available cell navigates to booking wizard", async ({
    memberPage,
  }) => {
    await memberPage.goto("/polski/availability");
    await expect(
      memberPage.getByRole("heading", { name: "Check Availability" })
    ).toBeVisible();

    // Wait for the matrix to load
    await expect(
      memberPage.getByText("Loading availability...")
    ).not.toBeVisible({ timeout: 15_000 });

    // Click on an available cell (cells have aria-label pattern "BedName on YYYY-MM-DD — available")
    const availableCell = memberPage.locator('[aria-label*="— available"]').first();
    await expect(availableCell).toBeVisible();
    await availableCell.click();
    await memberPage.waitForURL("**/book**");
  });
});

test.describe("Member availability — mobile list/grid toggle", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  test("mobile defaults to list view with toggle", async ({ memberPage }) => {
    await memberPage.goto("/polski/availability");
    await expect(
      memberPage.getByRole("heading", { name: "Check Availability" })
    ).toBeVisible();

    // Mobile should show the List/Grid toggle buttons
    const listButton = memberPage.getByRole("button", { name: "List" });
    const gridButton = memberPage.getByRole("button", { name: "Grid" });

    await expect(listButton).toBeVisible();
    await expect(gridButton).toBeVisible();

    // List should be active by default on mobile
    await expect(listButton).toHaveAttribute("aria-pressed", "true");
  });

  test("toggling to grid shows the matrix", async ({ memberPage }) => {
    await memberPage.goto("/polski/availability");
    await expect(
      memberPage.getByRole("heading", { name: "Check Availability" })
    ).toBeVisible();

    const gridButton = memberPage.getByRole("button", { name: "Grid" });
    await expect(gridButton).toBeVisible();
    await gridButton.click();

    // After toggling, grid button should be active
    await expect(gridButton).toHaveAttribute("aria-pressed", "true");

    // Legend (only shown in grid view) should appear
    await expect(memberPage.getByText("Available")).toBeVisible();
  });
});

test.describe("Admin booking calendar", () => {
  test("calendar page loads with booking matrix", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings/calendar");
    await expect(
      adminPage.getByRole("heading", { name: "Booking Calendar" })
    ).toBeVisible();
    await expect(adminPage.getByText("List View")).toBeVisible();

    // Status legend should be present
    await expect(adminPage.getByText("Confirmed")).toBeVisible();
    await expect(adminPage.getByText("Pending")).toBeVisible();
  });

  test("list view link navigates to bookings list", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings/calendar");
    await expect(
      adminPage.getByRole("heading", { name: "Booking Calendar" })
    ).toBeVisible();

    await adminPage.getByText("List View").click();
    await adminPage.waitForURL("**/admin/bookings");
    await expect(
      adminPage.getByRole("heading", { name: "Bookings" })
    ).toBeVisible();
  });

  test("calendar view link from list page navigates to calendar", async ({
    adminPage,
  }) => {
    await adminPage.goto("/polski/admin/bookings");
    await expect(
      adminPage.getByRole("heading", { name: "Bookings" })
    ).toBeVisible();

    await adminPage.getByText("Calendar View").click();
    await adminPage.waitForURL("**/admin/bookings/calendar");
    await expect(
      adminPage.getByRole("heading", { name: "Booking Calendar" })
    ).toBeVisible();
  });

  test("booking bar click opens detail sheet", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings/calendar");
    await expect(
      adminPage.getByRole("heading", { name: "Booking Calendar" })
    ).toBeVisible();

    // Wait for data to load
    await expect(
      adminPage.getByText("Loading bookings...")
    ).not.toBeVisible({ timeout: 15_000 });

    // Booking bars render as role="button" with aria-label containing the reference
    const bookingBar = adminPage.locator('div[role="button"][aria-label*="PSC-"]').first();
    await expect(bookingBar).toBeVisible();
    await bookingBar.click();

    // Detail sheet should open with booking reference visible
    await expect(adminPage.getByText(/PSC-\d{2}/)).toBeVisible();
  });
});

test.describe("Admin calendar — mobile", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  test("mobile admin calendar shows view-only matrix", async ({
    adminPage,
  }) => {
    await adminPage.goto("/polski/admin/bookings/calendar");
    await expect(
      adminPage.getByRole("heading", { name: "Booking Calendar" })
    ).toBeVisible();

    // Status legend should still be visible on mobile
    await expect(adminPage.getByText("Confirmed")).toBeVisible();
    await expect(adminPage.getByText("Pending")).toBeVisible();
  });
});
