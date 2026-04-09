import { describe, it, expect, beforeEach } from "vitest";
import { requireSession, AuthError } from "../auth-guards";
import { getTestDb, signInAs } from "../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "../../db/schema";

describe("requireSession (integration)", () => {
  let orgAId: string;
  let orgBId: string;

  beforeEach(async () => {
    const db = await getTestDb();

    const [orgA] = await db
      .insert(organisations)
      .values({ name: "Org A", slug: "org-a" })
      .returning();
    orgAId = orgA.id;

    const [orgB] = await db
      .insert(organisations)
      .values({ name: "Org B", slug: "org-b" })
      .returning();
    orgBId = orgB.id;

    // Seed a membership class required by the members FK constraint.
    const [memberClass] = await db
      .insert(membershipClasses)
      .values({ organisationId: orgAId, name: "Standard" })
      .returning();

    // Alice is a member of Org A only.
    const [alice] = await db
      .insert(members)
      .values({
        organisationId: orgAId,
        membershipClassId: memberClass.id,
        firstName: "Alice",
        lastName: "A",
        email: "alice@test.com",
      })
      .returning();
    await db.insert(organisationMembers).values({
      organisationId: orgAId,
      memberId: alice.id,
      role: "ADMIN",
      isActive: true,
    });
  });

  it("throws UNAUTHORISED when no user is signed in", async () => {
    signInAs(null);
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
    try {
      await requireSession(orgAId);
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHORISED");
    }
  });

  it("throws UNAUTHORISED when signed-in user is not a member of the org", async () => {
    signInAs("stranger@test.com");
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
  });

  it("throws UNAUTHORISED for cross-tenant attempts (Alice is in Org A, not Org B)", async () => {
    signInAs("alice@test.com");
    await expect(requireSession(orgBId)).rejects.toThrow(AuthError);
  });

  it("returns the session when signed-in user is an active member", async () => {
    signInAs("alice@test.com");
    const session = await requireSession(orgAId);
    expect(session.email).toBe("alice@test.com");
    expect(session.organisationId).toBe(orgAId);
    expect(session.role).toBe("ADMIN");
  });

  it("throws UNAUTHORISED when membership row exists but is inactive", async () => {
    const db = await getTestDb();
    // Alice's existing active membership → deactivate it
    const { eq, and } = await import("drizzle-orm");
    await db
      .update(organisationMembers)
      .set({ isActive: false })
      .where(
        and(
          eq(organisationMembers.organisationId, orgAId),
          eq(organisationMembers.memberId, /* Alice's id, looked up */ (
            await db
              .select({ id: members.id })
              .from(members)
              .where(eq(members.email, "alice@test.com"))
          )[0].id)
        )
      );
    signInAs("alice@test.com");
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
  });
});
