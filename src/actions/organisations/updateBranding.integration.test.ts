import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-setup";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

// Fixed UUID for the test organisation so we can reference it consistently.
const TEST_ORG_ID = "a0000000-0000-0000-0000-000000000001";

vi.mock("@/lib/auth-guards", () => ({
  requireSession: vi.fn().mockResolvedValue({
    memberId: "a0000000-0000-0000-0000-000000000002",
    organisationId: "a0000000-0000-0000-0000-000000000001",
    role: "ADMIN",
    firstName: "Test",
    lastName: "Admin",
    email: "admin@test.local",
  }),
  requireRole: vi.fn(),
  authErrorToResult: vi.fn().mockReturnValue(null),
  AuthError: class extends Error {},
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("updateBranding (integration)", () => {
  beforeEach(async () => {
    const db = await getTestDb();
    await db.insert(organisations).values({
      id: TEST_ORG_ID,
      name: "Test Club",
      slug: "test-club",
    });
  });

  it("writes accentColor to the row", async () => {
    const { updateBranding } = await import("./updateBranding");
    const result = await updateBranding(TEST_ORG_ID, {
      accentColor: "#38694a",
      removeLogo: false,
    });
    expect(result.success).toBe(true);

    const db = await getTestDb();
    const [row] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(row.accentColor).toBe("#38694a");
  });

  it("clears accentColor when null", async () => {
    const { updateBranding } = await import("./updateBranding");
    await updateBranding(TEST_ORG_ID, { accentColor: "#38694a", removeLogo: false });
    await updateBranding(TEST_ORG_ID, { accentColor: null, removeLogo: false });

    const db = await getTestDb();
    const [row] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(row.accentColor).toBeNull();
  });

  it("does not touch logoUrl when no logoFile passed", async () => {
    const { updateBranding } = await import("./updateBranding");
    const db = await getTestDb();
    await db
      .update(organisations)
      .set({ logoUrl: "https://example/logo.png" })
      .where(eq(organisations.id, TEST_ORG_ID));

    await updateBranding(TEST_ORG_ID, { accentColor: "#38694a", removeLogo: false });

    const [row] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(row.logoUrl).toBe("https://example/logo.png");
  });

  it("removes logoUrl when removeLogo is true", async () => {
    const { updateBranding } = await import("./updateBranding");
    const db = await getTestDb();
    await db
      .update(organisations)
      .set({ logoUrl: "https://example/logo.png" })
      .where(eq(organisations.id, TEST_ORG_ID));

    await updateBranding(TEST_ORG_ID, { accentColor: "#38694a", removeLogo: true });

    const [row] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(row.logoUrl).toBeNull();
  });
});
