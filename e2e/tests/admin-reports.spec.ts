import { test, expect } from "../fixtures/auth";

test.describe("Admin reports", () => {
  test("reports page shows 7 report cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports");
    await expect(adminPage.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(adminPage.getByText("Transaction Ledger")).toBeVisible();
    await expect(adminPage.getByText("Revenue Summary")).toBeVisible();
    await expect(adminPage.getByText("Member Balances")).toBeVisible();
    await expect(adminPage.getByText("Subscription Status")).toBeVisible();
    await expect(adminPage.getByText("Occupancy Report")).toBeVisible();
    await expect(adminPage.getByText("Arrivals & Departures")).toBeVisible();
    await expect(adminPage.getByText("Booking Summary")).toBeVisible();
  });

  test("transaction ledger loads with filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/transaction-ledger");
    await expect(adminPage.getByRole("heading", { name: "Transaction Ledger" })).toBeVisible();
    await expect(adminPage.getByText("From")).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("member balances has financial status filter", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/member-balances");
    await expect(adminPage.getByRole("heading", { name: "Member Balances" })).toBeVisible();
    await expect(adminPage.locator("label").filter({ hasText: "Financial" })).toBeVisible();
  });

  test("CSV export triggers download", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/transaction-ledger");
    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("xero-transactions");
    expect(download.suggestedFilename()).toContain(".csv");
  });

  test("subscription status has season filter", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/subscription-status");
    await expect(adminPage.locator("label").filter({ hasText: "Season" })).toBeVisible();
  });

  test("occupancy report has lodge filter", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/occupancy");
    await expect(adminPage.locator("label").filter({ hasText: /^Lodge$/ })).toBeVisible();
  });

  test("empty report shows message", async ({ adminPage }) => {
    await adminPage.goto(
      "/polski/admin/reports/arrivals-departures?dateFrom=2000-01-01&dateTo=2000-01-02"
    );
    await expect(adminPage.getByText("No data found")).toBeVisible();
  });
});
