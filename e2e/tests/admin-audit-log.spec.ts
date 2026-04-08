import { test, expect } from "../fixtures/auth";

test.describe("Admin audit log", () => {
  test("audit log page loads with heading and filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await expect(
      adminPage.getByRole("heading", { name: "Audit Log" })
    ).toBeVisible();
    await expect(adminPage.locator("#action")).toBeVisible();
    await expect(adminPage.locator("#entityType")).toBeVisible();
    await expect(adminPage.locator("#dateFrom")).toBeVisible();
    await expect(adminPage.locator("#dateTo")).toBeVisible();
  });

  test("filter by entity type updates URL", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await adminPage.locator("#entityType").selectOption("booking");
    await adminPage.getByRole("button", { name: "Filter" }).click();
    await expect(adminPage).toHaveURL(/entityType=booking/);
  });

  test("filter by date range updates URL", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await adminPage.locator("#dateFrom").fill("2026-01-01");
    await adminPage.locator("#dateTo").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Filter" }).click();
    await expect(adminPage).toHaveURL(/dateFrom=2026-01-01/);
    await expect(adminPage).toHaveURL(/dateTo=2026-12-31/);
  });

  test("clear button resets filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log?entityType=booking");
    await adminPage.getByRole("button", { name: "Clear" }).click();
    await expect(adminPage).toHaveURL(/\/polski\/admin\/audit-log$/);
  });

  test("export CSV button is visible", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await expect(
      adminPage.getByRole("button", { name: "Export CSV" })
    ).toBeVisible();
  });

  test("booking officer cannot access audit log", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/audit-log");
    await expect(
      officerPage.getByRole("heading", { name: "Audit Log" })
    ).not.toBeVisible();
  });
});
