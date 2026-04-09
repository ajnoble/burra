import { describe, it, expect, vi } from "vitest";
import { getBookingSummary } from "../booking-summary";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "../../../db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

const BASE_FILTERS = {
  dateFrom: "2024-01-01",
  dateTo: "2024-12-31",
};

describe("getBookingSummary (integration — auth)", () => {
  it("rejects cross-tenant: Org A COMMITTEE cannot read Org B booking summary", async () => {
    await seedOrgMember({
      orgName: "Org A",
      slug: "org-a-bks1",
      email: "committee-a-bks@test.com",
      role: "COMMITTEE",
    });
    const { org: orgB } = await seedOrgMember({
      orgName: "Org B",
      slug: "org-b-bks1",
      email: "committee-b-bks@test.com",
      role: "COMMITTEE",
    });

    signInAs("committee-a-bks@test.com");

    const result = await getBookingSummary({
      organisationId: orgB.id,
      ...BASE_FILTERS,
    });

    expect("success" in result && result.success === false).toBe(true);
    expect((result as { success: false; error: string }).error).toMatch(
      /signed in/i
    );
  });

  it("rejects BOOKING_OFFICER role: cannot access booking summary reports", async () => {
    const { org } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a-bks2",
      email: "booking-officer-bks@test.com",
      role: "BOOKING_OFFICER",
    });

    signInAs("booking-officer-bks@test.com");

    const result = await getBookingSummary({
      organisationId: org.id,
      ...BASE_FILTERS,
    });

    expect("success" in result && result.success === false).toBe(true);
    expect((result as { success: false; error: string }).error).toMatch(
      /COMMITTEE/
    );
  });

  it("happy path: COMMITTEE member of own org passes auth and returns empty result", async () => {
    const { org } = await seedOrgMember({
      orgName: "Org A",
      slug: "org-a-bks3",
      email: "committee-happy-bks@test.com",
      role: "COMMITTEE",
    });

    signInAs("committee-happy-bks@test.com");

    const result = await getBookingSummary({
      organisationId: org.id,
      ...BASE_FILTERS,
    });

    expect("success" in result).toBe(false);
    expect((result as { rows: unknown[]; total: number }).rows).toEqual([]);
    expect((result as { rows: unknown[]; total: number }).total).toBe(0);
  });
});
