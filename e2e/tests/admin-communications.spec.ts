import { test, expect } from "../fixtures/auth";

test.describe("Admin communications", () => {
  test("communications page loads with tabs", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications");
    await expect(adminPage.getByRole("heading", { name: "Communications" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Messages" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Templates" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Settings" })).toBeVisible();
  });

  test("compose page loads with channel selector", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await expect(adminPage.getByRole("heading", { name: "Compose Message" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "EMAIL" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "SMS" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "BOTH" })).toBeVisible();
  });

  test("compose shows markdown editor and recipient filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await expect(adminPage.getByPlaceholder("Write your message in markdown")).toBeVisible();
    await expect(adminPage.getByPlaceholder("Email subject line")).toBeVisible();
    await expect(adminPage.getByText("Recipients")).toBeVisible();
  });

  test("SMS channel shows character counter", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await adminPage.getByRole("button", { name: "SMS" }).click();
    await expect(adminPage.getByPlaceholder("Plain text SMS message")).toBeVisible();
    await expect(adminPage.getByText(/\/160/)).toBeVisible();
  });

  test("templates tab shows empty state", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications?tab=templates");
    await adminPage.getByRole("tab", { name: "Templates" }).click();
    await expect(adminPage.getByText("No templates yet")).toBeVisible();
  });

  test("settings tab shows SMS configuration", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications?tab=settings");
    await adminPage.getByRole("tab", { name: "Settings" }).click();
    await expect(adminPage.getByText("SMS Phone Number")).toBeVisible();
    await expect(adminPage.getByText("Automated SMS Triggers")).toBeVisible();
  });

  test("booking officer cannot access communications", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/communications");
    await expect(officerPage.getByRole("heading", { name: "Communications" })).not.toBeVisible();
  });

  test("recipient list loads with members", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await adminPage.waitForTimeout(1000);
    await expect(adminPage.getByText(/Sending to \d+ member/)).toBeVisible();
  });
});
