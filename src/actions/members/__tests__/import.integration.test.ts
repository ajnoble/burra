import { describe, it, expect } from "vitest";
import { executeImport, validateCsvImport } from "../import";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "../../../db/schema";
import { eq, and } from "drizzle-orm";

const VALID_CSV = `first_name,last_name,email,membership_class
New,User,newuser@test.com,Standard`;

async function seedOrg(opts: {
  orgName: string;
  orgSlug: string;
  callerEmail: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.orgName, slug: opts.orgSlug })
    .returning();
  const [mclass] = await db
    .insert(membershipClasses)
    .values({ organisationId: org.id, name: "Standard" })
    .returning();
  const [caller] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      membershipClassId: mclass.id,
      firstName: "Test",
      lastName: "User",
      email: opts.callerEmail,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: caller.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id, memberId: caller.id, membershipClassId: mclass.id };
}

describe("executeImport (integration — auth)", () => {
  it("rejects cross-tenant executeImport (Org A ADMIN calls with Org B id)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-import1",
      callerEmail: "admin-a-import1@test.com",
      role: "ADMIN",
    });
    const b = await seedOrg({
      orgName: "Org B",
      orgSlug: "org-b-import1",
      callerEmail: "admin-b-import1@test.com",
      role: "ADMIN",
    });

    signInAs("admin-a-import1@test.com");

    const result = await executeImport(b.orgId, VALID_CSV, a.memberId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);

    // Verify no member with newuser@test.com was inserted in Org B
    const db = await getTestDb();
    const orgBMembers = await db
      .select({ email: members.email })
      .from(members)
      .where(
        and(
          eq(members.organisationId, b.orgId),
          eq(members.email, "newuser@test.com")
        )
      );
    expect(orgBMembers).toHaveLength(0);
  });

  it("rejects COMMITTEE role trying to executeImport (role gap)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-import2",
      callerEmail: "committee-a-import2@test.com",
      role: "COMMITTEE",
    });

    signInAs("committee-a-import2@test.com");

    const result = await executeImport(a.orgId, VALID_CSV, a.memberId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ADMIN/);

    // Verify no member was inserted
    const db = await getTestDb();
    const newMember = await db
      .select({ email: members.email })
      .from(members)
      .where(
        and(
          eq(members.organisationId, a.orgId),
          eq(members.email, "newuser@test.com")
        )
      );
    expect(newMember).toHaveLength(0);
  });

  it("allows ADMIN to executeImport (happy path)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-import3",
      callerEmail: "admin-a-import3@test.com",
      role: "ADMIN",
    });

    signInAs("admin-a-import3@test.com");

    const result = await executeImport(a.orgId, VALID_CSV, a.memberId);

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);

    // Verify the member exists in Org A
    const db = await getTestDb();
    const [newMember] = await db
      .select({ email: members.email })
      .from(members)
      .where(
        and(
          eq(members.organisationId, a.orgId),
          eq(members.email, "newuser@test.com")
        )
      );
    expect(newMember).toBeDefined();
    expect(newMember.email).toBe("newuser@test.com");
  });

  it("rejects cross-tenant validateCsvImport (Org A ADMIN calls with Org B id)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-import4",
      callerEmail: "admin-a-import4@test.com",
      role: "ADMIN",
    });
    const b = await seedOrg({
      orgName: "Org B",
      orgSlug: "org-b-import4",
      callerEmail: "admin-b-import4@test.com",
      role: "ADMIN",
    });

    signInAs("admin-a-import4@test.com");

    const result = await validateCsvImport(b.orgId, VALID_CSV);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });
});
