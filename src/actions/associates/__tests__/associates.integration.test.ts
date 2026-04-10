import { describe, it, expect, vi } from "vitest";
import { createAssociate, updateAssociate, deleteAssociate, getMyAssociates } from "../index";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
  associates,
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

describe("createAssociate (integration)", () => {
  it("creates an associate owned by the session member", async () => {
    const { orgId, memberId } = await seedOrgMember({
      slug: "org-a",
      email: "member@example.com",
      role: "MEMBER",
    });
    signInAs("member@example.com");

    const result = await createAssociate({
      organisationId: orgId,
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      slug: "org-a",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    const db = await getTestDb();
    const rows = await db
      .select()
      .from(associates)
      .where(eq(associates.id, result.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Alice");
    expect(rows[0].lastName).toBe("Smith");
    expect(rows[0].email).toBe("alice@example.com");
    expect(rows[0].ownerMemberId).toBe(memberId);
    expect(rows[0].organisationId).toBe(orgId);
    expect(rows[0].isDeleted).toBe(false);
  });

  it("rejects unauthenticated create", async () => {
    const { orgId } = await seedOrgMember({
      slug: "org-b",
      email: "member-b@example.com",
      role: "MEMBER",
    });
    // Not calling signInAs — no session

    const result = await createAssociate({
      organisationId: orgId,
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
      slug: "org-b",
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/signed in/i);
  });
});

describe("updateAssociate (integration)", () => {
  it("prevents updating another member's associate", async () => {
    const owner = await seedOrgMember({
      slug: "org-c",
      email: "owner@example.com",
      role: "MEMBER",
    });
    // Seed a second member in the same org
    const db = await getTestDb();
    const [mclass] = await db
      .select()
      .from(membershipClasses)
      .where(eq(membershipClasses.organisationId, owner.orgId));
    const [otherMember] = await db
      .insert(members)
      .values({
        organisationId: owner.orgId,
        membershipClassId: mclass.id,
        firstName: "Other",
        lastName: "Person",
        email: "other@example.com",
      })
      .returning();
    await db.insert(organisationMembers).values({
      organisationId: owner.orgId,
      memberId: otherMember.id,
      role: "MEMBER",
      isActive: true,
    });

    // Owner creates an associate
    signInAs("owner@example.com");
    const createResult = await createAssociate({
      organisationId: owner.orgId,
      firstName: "MyAssoc",
      lastName: "Owned",
      email: "myassoc@example.com",
      slug: "org-c",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) throw new Error("expected success");
    const associateId = createResult.id;

    // Other member tries to update it
    signInAs("other@example.com");
    const updateResult = await updateAssociate({
      id: associateId,
      organisationId: owner.orgId,
      firstName: "Hijacked",
      lastName: "Name",
      email: "hijacked@example.com",
      slug: "org-c",
    });

    expect(updateResult.success).toBe(false);
    if (updateResult.success) throw new Error("expected failure");
    expect(updateResult.error).toMatch(/own/i);
  });
});

describe("deleteAssociate (integration)", () => {
  it("soft-deletes an associate: isDeleted=true, still in DB, not in getMyAssociates", async () => {
    const { orgId, memberId } = await seedOrgMember({
      slug: "org-d",
      email: "deleter@example.com",
      role: "MEMBER",
    });
    signInAs("deleter@example.com");

    const createResult = await createAssociate({
      organisationId: orgId,
      firstName: "ToDelete",
      lastName: "User",
      email: "todelete@example.com",
      slug: "org-d",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) throw new Error("expected success");
    const associateId = createResult.id;

    const deleteResult = await deleteAssociate(associateId, orgId, "org-d");
    expect(deleteResult.success).toBe(true);

    // Still in DB but isDeleted = true
    const db = await getTestDb();
    const rows = await db
      .select()
      .from(associates)
      .where(eq(associates.id, associateId));
    expect(rows).toHaveLength(1);
    expect(rows[0].isDeleted).toBe(true);

    // Not returned by getMyAssociates
    const myAssociates = await getMyAssociates(orgId, memberId);
    expect(myAssociates.find((a) => a.id === associateId)).toBeUndefined();
  });
});

describe("getMyAssociates (integration)", () => {
  it("only returns associates owned by the requesting member", async () => {
    const memberA = await seedOrgMember({
      slug: "org-e",
      email: "membera@example.com",
      role: "MEMBER",
    });
    // Seed a second member in the same org
    const db = await getTestDb();
    const [mclass] = await db
      .select()
      .from(membershipClasses)
      .where(eq(membershipClasses.organisationId, memberA.orgId));
    const [memberBRow] = await db
      .insert(members)
      .values({
        organisationId: memberA.orgId,
        membershipClassId: mclass.id,
        firstName: "B",
        lastName: "Person",
        email: "memberb@example.com",
      })
      .returning();
    await db.insert(organisationMembers).values({
      organisationId: memberA.orgId,
      memberId: memberBRow.id,
      role: "MEMBER",
      isActive: true,
    });

    // Member A creates two associates
    signInAs("membera@example.com");
    await createAssociate({
      organisationId: memberA.orgId,
      firstName: "AssocA1",
      lastName: "Smith",
      email: "assoca1@example.com",
      slug: "org-e",
    });
    await createAssociate({
      organisationId: memberA.orgId,
      firstName: "AssocA2",
      lastName: "Smith",
      email: "assoca2@example.com",
      slug: "org-e",
    });

    // Member B creates one associate
    signInAs("memberb@example.com");
    await createAssociate({
      organisationId: memberA.orgId,
      firstName: "AssocB1",
      lastName: "Jones",
      email: "assocb1@example.com",
      slug: "org-e",
    });

    // getMyAssociates for member A should return only A's 2
    const associatesA = await getMyAssociates(memberA.orgId, memberA.memberId);
    expect(associatesA).toHaveLength(2);
    expect(associatesA.every((a) => a.ownerMemberId === memberA.memberId)).toBe(true);

    // getMyAssociates for member B should return only B's 1
    const associatesB = await getMyAssociates(memberA.orgId, memberBRow.id);
    expect(associatesB).toHaveLength(1);
    expect(associatesB[0].firstName).toBe("AssocB1");
  });
});
