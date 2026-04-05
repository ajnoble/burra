import { db } from "./index";
import {
  organisations,
  lodges,
  rooms,
  beds,
  membershipClasses,
  members,
  organisationMembers,
  seasons,
  bookingRounds,
  tariffs,
  cancellationPolicies,
  bookings,
  bookingGuests,
  availabilityCache,
} from "./schema";

const DEMO_NAMES = [
  { first: "James", last: "Mitchell" },
  { first: "Sarah", last: "Thompson" },
  { first: "Michael", last: "Anderson" },
  { first: "Emily", last: "Wilson" },
  { first: "David", last: "Taylor" },
  { first: "Jessica", last: "Brown" },
  { first: "Daniel", last: "White" },
  { first: "Laura", last: "Harris" },
  { first: "Andrew", last: "Martin" },
  { first: "Rachel", last: "Clark" },
  { first: "Thomas", last: "Lewis" },
  { first: "Sophie", last: "Walker" },
  { first: "Christopher", last: "Hall" },
  { first: "Emma", last: "Young" },
  { first: "Matthew", last: "King" },
  { first: "Hannah", last: "Wright" },
  { first: "Joshua", last: "Scott" },
  { first: "Olivia", last: "Green" },
  { first: "Benjamin", last: "Adams" },
  { first: "Chloe", last: "Baker" },
  { first: "Samuel", last: "Nelson" },
  { first: "Grace", last: "Carter" },
  { first: "William", last: "Evans" },
  { first: "Mia", last: "Turner" },
  { first: "Jack", last: "Phillips" },
  { first: "Isabella", last: "Campbell" },
  { first: "Liam", last: "Parker" },
  { first: "Charlotte", last: "Edwards" },
  { first: "Noah", last: "Stewart" },
  { first: "Amelia", last: "Morris" },
];

