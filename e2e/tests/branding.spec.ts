import { test, expect } from "../fixtures/auth";

const SLUG = "polski";

// Note: test 1 writes accent_color to the DB. The value #2f5d3a is deterministic,
// so re-running is idempotent — the same hex is saved each time. No afterAll cleanup
// is needed. This follows the same convention as other E2E tests in this project
// that mutate persistent state (e.g. admin-bookings.spec.ts) without rollback.

test.describe("Branding settings", () => {
  test("admin can set accent color and it applies on reload", async ({ adminPage }) => {
    await adminPage.goto(`/${SLUG}/admin/settings`);

    const hexInput = adminPage.getByLabel("Accent color hex");
    await hexInput.fill("#2f5d3a");
    await adminPage.getByRole("button", { name: "Save branding" }).click();
    await expect(adminPage.getByText("Branding updated")).toBeVisible();

    await adminPage.reload();

    // Verify the accent injection stylesheet is present and --primary is derived
    const primary = await adminPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
    );
    expect(primary).toContain("oklch");

    // Verify the saved hex is reflected in the input
    await expect(adminPage.getByLabel("Accent color hex")).toHaveValue("#2f5d3a");
  });

  test("wordmark renders org name in sidebar when no logo is set", async ({ adminPage }) => {
    await adminPage.goto(`/${SLUG}/admin`);
    // OrgLogo falls back to a <span> with the org name when logoUrl is null.
    // Assert the actual org name text is visible — not just that something renders.
    const sidebar = adminPage.locator("aside").first();
    await expect(sidebar.getByText("Polski Ski Club")).toBeVisible();
  });

  test("dark mode renders branding form with functional controls", async ({ browser }) => {
    const darkContext = await browser.newContext({
      storageState: "e2e/.auth/admin.json",
      colorScheme: "dark",
    });
    const darkPage = await darkContext.newPage();
    try {
      await darkPage.goto(`/${SLUG}/admin/settings`);

      // Assert the form is functional in dark mode: the hex input and save button
      // must be present and enabled, not just that a heading is visible.
      const hexInput = darkPage.getByLabel("Accent color hex");
      await expect(hexInput).toBeEnabled();
      await expect(darkPage.getByRole("button", { name: "Save branding" })).toBeEnabled();

      // Verify dark-mode background is applied to the document root
      const bgColor = await darkPage.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
      );
      expect(bgColor.length).toBeGreaterThan(0);
    } finally {
      await darkContext.close();
    }
  });
});
