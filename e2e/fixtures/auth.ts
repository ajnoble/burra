import { test as base, type Page } from "@playwright/test";

type AuthFixtures = {
  adminPage: Page;
  officerPage: Page;
  memberPage: Page;
};

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/admin.json",
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  officerPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/officer.json",
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  memberPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/member.json",
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
