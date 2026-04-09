import { describe, it, expect, vi } from "vitest";
import { updateOrganisation } from "../update";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ createAuditLog: vi.fn(async () => undefined) }));

async function seedOrgMember(opts: {
  orgName: string;
  slug: string;
  email: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.orgName, slug: opts.slug })
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
  return { org, orgId: org.id, memberId: member.id };
}

describe("updateOrganisation (integration — auth)", () => {
  it("rejects cross-tenant: Org A admin cannot update Org B; Org B row stays unchanged", async () => {
    await seedOrgMember({ orgName: "Org A", slug: "org-a", email: "admin-a@t.com", role: "ADMIN" });
    const { org: orgB } = await seedOrgMember({ orgName: "Org B", slug: "org-b", email: "admin-b@t.com", role: "ADMIN" });

    signInAs("admin-a@t.com");

    const result = await updateOrganisation({
      id: orgB.id,
      name: "Hijacked",
      timezone: "UTC",
    });

    expect("success" in result).toBe(true);
    expect((result as { success: false; error: string }).success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/signed in/i);

    // The smoking gun: the DB row must be unchanged
    const db = await getTestDb();
    const [row] = await db
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, orgB.id));
    expect(row.name).toBe("Org B");
  });

  it("rejects MEMBER role: even own-org member cannot update; org row stays unchanged", async () => {
    const { org: orgA } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a",
      email: "member-a@t.com",
      role: "MEMBER",
    });

    signInAs("member-a@t.com");

    const result = await updateOrganisation({
      id: orgA.id,
      name: "Changed",
      timezone: "UTC",
    });

    expect("success" in result).toBe(true);
    expect((result as { success: false; error: string }).success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/ADMIN/);

    // The smoking gun: the DB row must be unchanged
    const db = await getTestDb();
    const [row] = await db
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, orgA.id));
    expect(row.name).toBe("Org A");
  });

  it("happy path: ADMIN of own org can update; returned row and DB both reflect new name", async () => {
    const { org: orgA } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a",
      email: "admin@t.com",
      role: "ADMIN",
    });

    signInAs("admin@t.com");

    const result = await updateOrganisation({
      id: orgA.id,
      name: "Updated Org A",
      timezone: "Australia/Melbourne",
    });

    // Happy path returns the row (no "success" key)
    expect("success" in result).toBe(false);
    expect((result as { name: string }).name).toBe("Updated Org A");

    const db = await getTestDb();
    const [row] = await db
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, orgA.id));
    expect(row.name).toBe("Updated Org A");
  });
});
