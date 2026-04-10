import { test, expect } from "../fixtures/auth";

const SLUG = "polski";

// Note: test 1 writes accent_color to the DB. The value #2f5d3a is deterministic,
// so re-running is idempotent — the same hex is saved each time. No afterAll cleanup
// is needed. This follows the same convention as other E2E tests in this project
// that mutate persistent state (e.g. admin-bookings.spec.ts) without rollback.

test.describe("Branding settings", () => {
  test("admin can set accent color and it applies on reload", async ({ adminPage }) => {
    await adminPage.goto(`/${SLUG}/admin/settings`);

    const hexInput = adminPage.getByLabel("Accent color", { exact: true });
    await hexInput.fill("#2f5d3a");
    await adminPage.getByRole("button", { name: "Save branding" }).click();
    await expect(adminPage.getByText("Branding updated")).toBeVisible();

    await adminPage.reload();

    // After save, the per-org InjectAccent component emits a data-URL stylesheet
    // <link> in the document head. This proves the accent pipeline ran end-to-end:
    // hex -> deriveAccentPalette -> InjectAccent -> data-URL <link> in DOM.
    const accentLink = adminPage.locator(
      'link[rel="stylesheet"][href^="data:text/css"]',
    );
    await expect(accentLink).toHaveCount(1);

    // Verify the saved hex is reflected in the input (persistence round-trip)
    await expect(
      adminPage.getByLabel("Accent color", { exact: true }),
    ).toHaveValue("#2f5d3a");
  });

  test("wordmark renders org name in sidebar when no logo is set", async ({ adminPage }) => {
    await adminPage.goto(`/${SLUG}/admin`);
    // OrgLogo falls back to a <span> with the org name when logoUrl is null.
    // Assert the actual org name text is visible — not just that something renders.
    const sidebar = adminPage.locator("aside").first();
    await expect(sidebar.getByText("Polski Ski Club")).toBeVisible();
  });

  test("admin can save branding from dark mode", async ({ browser }) => {
    // Dark mode is a real regression vector — CSS variable typos and missing
    // .dark selectors only show under prefers-color-scheme: dark. This test
    // performs a full save workflow in a dark-scheme context to prove the
    // branding form is functional end-to-end (not just rendered) in dark mode.
    const darkContext = await browser.newContext({
      storageState: "e2e/.auth/admin.json",
      colorScheme: "dark",
    });
    const darkPage = await darkContext.newPage();
    try {
      await darkPage.goto(`/${SLUG}/admin/settings`);

      await darkPage
        .getByLabel("Accent color", { exact: true })
        .fill("#2f5d3a");
      await darkPage.getByRole("button", { name: "Save branding" }).click();
      await expect(darkPage.getByText("Branding updated")).toBeVisible();
    } finally {
      await darkContext.close();
    }
  });
});
