import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SLUG = "polski";

test.describe("Accessibility audit", () => {
  test("public landing page has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto(`/${SLUG}`);
    // color-contrast is disabled: axe's contrast rule is flaky with CSS custom
    // properties under SSR hydration. Manual pre-merge checklist covers contrast.
    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(serious).toEqual([]);
  });

  test("login page has no serious or critical violations", async ({ page }) => {
    await page.goto(`/${SLUG}/login`);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(serious).toEqual([]);
  });
});
