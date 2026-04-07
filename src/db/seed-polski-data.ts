import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  organisations,
  members,
  organisationMembers,
  membershipClasses,
  lodges,
  rooms,
  beds,
  seasons,
  bookingRounds,
  bookings,
  bookingGuests,
  availabilityCache,
  cancellationPolicies,
  tariffs,
  profiles,
  subscriptions,
} from "./schema";
import { createClient } from "@supabase/supabase-js";

const MEMBERS_DATA = [
  // Admin & officers first
  { first: "Marek", last: "Kowalski", class: "Full Member", role: "ADMIN" as const, dob: "1975-03-15" },
  { first: "Anna", last: "Nowak", class: "Full Member", role: "BOOKING_OFFICER" as const, dob: "1980-07-22" },
  { first: "Piotr", last: "Wisniewski", class: "Full Member", role: "COMMITTEE" as const, dob: "1968-11-30" },
  // Regular full members
  { first: "Katarzyna", last: "Wojcik", class: "Full Member", role: "MEMBER" as const, dob: "1982-05-10" },
  { first: "Tomasz", last: "Kaminski", class: "Full Member", role: "MEMBER" as const, dob: "1977-09-18" },
  { first: "Magdalena", last: "Lewandowska", class: "Full Member", role: "MEMBER" as const, dob: "1985-01-25" },
  { first: "Jan", last: "Zielinski", class: "Full Member", role: "MEMBER" as const, dob: "1990-04-12" },
  { first: "Agnieszka", last: "Szymanska", class: "Full Member", role: "MEMBER" as const, dob: "1988-08-07" },
  { first: "Krzysztof", last: "Wozniak", class: "Full Member", role: "MEMBER" as const, dob: "1972-12-03" },
  { first: "Monika", last: "Dabrowski", class: "Full Member", role: "MEMBER" as const, dob: "1983-06-20" },
  { first: "Andrzej", last: "Kozlowski", class: "Full Member", role: "MEMBER" as const, dob: "1976-02-14" },
  { first: "Ewa", last: "Jankowska", class: "Full Member", role: "MEMBER" as const, dob: "1991-10-08" },
  { first: "Pawel", last: "Mazur", class: "Full Member", role: "MEMBER" as const, dob: "1979-03-28" },
  { first: "Barbara", last: "Krawczyk", class: "Full Member", role: "MEMBER" as const, dob: "1986-07-16" },
  { first: "Michal", last: "Piotrowski", class: "Full Member", role: "MEMBER" as const, dob: "1981-11-22" },
  // Associates
  { first: "Stefan", last: "Grabowski", class: "Associate", role: "MEMBER" as const, dob: "1974-05-30" },
  { first: "Joanna", last: "Pawlak", class: "Associate", role: "MEMBER" as const, dob: "1987-09-14" },
  { first: "Robert", last: "Michalski", class: "Associate", role: "MEMBER" as const, dob: "1992-01-19" },
  { first: "Dorota", last: "Adamczyk", class: "Associate", role: "MEMBER" as const, dob: "1984-04-06" },
  { first: "Lukasz", last: "Dudek", class: "Associate", role: "MEMBER" as const, dob: "1989-08-25" },
  // Life members
  { first: "Stanislaw", last: "Borkowski", class: "Life Member", role: "MEMBER" as const, dob: "1950-06-10" },
  { first: "Helena", last: "Sikora", class: "Life Member", role: "MEMBER" as const, dob: "1952-02-28" },
  { first: "Kazimierz", last: "Walczak", class: "Life Member", role: "MEMBER" as const, dob: "1948-09-15" },
  // Juniors (children of full members)
  { first: "Zofia", last: "Kowalski", class: "Junior", role: "MEMBER" as const, dob: "2012-03-20", parentIdx: 0 },
  { first: "Jakub", last: "Kowalski", class: "Junior", role: "MEMBER" as const, dob: "2014-07-11", parentIdx: 0 },
  { first: "Maja", last: "Kaminski", class: "Junior", role: "MEMBER" as const, dob: "2013-05-08", parentIdx: 4 },
  { first: "Filip", last: "Zielinski", class: "Junior", role: "MEMBER" as const, dob: "2015-11-30", parentIdx: 6 },
  // Social
  { first: "Greg", last: "Thompson", class: "Social", role: "MEMBER" as const, dob: "1985-12-01" },
  { first: "Sarah", last: "Mitchell", class: "Social", role: "MEMBER" as const, dob: "1990-06-15" },
  { first: "David", last: "Chen", class: "Social", role: "MEMBER" as const, dob: "1978-10-22" },
];

