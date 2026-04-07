import { test as setup, expect } from "@playwright/test";

const accounts = [
  {
    email: "marek.kowalski@example.com",
    password: "testpass123",
    file: "e2e/.auth/admin.json",
  },
  {
    email: "anna.nowak@example.com",
    password: "testpass123",
    file: "e2e/.auth/officer.json",
  },
  {
    email: "katarzyna.wojcik@example.com",
    password: "testpass123",
    file: "e2e/.auth/member.json",
  },
];

for (const account of accounts) {
  setup(`authenticate as ${account.email}`, async ({ page }) => {
    await page.goto("/polski/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.context().storageState({ path: account.file });
  });
}
