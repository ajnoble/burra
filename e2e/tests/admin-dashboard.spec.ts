import { test, expect } from "../fixtures/auth";

test.describe("Admin dashboard", () => {
  test("admin sees all three tabs", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await expect(adminPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: /treasurer/i })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: /bookings/i })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: /committee/i })).toBeVisible();
  });

  test("treasurer tab shows revenue cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /treasurer/i }).click();
    await expect(adminPage.getByText(/revenue \(mtd\)/i)).toBeVisible();
    await expect(adminPage.getByText(/revenue \(ytd\)/i)).toBeVisible();
    await expect(adminPage.getByText(/outstanding balances/i)).toBeVisible();
    await expect(adminPage.getByText(/platform fees \(ytd\)/i)).toBeVisible();
  });

  test("treasurer tab shows monthly revenue chart", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /treasurer/i }).click();
    await expect(adminPage.getByRole("heading", { name: /monthly revenue/i })).toBeVisible();
  });

  test("bookings tab shows operational cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /bookings/i }).click();
    await expect(adminPage.getByText(/arrivals today/i)).toBeVisible();
    await expect(adminPage.getByText(/departures today/i)).toBeVisible();
    await expect(adminPage.getByText(/current occupancy/i)).toBeVisible();
    await expect(adminPage.getByText(/pending approvals/i)).toBeVisible();
  });

  test("bookings tab shows occupancy forecast", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /bookings/i }).click();
    await expect(adminPage.getByText(/occupancy forecast/i)).toBeVisible();
  });

  test("committee tab shows KPI cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /committee/i }).click();
    await expect(adminPage.getByText(/active members/i)).toBeVisible();
    await expect(adminPage.getByText(/season occupancy/i)).toBeVisible();
    await expect(adminPage.getByText(/financial members/i)).toBeVisible();
  });

  test("committee tab shows membership breakdown", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: /committee/i }).click();
    await expect(adminPage.getByRole("heading", { name: /membership breakdown/i })).toBeVisible();
  });

  test("officer only sees bookings tab", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/dashboard");
    await expect(officerPage.getByRole("tab", { name: /bookings/i })).toBeVisible();
    await expect(officerPage.getByRole("tab", { name: /treasurer/i })).not.toBeVisible();
    await expect(officerPage.getByRole("tab", { name: /committee/i })).not.toBeVisible();
  });
});