async function seedPolskiData() {
  console.log("Seeding Polski Ski Club member & booking data...\n");

  // Get existing org
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, "polski"));

  if (!org) {
    console.error("Polski org not found! Run db:seed:polski first.");
    process.exit(1);
  }

  // Ensure membership classes exist
  const classConfigs = [
    { name: "Full Member", sortOrder: 0, annualFeeCents: 50000 },
    { name: "Associate", sortOrder: 1, annualFeeCents: 30000 },
    { name: "Life Member", sortOrder: 2, annualFeeCents: null },
    { name: "Junior", sortOrder: 3, annualFeeCents: null },
    { name: "Social", sortOrder: 4, annualFeeCents: 15000 },
  ];

  const classMap: Record<string, string> = {};
  const existingClasses = await db
    .select()
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  for (const cc of classConfigs) {
    const existing = existingClasses.find((c) => c.name === cc.name);
    if (existing) {
      classMap[cc.name] = existing.id;
      // Update annual fee if needed
      if (cc.annualFeeCents !== null) {
        await db
          .update(membershipClasses)
          .set({ annualFeeCents: cc.annualFeeCents })
          .where(eq(membershipClasses.id, existing.id));
      }
    } else {
      const [mc] = await db
        .insert(membershipClasses)
        .values({
          organisationId: org.id,
          name: cc.name,
          sortOrder: cc.sortOrder,
          annualFeeCents: cc.annualFeeCents,
        })
        .returning();
      classMap[cc.name] = mc.id;
    }
  }
  console.log("Membership classes ready");

  // Ensure lodge exists
  let [lodge] = await db
    .select()
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  if (!lodge) {
    [lodge] = await db
      .insert(lodges)
      .values({
        organisationId: org.id,
        name: "Polski Lodge, Mt Buller",
        address: "Mt Buller Alpine Village, VIC 3723",
        totalBeds: 30,
      })
      .returning();

    const roomConfigs = [
      { name: "Room 1 - Bunkroom", floor: "Ground", capacity: 6 },
      { name: "Room 2 - Bunkroom", floor: "Ground", capacity: 6 },
      { name: "Room 3 - Family", floor: "First", capacity: 4 },
      { name: "Room 4 - Family", floor: "First", capacity: 4 },
      { name: "Room 5 - Twin", floor: "First", capacity: 4 },
      { name: "Room 6 - Double", floor: "Second", capacity: 2 },
      { name: "Room 7 - Double", floor: "Second", capacity: 2 },
      { name: "Room 8 - Double", floor: "Second", capacity: 2 },
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
    console.log("Created lodge with 8 rooms and 30 beds");
  }

  // Ensure season exists
  let [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.organisationId, org.id));

  if (!season) {
    [season] = await db
      .insert(seasons)
      .values({
        organisationId: org.id,
        name: "Winter 2027",
        startDate: "2027-06-07",
        endDate: "2027-10-04",
        isActive: true,
      })
      .returning();

    await db.insert(bookingRounds).values([
      {
        seasonId: season.id,
        name: "Member Priority Round",
        opensAt: new Date("2027-03-01T08:00:00+11:00"),
        closesAt: new Date("2027-03-14T23:59:59+11:00"),
        allowedMembershipClassIds: [classMap["Full Member"], classMap["Life Member"]],
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
        allowedMembershipClassIds: Object.values(classMap),
        maxNightsPerBooking: 7,
        requiresApproval: false,
        sortOrder: 1,
      },
    ]);
    console.log("Created season with 2 booking rounds");

    // Tariffs
    await db.insert(tariffs).values([
      {
        lodgeId: lodge.id,
        seasonId: season.id,
        membershipClassId: null,
        pricePerNightWeekdayCents: 9000,
        pricePerNightWeekendCents: 11000,
        discountFiveNightsBps: 500,
        discountSevenNightsBps: 1000,
      },
      {
        lodgeId: lodge.id,
        seasonId: season.id,
        membershipClassId: classMap["Full Member"],
        pricePerNightWeekdayCents: 7500,
        pricePerNightWeekendCents: 9500,
        discountFiveNightsBps: 500,
        discountSevenNightsBps: 1000,
      },
      {
        lodgeId: lodge.id,
        seasonId: season.id,
        membershipClassId: classMap["Life Member"],
        pricePerNightWeekdayCents: 5000,
        pricePerNightWeekendCents: 7000,
        discountFiveNightsBps: 1000,
        discountSevenNightsBps: 1500,
      },
      {
        lodgeId: lodge.id,
        seasonId: season.id,
        membershipClassId: classMap["Junior"],
        pricePerNightWeekdayCents: 4000,
        pricePerNightWeekendCents: 5000,
        discountFiveNightsBps: 0,
        discountSevenNightsBps: 500,
      },
    ]);
    console.log("Created 4 tariffs");
  }

  const rnds = await db
    .select()
    .from(bookingRounds)
    .where(eq(bookingRounds.seasonId, season.id));
  const generalRound = rnds.find((r) => r.name === "General Booking")!;

  // Ensure cancellation policy exists
  let [policy] = await db
    .select()
    .from(cancellationPolicies)
    .where(eq(cancellationPolicies.organisationId, org.id));

  if (!policy) {
    [policy] = await db
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
  }

  const classes = await db
    .select()
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  // Create Supabase admin client for auth user creation
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Create members
  console.log("Creating members...");
  const memberIds: string[] = [];

  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    const m = MEMBERS_DATA[i];
    const email = `${m.first.toLowerCase()}.${m.last.toLowerCase()}@example.com`;
    const memberNum = `PSC-${String(i + 1).padStart(4, "0")}`;

    // Create auth user for non-juniors
    let authUserId: string | null = null;
    if (m.class !== "Junior") {
      const { data: newUser } = await adminClient.auth.admin.createUser({
        email,
        password: "testpass123",
        email_confirm: true,
      });
      if (newUser?.user) {
        authUserId = newUser.user.id;
        await db
          .insert(profiles)
          .values({
            id: authUserId,
            email,
            fullName: `${m.first} ${m.last}`,
          })
          .onConflictDoNothing();
      }
    }

    const [member] = await db
      .insert(members)
      .values({
        organisationId: org.id,
        membershipClassId: classMap[m.class],
        profileId: authUserId,
        firstName: m.first,
        lastName: m.last,
        email,
        dateOfBirth: m.dob,
        memberNumber: memberNum,
        isFinancial: i < 27, // last 3 (social members) are unfinancial
      })
      .returning();

    memberIds.push(member.id);

    await db.insert(organisationMembers).values({
      organisationId: org.id,
      memberId: member.id,
      role: m.role,
    });
  }

  // Link juniors to parents
  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    const m = MEMBERS_DATA[i] as typeof MEMBERS_DATA[number] & { parentIdx?: number };
    if (m.parentIdx !== undefined) {
      await db
        .update(members)
        .set({ primaryMemberId: memberIds[m.parentIdx] })
        .where(eq(members.id, memberIds[i]));
    }
  }

  console.log(`Created ${MEMBERS_DATA.length} members with auth accounts`);

  // Create bookings
  console.log("Creating bookings...");

  const bookingConfigs = [
    // Confirmed upcoming bookings
    { memberIdx: 0, checkIn: "2027-07-05", checkOut: "2027-07-12", status: "CONFIRMED" as const, guests: [0, 23, 24] },
    { memberIdx: 4, checkIn: "2027-07-05", checkOut: "2027-07-10", status: "CONFIRMED" as const, guests: [4, 25] },
    { memberIdx: 2, checkIn: "2027-07-12", checkOut: "2027-07-19", status: "CONFIRMED" as const, guests: [2, 3, 5] },
    { memberIdx: 6, checkIn: "2027-07-12", checkOut: "2027-07-17", status: "CONFIRMED" as const, guests: [6, 26] },
    { memberIdx: 8, checkIn: "2027-07-19", checkOut: "2027-07-26", status: "CONFIRMED" as const, guests: [8] },
    { memberIdx: 20, checkIn: "2027-07-19", checkOut: "2027-07-24", status: "CONFIRMED" as const, guests: [20, 21] },
    { memberIdx: 10, checkIn: "2027-08-02", checkOut: "2027-08-09", status: "CONFIRMED" as const, guests: [10, 11, 12, 13] },
    { memberIdx: 14, checkIn: "2027-08-02", checkOut: "2027-08-07", status: "CONFIRMED" as const, guests: [14] },
    // Pending bookings (awaiting approval)
    { memberIdx: 3, checkIn: "2027-08-09", checkOut: "2027-08-16", status: "PENDING" as const, guests: [3, 5] },
    { memberIdx: 15, checkIn: "2027-08-16", checkOut: "2027-08-21", status: "PENDING" as const, guests: [15, 16] },
    // Waitlisted
    { memberIdx: 17, checkIn: "2027-07-05", checkOut: "2027-07-10", status: "WAITLISTED" as const, guests: [17] },
    // Cancelled
    { memberIdx: 9, checkIn: "2027-08-09", checkOut: "2027-08-14", status: "CANCELLED" as const, guests: [9] },
    // More confirmed for later in season
    { memberIdx: 7, checkIn: "2027-08-23", checkOut: "2027-08-30", status: "CONFIRMED" as const, guests: [7, 8] },
    { memberIdx: 1, checkIn: "2027-09-06", checkOut: "2027-09-13", status: "CONFIRMED" as const, guests: [1, 2] },
    { memberIdx: 22, checkIn: "2027-09-13", checkOut: "2027-09-20", status: "CONFIRMED" as const, guests: [22] },
  ];

  let bookingSeq = 1;
  for (const bc of bookingConfigs) {
    const nights =
      (new Date(bc.checkOut).getTime() - new Date(bc.checkIn).getTime()) /
      (1000 * 60 * 60 * 24);

    // Use the membership class rate for the primary member
    const perNight = 7500; // Full member weekday rate as baseline
    const subtotal = perNight * nights * bc.guests.length;

    const ref = `PSC-2027-${String(bookingSeq++).padStart(4, "0")}`;

    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: org.id,
        lodgeId: lodge.id,
        bookingRoundId: generalRound.id,
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

    // Add guests
    for (const guestIdx of bc.guests) {
      await db.insert(bookingGuests).values({
        bookingId: booking.id,
        memberId: memberIds[guestIdx],
        pricePerNightCents: perNight,
        totalAmountCents: perNight * nights,
      });
    }
  }
  console.log(`Created ${bookingConfigs.length} bookings`);

  // Populate availability cache
  console.log("Building availability cache...");
  const seasonStart = new Date(season.startDate);
  const seasonEnd = new Date(season.endDate);
  const cacheRows = [];
  for (
    let d = new Date(seasonStart);
    d <= seasonEnd;
    d.setDate(d.getDate() + 1)
  ) {
    cacheRows.push({
      lodgeId: lodge.id,
      date: d.toISOString().split("T")[0],
      totalBeds: 30,
      bookedBeds: 0,
    });
  }
  await db.insert(availabilityCache).values(cacheRows);
  console.log(`Created ${cacheRows.length} availability cache rows`);

  // Create some subscriptions for the active season
  console.log("Creating subscriptions...");
  let subCount = 0;
  for (let i = 0; i < 23; i++) {
    // Skip juniors (indices 23-26) and social members
    const m = MEMBERS_DATA[i];
    if (m.class === "Junior" || m.class === "Social") continue;

    const mc = classes.find((c) => c.name === m.class);
    if (!mc?.annualFeeCents) continue;

    await db.insert(subscriptions).values({
      organisationId: org.id,
      memberId: memberIds[i],
      seasonId: season.id,
      amountCents: mc.annualFeeCents,
      dueDate: "2027-03-01",
      status: i < 15 ? "PAID" : "UNPAID",
      paidAt: i < 15 ? new Date() : undefined,
    });
    subCount++;
  }
  if (subCount > 0) {
    console.log(`Created ${subCount} subscriptions`);
  }

  console.log("\nSeed complete!");
  console.log(`\nTest login credentials (all passwords: testpass123):`);
  console.log(`  Admin:           marek.kowalski@example.com`);
  console.log(`  Booking Officer: anna.nowak@example.com`);
  console.log(`  Committee:       piotr.wisniewski@example.com`);
  console.log(`  Member:          katarzyna.wojcik@example.com`);
  console.log(`\nLogin at: https://snowgum.site/polski/login`);

  process.exit(0);
}

seedPolskiData().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
