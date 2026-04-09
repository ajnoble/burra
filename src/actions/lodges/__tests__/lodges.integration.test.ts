import { describe, it, expect, vi } from "vitest";
import { createLodge } from "../index";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
  lodges,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function seedOrgMember(opts: {
  slug: string;
  email: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.slug, slug: opts.slug })
    .returning();
  const [mclass] = await db
    .insert(membershipClasses)
    .values({ organisationId: org.id, name: "Standard" })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      membershipClassId: mclass.id,
      firstName: "T",
      lastName: opts.email,
      email: opts.email,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id, memberId: member.id };
}

describe("createLodge (integration — auth)", () => {
  it("rejects cross-tenant attempts (Org A admin creating in Org B)", async () => {
    await seedOrgMember({ slug: "a", email: "admin-a@t.com", role: "ADMIN" });
    const b = await seedOrgMember({ slug: "b", email: "admin-b@t.com", role: "ADMIN" });
    signInAs("admin-a@t.com");
    const result = await createLodge({
      organisationId: b.orgId, // attack
      name: "Hijacked Lodge",
      totalBeds: 10,
      slug: "b",
    });
    expect("success" in result && result.success === false).toBe(true);
    if ("success" in result) {
      expect(result.error).toMatch(/signed in/i);
    }
  });

  it("rejects COMMITTEE role (only ADMIN can create lodges)", async () => {
    const a = await seedOrgMember({ slug: "a", email: "com@t.com", role: "COMMITTEE" });
    signInAs("com@t.com");
    const result = await createLodge({
      organisationId: a.orgId,
      name: "New Lodge",
      totalBeds: 10,
      slug: "a",
    });
    expect("success" in result && result.success === false).toBe(true);
    if ("success" in result) {
      expect(result.error).toMatch(/ADMIN/);
    }
  });

  it("allows ADMIN and inserts the lodge", async () => {
    const a = await seedOrgMember({ slug: "a", email: "admin@t.com", role: "ADMIN" });
    signInAs("admin@t.com");
    const result = await createLodge({
      organisationId: a.orgId,
      name: "Summit Lodge",
      totalBeds: 15,
      slug: "a",
    });
    expect("success" in result).toBe(false);
    const db = await getTestDb();
    const rows = await db
      .select()
      .from(lodges)
      .where(eq(lodges.organisationId, a.orgId));
    expect(rows.some((l) => l.name === "Summit Lodge")).toBe(true);
  });
});
