import { describe, it, expect, vi } from "vitest";
import { updateGstSettings } from "../update-gst";
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

describe("updateGstSettings (integration — auth)", () => {
  it("rejects cross-tenant: Org A ADMIN cannot update Org B; Org B row stays unchanged", async () => {
    await seedOrgMember({ orgName: "Org A", slug: "org-a-gst1", email: "admin-a-gst@t.com", role: "ADMIN" });
    const { org: orgB } = await seedOrgMember({ orgName: "Org B", slug: "org-b-gst1", email: "admin-b-gst@t.com", role: "ADMIN" });

    signInAs("admin-a-gst@t.com");

    const result = await updateGstSettings({
      organisationId: orgB.id,
      gstEnabled: false,
      abnNumber: "",
      slug: "org-b-gst1",
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/signed in/i);

    // Org B must not have been mutated
    const db = await getTestDb();
    const [row] = await db
      .select({ gstEnabled: organisations.gstEnabled })
      .from(organisations)
      .where(eq(organisations.id, orgB.id));
    expect(row.gstEnabled).toBe(false);
  });

  it("rejects COMMITTEE role: COMMITTEE member cannot update GST settings (role gap test)", async () => {
    const { org: orgA } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a-gst2",
      email: "committee-a-gst@t.com",
      role: "COMMITTEE",
    });

    signInAs("committee-a-gst@t.com");

    const result = await updateGstSettings({
      organisationId: orgA.id,
      gstEnabled: false,
      abnNumber: "",
      slug: "org-a-gst2",
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/ADMIN/);
  });

  it("happy path: ADMIN of own org can update GST settings; DB reflects change", async () => {
    const { org: orgA } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a-gst3",
      email: "admin-gst@t.com",
      role: "ADMIN",
    });

    signInAs("admin-gst@t.com");

    const result = await updateGstSettings({
      organisationId: orgA.id,
      gstEnabled: false,
      abnNumber: "",
      slug: "org-a-gst3",
    });

    expect(result.success).toBe(true);

    const db = await getTestDb();
    const [row] = await db
      .select({ gstEnabled: organisations.gstEnabled })
      .from(organisations)
      .where(eq(organisations.id, orgA.id));
    expect(row.gstEnabled).toBe(false);
  });
});