async function seed() {
  console.log("Seeding demo data...");

  // Organisation
  const [org] = await db
    .insert(organisations)
    .values({
      name: "Alpine Demo Club",
      slug: "demo",
      contactEmail: "admin@alpinedemo.example.com",
      timezone: "Australia/Melbourne",
    })
    .returning();
  console.log(`Created organisation: ${org.name}`);

  // Lodge
  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Demo Lodge",
      address: "1 Mountain Road, Mt Demo VIC 3723",
      totalBeds: 20,
    })
    .returning();

  // Rooms and Beds
  const roomConfigs = [
    { name: "Room 1 - Bunkroom", floor: "Ground", capacity: 6 },
    { name: "Room 2 - Bunkroom", floor: "Ground", capacity: 4 },
    { name: "Room 3 - Twin", floor: "First", capacity: 2 },
    { name: "Room 4 - Twin", floor: "First", capacity: 2 },
    { name: "Room 5 - Family", floor: "First", capacity: 4 },
    { name: "Room 6 - Double", floor: "First", capacity: 2 },
  ];

  for (let i = 0; i < roomConfigs.length; i++) {
    const config = roomConfigs[i];
    const [room] = await db
      .insert(rooms)
      .values({
        lodgeId: lodge.id,
        name: config.name,
        floor: config.floor,
        capacity: config.capacity,
        sortOrder: i,
      })
      .returning();

    for (let b = 0; b < config.capacity; b++) {
      await db.insert(beds).values({
        roomId: room.id,
        label: `Bed ${b + 1}`,
        sortOrder: b,
      });
    }
  }
  console.log("Created 6 rooms with 20 beds");

  // Membership Classes
  const classConfigs = [
    { name: "Full Member", sortOrder: 0 },
    { name: "Associate", sortOrder: 1 },
    { name: "Life Member", sortOrder: 2 },
    { name: "Junior", sortOrder: 3 },
  ];

  const createdClasses: Record<string, string> = {};
  for (const c of classConfigs) {
    const [mc] = await db
      .insert(membershipClasses)
      .values({
        organisationId: org.id,
        name: c.name,
        sortOrder: c.sortOrder,
      })
      .returning();
    createdClasses[c.name] = mc.id;
  }
  console.log("Created 4 membership classes");

  // Season
  const [season] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Winter 2027",
      startDate: "2027-06-01",
      endDate: "2027-10-05",
      isActive: true,
    })
    .returning();

  // Booking Rounds
  const [priorityRound] = await db
    .insert(bookingRounds)
    .values([
      {
        seasonId: season.id,
        name: "Member Priority Round",
        opensAt: new Date("2027-03-01T08:00:00+11:00"),
        closesAt: new Date("2027-03-15T23:59:59+11:00"),
        allowedMembershipClassIds: [
          createdClasses["Full Member"],
          createdClasses["Life Member"],
        ],
        maxNightsPerMember: 14,
        maxNightsPerBooking: 7,
        sortOrder: 0,
      },
      {
        seasonId: season.id,
        name: "General Booking",
        opensAt: new Date("2027-03-16T08:00:00+11:00"),
        closesAt: new Date("2027-09-30T23:59:59+10:00"),
        allowedMembershipClassIds: Object.values(createdClasses),
        maxNightsPerBooking: 7,
        sortOrder: 1,
      },
    ])
    .returning();
  console.log("Created season with 2 booking rounds");

  // Tariffs
  const tariffConfigs = [
    {
      membershipClassId: null,
      weekday: 8500,
      weekend: 10500,
      fiveNight: 500,
      sevenNight: 1000,
    },
    {
      membershipClassId: createdClasses["Full Member"],
      weekday: 7000,
      weekend: 9000,
      fiveNight: 500,
      sevenNight: 1000,
    },
    {
      membershipClassId: createdClasses["Life Member"],
      weekday: 5000,
      weekend: 7000,
      fiveNight: 500,
      sevenNight: 1500,
    },
    {
      membershipClassId: createdClasses["Junior"],
      weekday: 3500,
      weekend: 4500,
      fiveNight: 0,
      sevenNight: 500,
    },
  ];

  for (const t of tariffConfigs) {
    await db.insert(tariffs).values({
      lodgeId: lodge.id,
      seasonId: season.id,
      membershipClassId: t.membershipClassId,
      pricePerNightWeekdayCents: t.weekday,
      pricePerNightWeekendCents: t.weekend,
      discountFiveNightsBps: t.fiveNight,
      discountSevenNightsBps: t.sevenNight,
    });
  }
  console.log("Created 4 tariffs");

  // Cancellation Policy
  const [policy] = await db
    .insert(cancellationPolicies)
    .values({
      organisationId: org.id,
      name: "Standard Policy",
      rules: [
        { daysBeforeCheckin: 60, forfeitPercentage: 20 },
        { daysBeforeCheckin: 14, forfeitPercentage: 50 },
        { daysBeforeCheckin: 0, forfeitPercentage: 100 },
      ],
      isDefault: true,
    })
    .returning();

  // Members
  const memberIds: string[] = [];
  for (let i = 0; i < DEMO_NAMES.length; i++) {
    const name = DEMO_NAMES[i];
    const classKey =
      i < 15
        ? "Full Member"
        : i < 22
          ? "Associate"
          : i < 25
            ? "Life Member"
            : "Junior";

    // Generate a date of birth — juniors are under 18
    const year = classKey === "Junior" ? 2012 : 1970 + (i % 30);
    const dob = `${year}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;

    const [member] = await db
      .insert(members)
      .values({
        organisationId: org.id,
        membershipClassId: createdClasses[classKey],
        firstName: name.first,
        lastName: name.last,
        email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}@example.com`,
        dateOfBirth: dob,
        memberNumber: `DEM-${String(i + 1).padStart(4, "0")}`,
        isFinancial: i < 27, // last 3 are unfinancial
      })
      .returning();

    memberIds.push(member.id);

    // Give first member ADMIN role, second BOOKING_OFFICER, third COMMITTEE
    const role =
      i === 0
        ? "ADMIN"
        : i === 1
          ? "BOOKING_OFFICER"
          : i === 2
            ? "COMMITTEE"
            : "MEMBER";

    await db.insert(organisationMembers).values({
      organisationId: org.id,
      memberId: member.id,
      role: role as any,
    });
  }

  // Link some juniors as family members of the first few members
  for (let i = 25; i < 30; i++) {
    await db
      .update(members)
      .set({ primaryMemberId: memberIds[i - 25] })
      .where(
        // Simple approach: update by matching the member we just created
        // In practice we'd use the member ID directly
        require("drizzle-orm").eq(members.id, memberIds[i])
      );
  }
  console.log("Created 30 members with roles and family links");

  // Demo Bookings (15 in various states)
  const bookingConfigs = [
    { memberIdx: 0, checkIn: "2027-07-05", checkOut: "2027-07-12", status: "CONFIRMED" as const, guests: 2 },
    { memberIdx: 1, checkIn: "2027-07-05", checkOut: "2027-07-10", status: "CONFIRMED" as const, guests: 1 },
    { memberIdx: 2, checkIn: "2027-07-12", checkOut: "2027-07-19", status: "CONFIRMED" as const, guests: 3 },
    { memberIdx: 3, checkIn: "2027-07-12", checkOut: "2027-07-17", status: "PENDING" as const, guests: 2 },
    { memberIdx: 4, checkIn: "2027-07-19", checkOut: "2027-07-26", status: "CONFIRMED" as const, guests: 1 },
    { memberIdx: 5, checkIn: "2027-07-19", checkOut: "2027-07-24", status: "WAITLISTED" as const, guests: 2 },
    { memberIdx: 6, checkIn: "2027-08-02", checkOut: "2027-08-09", status: "CONFIRMED" as const, guests: 4 },
    { memberIdx: 7, checkIn: "2027-08-02", checkOut: "2027-08-07", status: "CONFIRMED" as const, guests: 1 },
    { memberIdx: 8, checkIn: "2027-08-09", checkOut: "2027-08-14", status: "CANCELLED" as const, guests: 2 },
    { memberIdx: 9, checkIn: "2027-08-16", checkOut: "2027-08-23", status: "CONFIRMED" as const, guests: 1 },
    { memberIdx: 10, checkIn: "2027-08-23", checkOut: "2027-08-30", status: "CONFIRMED" as const, guests: 2 },
    { memberIdx: 11, checkIn: "2027-09-06", checkOut: "2027-09-13", status: "PENDING" as const, guests: 1 },
    { memberIdx: 12, checkIn: "2027-09-06", checkOut: "2027-09-11", status: "CONFIRMED" as const, guests: 3 },
    { memberIdx: 13, checkIn: "2027-09-13", checkOut: "2027-09-20", status: "CONFIRMED" as const, guests: 2 },
    { memberIdx: 14, checkIn: "2027-09-20", checkOut: "2027-09-27", status: "COMPLETED" as const, guests: 1 },
  ];

  let bookingSeq = 1;
  for (const bc of bookingConfigs) {
    const nights =
      (new Date(bc.checkOut).getTime() - new Date(bc.checkIn).getTime()) /
      (1000 * 60 * 60 * 24);
    const perNight = 7000; // Full member weekday rate
    const subtotal = perNight * nights * bc.guests;

    const ref = `DEMO-2027-${String(bookingSeq++).padStart(4, "0")}`;

    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: org.id,
        lodgeId: lodge.id,
        bookingRoundId: priorityRound.id,
        cancellationPolicyId: policy.id,
        primaryMemberId: memberIds[bc.memberIdx],
        status: bc.status,
        checkInDate: bc.checkIn,
        checkOutDate: bc.checkOut,
        totalNights: nights,
        subtotalCents: subtotal,
        totalAmountCents: subtotal,
        bookingReference: ref,
        cancelledAt:
          bc.status === "CANCELLED" ? new Date("2027-06-15") : undefined,
        cancellationReason:
          bc.status === "CANCELLED" ? "Change of plans" : undefined,
      })
      .returning();

    // Add primary member as guest
    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: memberIds[bc.memberIdx],
      pricePerNightCents: perNight,
      totalAmountCents: perNight * nights,
    });

    // Add additional guests
    for (let g = 1; g < bc.guests; g++) {
      const guestIdx = (bc.memberIdx + g) % memberIds.length;
      await db.insert(bookingGuests).values({
        bookingId: booking.id,
        memberId: memberIds[guestIdx],
        pricePerNightCents: perNight,
        totalAmountCents: perNight * nights,
      });
    }
  }
  console.log("Created 15 demo bookings");

  // Populate AvailabilityCache for the season
  const seasonStart = new Date("2027-06-01");
  const seasonEnd = new Date("2027-10-05");
  const cacheRows = [];
  for (
    let d = new Date(seasonStart);
    d <= seasonEnd;
    d.setDate(d.getDate() + 1)
  ) {
    cacheRows.push({
      lodgeId: lodge.id,
      date: d.toISOString().split("T")[0],
      totalBeds: 20,
      bookedBeds: 0,
    });
  }
  await db.insert(availabilityCache).values(cacheRows);
  console.log(`Created ${cacheRows.length} availability cache rows`);

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
