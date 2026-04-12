import { describe, it, expect } from "vitest";
import { getMatrixData } from "./matrix";
import { getTestDb } from "../../db/test-setup";
import {
  organisations,
  lodges,
  rooms,
  beds,
  members,
  membershipClasses,
  seasons,
  bookingRounds,
  bookings,
  bookingGuests,
  bedHolds,
  availabilityOverrides,
} from "../../db/schema";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedBase(slug: string) {
  const db = await getTestDb();

  const [org] = await db
    .insert(organisations)
    .values({ name: `Org ${slug}`, slug })
    .returning();

  const [mclass] = await db
    .insert(membershipClasses)
    .values({ organisationId: org.id, name: "Standard" })
    .returning();

  const [lodge] = await db
    .insert(lodges)
    .values({ organisationId: org.id, name: "Test Lodge", totalBeds: 4 })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Season 2026",
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

  return { db, org, mclass, lodge, season, round };
}

async function seedRoomsAndBeds(lodgeId: string) {
  const db = await getTestDb();

  const [room1] = await db
    .insert(rooms)
    .values({ lodgeId, name: "Room A", capacity: 2, sortOrder: 0 })
    .returning();

  const [room2] = await db
    .insert(rooms)
    .values({ lodgeId, name: "Room B", capacity: 2, sortOrder: 1 })
    .returning();

  const [bed1] = await db
    .insert(beds)
    .values({ roomId: room1.id, label: "Bed 1", sortOrder: 0 })
    .returning();

  const [bed2] = await db
    .insert(beds)
    .values({ roomId: room1.id, label: "Bed 2", sortOrder: 1 })
    .returning();

  const [bed3] = await db
    .insert(beds)
    .values({ roomId: room2.id, label: "Bed 3", sortOrder: 0 })
    .returning();

  const [bed4] = await db
    .insert(beds)
    .values({ roomId: room2.id, label: "Bed 4", sortOrder: 1 })
    .returning();

  return { room1, room2, bed1, bed2, bed3, bed4 };
}

async function seedMember(
  orgId: string,
  mclassId: string,
  firstName: string,
  lastName: string,
  email: string
) {
  const db = await getTestDb();
  const [member] = await db
    .insert(members)
    .values({ organisationId: orgId, membershipClassId: mclassId, firstName, lastName, email })
    .returning();
  return member;
}

