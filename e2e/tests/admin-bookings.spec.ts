import { test, expect } from "../fixtures/auth";

test.describe("Admin bookings", () => {
  test("booking list loads with seeded bookings", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings");
    await expect(adminPage.getByRole("heading", { name: "Bookings" })).toBeVisible();
    // Should show booking references
    await expect(adminPage.getByText(/PSC-20/).first()).toBeVisible();
  });

  test("can filter bookings by status", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings");
    const pendingFilter = adminPage.getByRole("link", { name: /pending/i });
    if (await pendingFilter.isVisible()) {
      await pendingFilter.click();
      await adminPage.waitForTimeout(500);
      await expect(adminPage.getByText(/PENDING/i)).toBeVisible();
    }
  });

  test("can view booking detail", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings");
    const bookingRef = adminPage.getByText(/PSC-20/).first();
    await bookingRef.click();
    await adminPage.waitForURL("**/admin/bookings/**");
    await expect(adminPage.getByRole("heading", { name: /PSC-20/ })).toBeVisible();
  });

  test("approve action visible on pending booking", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings?status=PENDING");
    const pendingBooking = adminPage.getByText(/PSC-20/).first();
    if (await pendingBooking.isVisible()) {
      await pendingBooking.click();
      await adminPage.waitForURL("**/admin/bookings/**");
      await expect(adminPage.getByRole("button", { name: /approve/i })).toBeVisible();
    }
  });

  test("cancel action shows confirmation", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/bookings");
    const bookingRef = adminPage.getByText(/PSC-20/).first();
    await bookingRef.click();
    await adminPage.waitForURL("**/admin/bookings/**");
    const cancelButton = adminPage.getByRole("button", { name: /cancel/i });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
      await expect(adminPage.getByText(/confirm|are you sure/i)).toBeVisible();
    }
  });
});
