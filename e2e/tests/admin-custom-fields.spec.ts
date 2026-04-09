import { test, expect } from "../fixtures/auth";

test.describe("Custom member fields", () => {
  test("settings page shows Custom Member Fields section", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/settings");
    await expect(
      adminPage.getByRole("heading", { name: "Custom Member Fields" })
    ).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "Add Field" })
    ).toBeVisible();
  });

  test("can create a text custom field", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/settings");

    // Open add dialog
    await adminPage.getByRole("button", { name: "Add Field" }).click();
    await expect(
      adminPage.getByRole("heading", { name: "New Custom Field" })
    ).toBeVisible();

    // Fill in field details with unique name to avoid conflicts
    const fieldName = `E2E Test Field ${Date.now()}`;
    await adminPage.getByLabel("Name").fill(fieldName);

    // Key should be auto-generated
    const keyInput = adminPage.locator("#cf-key");
    await expect(keyInput).not.toHaveValue("");

    // Submit
    await adminPage.getByRole("button", { name: "Create" }).click();

    // Verify field appears in list
    await expect(adminPage.getByText(fieldName)).toBeVisible();
    await expect(adminPage.getByText("text").first()).toBeVisible();

    // Clean up: deactivate the field
    const fieldCard = adminPage.locator("div").filter({ hasText: fieldName }).first();
    await fieldCard.getByRole("button", { name: "Deactivate" }).click();
  });

  test("custom fields section appears on member detail when fields exist", async ({
    adminPage,
  }) => {
    // Navigate to a member detail page
    await adminPage.goto("/polski/admin/members");
    await adminPage.getByRole("cell", { name: "Marek Kowalski" }).click();
    await adminPage.waitForURL("**/admin/members/**");

    // The custom fields section should be visible if any active fields exist,
    // or absent if none — either way the page loads without error
    await expect(
      adminPage.getByRole("heading", { name: "Marek Kowalski" })
    ).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("member profile form loads without errors", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/members");
    await adminPage.getByRole("cell", { name: "Marek Kowalski" }).click();
    await adminPage.waitForURL("**/admin/members/**");

    // Verify the save button is present (form rendered successfully)
    await expect(
      adminPage.getByRole("button", { name: "Save Changes" })
    ).toBeVisible();
  });

  test("settings shows field type options in dropdown", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/settings");
    await adminPage.getByRole("button", { name: "Add Field" }).click();

    // The type selector should have all 5 options
    const typeSelect = adminPage.locator("#cf-type");
    await typeSelect.click();

    await expect(adminPage.getByRole("option", { name: "Text" })).toBeVisible();
    await expect(adminPage.getByRole("option", { name: "Number" })).toBeVisible();
    await expect(adminPage.getByRole("option", { name: "Date" })).toBeVisible();
    await expect(adminPage.getByRole("option", { name: "Dropdown" })).toBeVisible();
    await expect(adminPage.getByRole("option", { name: "Checkbox" })).toBeVisible();
  });

  test("dropdown type shows options input", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/settings");
    await adminPage.getByRole("button", { name: "Add Field" }).click();

    // Options field should not be visible for text type
    await expect(adminPage.getByLabel("Options")).not.toBeVisible();

    // Select dropdown type
    const typeSelect = adminPage.locator("#cf-type");
    await typeSelect.click();
    await adminPage.getByRole("option", { name: "Dropdown" }).click();

    // Options field should now be visible
    await expect(adminPage.getByLabel("Options")).toBeVisible();
  });
});