async function seedBooking(opts: {
  orgId: string;
  lodgeId: string;
  roundId: string;
  memberId: string;
  ref: string;
  checkIn: string;
  checkOut: string;
  status?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "COMPLETED";
}) {
  const db = await getTestDb();
  const nights =
    (new Date(opts.checkOut).getTime() - new Date(opts.checkIn).getTime()) /
    86400000;
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
      totalNights: nights,
      subtotalCents: 10000,
      totalAmountCents: 10000,
      status: opts.status ?? "CONFIRMED",
    })
    .returning();
  return booking;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getMatrixData", () => {
  it("returns rooms with their beds grouped correctly for a lodge", async () => {
    const { lodge } = await seedBase("lodge-rooms-1");
    await seedRoomsAndBeds(lodge.id);

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.rooms).toHaveLength(2);

    const roomA = result.rooms.find((r) => r.name === "Room A");
    const roomB = result.rooms.find((r) => r.name === "Room B");

    expect(roomA).toBeDefined();
    expect(roomB).toBeDefined();
    expect(roomA!.beds).toHaveLength(2);
    expect(roomB!.beds).toHaveLength(2);

    const bedLabels = roomA!.beds.map((b) => b.label).sort();
    expect(bedLabels).toEqual(["Bed 1", "Bed 2"]);
  });

  it("returns bookings overlapping the date range with guest names", async () => {
    const { org, mclass, lodge, round } = await seedBase("bookings-overlap-1");
    const { bed1 } = await seedRoomsAndBeds(lodge.id);

    const alice = await seedMember(org.id, mclass.id, "Alice", "Smith", "alice@test.com");
    const bob = await seedMember(org.id, mclass.id, "Bob", "Jones", "bob@test.com");

    // Booking overlapping the window (check-in before window end, check-out after window start)
    const booking = await seedBooking({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: alice.id,
      ref: "TST-OVERLAP-001",
      checkIn: "2026-07-05",
      checkOut: "2026-07-10",
    });

    const db = await getTestDb();
    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: alice.id,
      bedId: bed1.id,
      pricePerNightCents: 2000,
      totalAmountCents: 10000,
    });
    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: bob.id,
      bedId: bed1.id,
      pricePerNightCents: 2000,
      totalAmountCents: 10000,
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.bookings).toHaveLength(1);
    const b = result.bookings[0];
    expect(b.bookingReference).toBe("TST-OVERLAP-001");
    expect(b.checkInDate).toBe("2026-07-05");
    expect(b.checkOutDate).toBe("2026-07-10");

    // Guest names must be present
    const guestNames = b.guests.map((g) => g.firstName + " " + g.lastName).sort();
    expect(guestNames).toEqual(["Alice Smith", "Bob Jones"]);
  });

  it("excludes cancelled bookings", async () => {
    const { org, mclass, lodge, round } = await seedBase("bookings-cancelled-1");

    const member = await seedMember(org.id, mclass.id, "Carol", "Dean", "carol@test.com");

    await seedBooking({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-CANCEL-001",
      checkIn: "2026-07-05",
      checkOut: "2026-07-10",
      status: "CANCELLED",
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.bookings).toHaveLength(0);
  });

  it("excludes bookings outside the date range", async () => {
    const { org, mclass, lodge, round } = await seedBase("bookings-outside-1");

    const member = await seedMember(org.id, mclass.id, "Dave", "Hill", "dave@test.com");

    // Booking entirely before the window
    await seedBooking({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-BEFORE-001",
      checkIn: "2026-06-01",
      checkOut: "2026-06-10",
    });

    // Booking entirely after the window
    await seedBooking({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-AFTER-001",
      checkIn: "2026-08-01",
      checkOut: "2026-08-10",
    });

    // Booking that starts exactly on the endDate (half-open: does NOT overlap)
    await seedBooking({
      orgId: org.id,
      lodgeId: lodge.id,
      roundId: round.id,
      memberId: member.id,
      ref: "TST-STARTS-END-001",
      checkIn: "2026-07-31",
      checkOut: "2026-08-05",
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.bookings).toHaveLength(0);
  });

  it("returns availability overrides overlapping the date range", async () => {
    const { org, mclass, lodge } = await seedBase("overrides-1");

    // Need a member to satisfy createdByMemberId FK
    const member = await seedMember(org.id, mclass.id, "Admin", "User", "admin@test.com");
    const db = await getTestDb();

    // Override that overlaps the window
    await db.insert(availabilityOverrides).values({
      lodgeId: lodge.id,
      startDate: "2026-07-10",
      endDate: "2026-07-15",
      type: "CLOSURE",
      reason: "Maintenance",
      createdByMemberId: member.id,
    });

    // Override entirely outside the window
    await db.insert(availabilityOverrides).values({
      lodgeId: lodge.id,
      startDate: "2026-08-01",
      endDate: "2026-08-05",
      type: "EVENT",
      reason: "Summer Party",
      createdByMemberId: member.id,
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0].reason).toBe("Maintenance");
    expect(result.overrides[0].type).toBe("CLOSURE");
  });

  it("returns active (non-expired) bed holds", async () => {
    const { org, mclass, lodge, round } = await seedBase("holds-active-1");
    const { bed1 } = await seedRoomsAndBeds(lodge.id);

    const member = await seedMember(org.id, mclass.id, "Eve", "Lake", "eve@test.com");
    const db = await getTestDb();

    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await db.insert(bedHolds).values({
      lodgeId: lodge.id,
      bedId: bed1.id,
      memberId: member.id,
      bookingRoundId: round.id,
      checkInDate: "2026-07-10",
      checkOutDate: "2026-07-12",
      expiresAt: futureExpiry,
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.holds).toHaveLength(1);
    expect(result.holds[0].bedId).toBe(bed1.id);
    expect(result.holds[0].memberId).toBe(member.id);
  });

  it("excludes expired bed holds", async () => {
    const { org, mclass, lodge, round } = await seedBase("holds-expired-1");
    const { bed1 } = await seedRoomsAndBeds(lodge.id);

    const member = await seedMember(org.id, mclass.id, "Frank", "Stone", "frank@test.com");
    const db = await getTestDb();

    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    await db.insert(bedHolds).values({
      lodgeId: lodge.id,
      bedId: bed1.id,
      memberId: member.id,
      bookingRoundId: round.id,
      checkInDate: "2026-07-10",
      checkOutDate: "2026-07-12",
      expiresAt: pastExpiry,
    });

    const result = await getMatrixData(lodge.id, "2026-07-01", "2026-07-31");

    expect(result.holds).toHaveLength(0);
  });
});
