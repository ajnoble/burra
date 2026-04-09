import { describe, it, expect, vi } from "vitest";
import { updateAdminNotes } from "../admin-notes";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
  lodges,
  bookings,
  seasons,
  bookingRounds,
} from "../../../db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function seedOrgLodgeBooking(opts: {
  orgName: string;
  orgSlug: string;
  memberEmail: string;
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
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      membershipClassId: mclass.id,
      firstName: "Test",
      lastName: opts.memberEmail,
      email: opts.memberEmail,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Main Lodge",
      totalBeds: 20,
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Test Season",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    .returning();
  const [round] = await db
    .insert(bookingRounds)
    .values({
      seasonId: season.id,
      name: "Open Round",
      opensAt: new Date("2026-01-01"),
      closesAt: new Date("2026-12-31"),
    })
    .returning();
  const [booking] = await db
    .insert(bookings)
    .values({
      organisationId: org.id,
      lodgeId: lodge.id,
      bookingRoundId: round.id,
      primaryMemberId: member.id,
      bookingReference: `TST-${opts.orgSlug}`,
      checkInDate: "2026-07-10",
      checkOutDate: "2026-07-12",
      totalNights: 2,
      subtotalCents: 10000,
      totalAmountCents: 10000,
      status: "CONFIRMED",
    })
    .returning();
  return { orgId: org.id, orgSlug: org.slug, memberId: member.id, bookingId: booking.id };
}

describe("updateAdminNotes (integration — auth)", () => {
  it("rejects cross-tenant attempts (Org A admin signed in, updating Org B booking)", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "admin-a@test.com",
      role: "ADMIN",
    });
    const b = await seedOrgLodgeBooking({
      orgName: "Org B",
      orgSlug: "org-b",
      memberEmail: "admin-b@test.com",
      role: "ADMIN",
    });
    signInAs("admin-a@test.com");
    const result = await updateAdminNotes({
      bookingId: b.bookingId,
      organisationId: b.orgId,
      notes: "cross-tenant attack",
      slug: "org-b",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("rejects plain MEMBER trying to update admin notes (role gap)", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "member-a@test.com",
      role: "MEMBER",
    });
    signInAs("member-a@test.com");
    const result = await updateAdminNotes({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      notes: "should be rejected",
      slug: "org-a",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BOOKING_OFFICER/);
  });

  it("allows BOOKING_OFFICER to update admin notes on a same-org booking", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "officer-a@test.com",
      role: "BOOKING_OFFICER",
    });
    signInAs("officer-a@test.com");
    const newNotes = "Special dietary requirements noted";
    const result = await updateAdminNotes({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      notes: newNotes,
      slug: "org-a",
    });
    expect(result.success).toBe(true);

    // Verify notes are persisted to DB
    const db = await getTestDb();
    const { eq } = await import("drizzle-orm");
    const [updated] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, a.bookingId));
    expect(updated.adminNotes).toBe(newNotes);
  });
});
