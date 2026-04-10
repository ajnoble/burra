import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-setup";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateBranding } from "./updateBranding";

// Fixed UUID for the test organisation so we can reference it consistently.
const TEST_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_ORG_ID = "a0000000-0000-0000-0000-000000000002";

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

  it("does not touch rows in other organisations (cross-tenant isolation)", async () => {
    const db = await getTestDb();
    await db.insert(organisations).values({
      id: OTHER_ORG_ID,
      name: "Other Club",
      slug: "other-club",
      accentColor: "#112233",
      logoUrl: "https://example/other-logo.png",
    });

    await updateBranding(TEST_ORG_ID, { accentColor: "#38694a", removeLogo: true });

    const [otherRow] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, OTHER_ORG_ID));
    expect(otherRow.accentColor).toBe("#112233");
    expect(otherRow.logoUrl).toBe("https://example/other-logo.png");
  });

  it("handles removeLogo: true when no prior logo exists", async () => {
    const db = await getTestDb();
    // Verify the beforeEach seed leaves logoUrl as null (no explicit logoUrl set).
    const [seeded] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(seeded.logoUrl).toBeNull();

    const result = await updateBranding(TEST_ORG_ID, {
      accentColor: "#38694a",
      removeLogo: true,
    });
    expect(result).toEqual({ success: true });

    const [row] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, TEST_ORG_ID));
    expect(row.logoUrl).toBeNull();
    expect(row.accentColor).toBe("#38694a");
  });
});
