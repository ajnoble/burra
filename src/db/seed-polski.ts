import { db } from "./index";
import {
  organisations,
  lodges,
  rooms,
  beds,
  membershipClasses,
  seasons,
  bookingRounds,
  tariffs,
  cancellationPolicies,
} from "./schema";

/**
 * Polski Ski Club seed — club configuration only, no member data.
 * Members will be imported via CSV.
 *
 * Lodge layout, membership classes, and tariffs are placeholders
 * until confirmed with the club committee.
 */
async function seedPolski() {
  console.log("Seeding Polski Ski Club configuration...");

  // Organisation
  const [org] = await db
    .insert(organisations)
    .values({
      name: "Polski Ski Club",
      slug: "polski",
      contactEmail: "secretary@polskiskiclub.example.com",
      timezone: "Australia/Melbourne",
    })
    .returning();

  // Lodge — placeholder layout, update once confirmed
  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Polski Lodge, Mt Buller",
      address: "Mt Buller Alpine Village, VIC 3723",
      totalBeds: 30, // placeholder
    })
    .returning();

  // Placeholder rooms — update when real layout confirmed
  const roomConfigs = [
    { name: "Room 1", capacity: 6 },
    { name: "Room 2", capacity: 6 },
    { name: "Room 3", capacity: 4 },
    { name: "Room 4", capacity: 4 },
    { name: "Room 5", capacity: 4 },
    { name: "Room 6", capacity: 2 },
    { name: "Room 7", capacity: 2 },
    { name: "Room 8", capacity: 2 },
  ];

  for (let i = 0; i < roomConfigs.length; i++) {
    const config = roomConfigs[i];
    const [room] = await db
      .insert(rooms)
      .values({
        lodgeId: lodge.id,
        name: config.name,
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
  console.log("Created 8 rooms with 30 beds (placeholder layout)");

  // Membership Classes — placeholder, confirm with secretary
  const classConfigs = [
    { name: "Full Member", sortOrder: 0 },
    { name: "Associate", sortOrder: 1 },
    { name: "Life Member", sortOrder: 2 },
    { name: "Junior", sortOrder: 3 },
    { name: "Social", sortOrder: 4 },
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
  console.log("Created 5 membership classes (placeholder)");

  // Season
  const [season] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Winter 2027",
      startDate: "2027-06-07",
      endDate: "2027-10-04",
      isActive: true,
    })
    .returning();

  // Booking Rounds — placeholder, confirm with booking officer
  await db.insert(bookingRounds).values([
    {
      seasonId: season.id,
      name: "Member Priority Round",
      opensAt: new Date("2027-03-01T08:00:00+11:00"),
      closesAt: new Date("2027-03-14T23:59:59+11:00"),
      allowedMembershipClassIds: [
        createdClasses["Full Member"],
        createdClasses["Life Member"],
      ],
      maxNightsPerMember: 14,
      maxNightsPerBooking: 7,
      requiresApproval: false,
      sortOrder: 0,
    },
    {
      seasonId: season.id,
      name: "General Booking",
      opensAt: new Date("2027-03-15T08:00:00+11:00"),
      closesAt: new Date("2027-09-30T23:59:59+10:00"),
      allowedMembershipClassIds: Object.values(createdClasses),
      maxNightsPerBooking: 7,
      requiresApproval: false,
      sortOrder: 1,
    },
  ]);
  console.log("Created season with 2 booking rounds (placeholder)");

  // Tariffs — placeholder rates, confirm with committee
  await db.insert(tariffs).values([
    {
      lodgeId: lodge.id,
      seasonId: season.id,
      membershipClassId: null, // default
      pricePerNightWeekdayCents: 9000,
      pricePerNightWeekendCents: 11000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    },
    {
      lodgeId: lodge.id,
      seasonId: season.id,
      membershipClassId: createdClasses["Full Member"],
      pricePerNightWeekdayCents: 7500,
      pricePerNightWeekendCents: 9500,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    },
    {
      lodgeId: lodge.id,
      seasonId: season.id,
      membershipClassId: createdClasses["Life Member"],
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 1000,
      discountSevenNightsBps: 1500,
    },
    {
      lodgeId: lodge.id,
      seasonId: season.id,
      membershipClassId: createdClasses["Junior"],
      pricePerNightWeekdayCents: 4000,
      pricePerNightWeekendCents: 5000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 500,
    },
  ]);
  console.log("Created 4 tariffs (placeholder rates)");

  // Cancellation Policy
  await db.insert(cancellationPolicies).values({
    organisationId: org.id,
    name: "Standard Policy",
    rules: [
      { daysBeforeCheckin: 60, forfeitPercentage: 20 },
      { daysBeforeCheckin: 14, forfeitPercentage: 50 },
      { daysBeforeCheckin: 0, forfeitPercentage: 100 },
    ],
    isDefault: true,
  });

  console.log("\nPolski Ski Club seed complete!");
  console.log("Note: No member data seeded — use CSV import to add members.");
  process.exit(0);
}

seedPolski().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
