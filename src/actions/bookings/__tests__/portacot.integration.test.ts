import { describe, it, expect } from "vitest";
import { getTestDb } from "../../../db/test-setup";
import {
  organisations,
  members,
  membershipClasses,
  lodges,
  seasons,
  bookingRounds,
  bookings,
  bookingGuests,
} from "../../../db/schema";
import { getPortaCotAvailability } from "../portacot";

// Seed a minimal org + lodge with a given portaCotCount, plus a season and round
async function seedBase(portaCotCount: number) {
  const db = await getTestDb();

  const [org] = await db
    .insert(organisations)
    .values({ name: "Test Org", slug: "test-org" })
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
      lastName: "Member",
      email: "test@example.com",
    })
    .returning();

  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Test Lodge",
      totalBeds: 20,
      portaCotCount,
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

  return { org, member, lodge, round };
}

async function insertBookingWithCot(opts: {
  orgId: string;
  lodgeId: string;
  roundId: string;
  memberId: string;
  ref: string;
  checkIn: string;
  checkOut: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  portaCotRequested: boolean;
}) {
  const db = await getTestDb();
  const [booking] = await db
    .insert(bookings)
    .values({
      organisationId: opts.orgId,
      lodgeId: opts.lodgeId,
      bookingRoundId: opts.roundId,
      primaryMemberId: opts.memberId,
      bookingReference: opts.ref,
      checkInDate: opts.checkIn,
      checkOutDate: opts.checkOut,
      totalNights: 2,
      subtotalCents: 10000,
      totalAmountCents: 10000,
      status: opts.status,
    })
    .returning();

  await db.insert(bookingGuests).values({
    bookingId: booking.id,
    memberId: opts.memberId,
    pricePerNightCents: 5000,
    totalAmountCents: 10000,
    portaCotRequested: opts.portaCotRequested,
  });

  return booking;
}

describe("getPortaCotAvailability (integration)", () => {
  it("returns full count when no cots are booked", async () => {
    const { lodge } = await seedBase(3);

    const result = await getPortaCotAvailability(
      lodge.id,
      "2026-07-10",
      "2026-07-12"
    );

    expect(result.total).toBe(3);
    expect(result.booked).toBe(0);
    expect(result.available).toBe(3);
  });

  it("subtracts cots from overlapping confirmed bookings", async () => {
    const { org, member, lodge, round } = await seedBase(3);

    await insertBookingWithCot({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-001",
      checkIn: "2026-07-08",
      checkOut: "2026-07-11",
      status: "CONFIRMED",
      portaCotRequested: true,
    });

    const result = await getPortaCotAvailability(
      lodge.id,
      "2026-07-10",
      "2026-07-12"
    );

    expect(result.total).toBe(3);
    expect(result.booked).toBe(1);
    expect(result.available).toBe(2);
  });

  it("ignores cancelled bookings", async () => {
    const { org, member, lodge, round } = await seedBase(3);

    await insertBookingWithCot({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-002",
      checkIn: "2026-07-08",
      checkOut: "2026-07-11",
      status: "CANCELLED",
      portaCotRequested: true,
    });

    const result = await getPortaCotAvailability(
      lodge.id,
      "2026-07-10",
      "2026-07-12"
    );

    expect(result.total).toBe(3);
    expect(result.booked).toBe(0);
    expect(result.available).toBe(3);
  });

  it("ignores non-overlapping bookings", async () => {
    const { org, member, lodge, round } = await seedBase(3);

    // Booking completely before query window
    await insertBookingWithCot({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-003",
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
      status: "CONFIRMED",
      portaCotRequested: true,
    });

    // Booking completely after query window
    await insertBookingWithCot({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-004",
      checkIn: "2026-07-20",
      checkOut: "2026-07-25",
      status: "CONFIRMED",
      portaCotRequested: true,
    });

    const result = await getPortaCotAvailability(
      lodge.id,
      "2026-07-10",
      "2026-07-12"
    );

    expect(result.total).toBe(3);
    expect(result.booked).toBe(0);
    expect(result.available).toBe(3);
  });
});
