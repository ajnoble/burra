import { describe, it, expect, vi } from "vitest";
import { createMember } from "../create";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "../../../db/schema";
import { eq, and } from "drizzle-orm";

// Silence downstream side effects
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async ({ email }: { email: string }) => ({
          data: {
            user: {
              // Must be a valid UUID for the profiles table insert
              id: "00000000-0000-0000-0000-" + Buffer.from(email).toString("hex").slice(0, 12).padEnd(12, "0"),
              email,
            },
          },
          error: null,
        }),
        generateLink: async () => ({
          data: { properties: { action_link: "https://example.com/invite" } },
          error: null,
        }),
      },
    },
  }),
}));

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

describe("createMember (integration — auth)", () => {
  it("rejects cross-tenant attempt (Org A COMMITTEE calling with Org B id)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-create1",
      callerEmail: "committee-a@test.com",
      role: "COMMITTEE",
    });
    const b = await seedOrg({
      orgName: "Org B",
      orgSlug: "org-b-create1",
      callerEmail: "committee-b@test.com",
      role: "COMMITTEE",
    });

    signInAs("committee-a@test.com");

    const result = await createMember({
      organisationId: b.orgId,
      slug: "org-b-create1",
      firstName: "New",
      lastName: "Member",
      email: "newmember@test.com",
      membershipClassId: b.membershipClassId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);

    // Verify no new member was inserted in Org B (only the seeded caller exists)
    const db = await getTestDb();
    const orgBMembers = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organisationId, b.orgId));
    // Only the seeded caller (committee-b@test.com) should exist
    expect(orgBMembers).toHaveLength(1);
  });

  it("rejects BOOKING_OFFICER trying to create a member (role gap)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-create2",
      callerEmail: "officer-a@test.com",
      role: "BOOKING_OFFICER",
    });

    signInAs("officer-a@test.com");

    const result = await createMember({
      organisationId: a.orgId,
      slug: "org-a-create2",
      firstName: "New",
      lastName: "Member",
      email: "newmember2@test.com",
      membershipClassId: a.membershipClassId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/COMMITTEE/);
  });

  it("allows COMMITTEE to create a member (happy path)", async () => {
    const a = await seedOrg({
      orgName: "Org A",
      orgSlug: "org-a-create3",
      callerEmail: "committee2-a@test.com",
      role: "COMMITTEE",
    });

    signInAs("committee2-a@test.com");

    const newEmail = "brandnew@test.com";

    try {
      await createMember({
        organisationId: a.orgId,
        slug: "org-a-create3",
        firstName: "Brand",
        lastName: "New",
        email: newEmail,
        membershipClassId: a.membershipClassId,
      });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT:")) {
        // expected — redirect was reached, meaning the whole function succeeded
      } else {
        throw e;
      }
    }

    // Verify a members row with the new email exists in the DB for that org
    const db = await getTestDb();
    const [newMember] = await db
      .select({ id: members.id, email: members.email })
      .from(members)
      .where(
        and(
          eq(members.organisationId, a.orgId),
          eq(members.email, newEmail)
        )
      );

    expect(newMember).toBeDefined();
    expect(newMember.email).toBe(newEmail);
  });
});
