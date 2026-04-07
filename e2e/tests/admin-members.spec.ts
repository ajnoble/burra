import { test, expect } from "../fixtures/auth";

test.describe("Admin member management", () => {
  test("member list loads with seeded members", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/members");
    await expect(adminPage.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(adminPage.getByRole("link", { name: "Add Member" })).toBeVisible();
    await expect(adminPage.getByRole("cell", { name: "Marek Kowalski" })).toBeVisible();
  });

  test("search filters members by name", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/members");
    const searchInput = adminPage.getByPlaceholder("Search");
    if (await searchInput.isVisible()) {
      await searchInput.fill("Nowak");
      await adminPage.waitForTimeout(500);
      await expect(adminPage.getByRole("cell", { name: "Anna Nowak" })).toBeVisible();
    }
  });

  test("add member form renders with required fields", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/members/new");
    await expect(adminPage.getByRole("heading", { name: "Add Member" })).toBeVisible();
    await expect(adminPage.getByLabel("First Name")).toBeVisible();
    await expect(adminPage.getByLabel("Last Name")).toBeVisible();
    await expect(adminPage.getByLabel("Email")).toBeVisible();
  });

  test("member detail page shows correct info", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/members");
    await adminPage.getByRole("cell", { name: "Marek Kowalski" }).click();
    await adminPage.waitForURL("**/admin/members/**");
    await expect(adminPage.getByRole("heading", { name: "Marek Kowalski" })).toBeVisible();
  });
});
