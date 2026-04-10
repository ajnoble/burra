import { eq, sql } from "drizzle-orm";
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
  availabilityOverrides,
  cancellationPolicies,
  tariffs,
  profiles,
  subscriptions,
  transactions,
  waitlistEntries,
  documentCategories,
  documents,
  chargeCategories,
  oneOffCharges,
  communicationTemplates,
  communications,
  communicationRecipients,
  customFields,
  customFieldValues,
} from "./schema";
import { createClient } from "@supabase/supabase-js";

// ─── Members Data ─────────────────────────────────────────────────────────────

type MemberData = {
  first: string;
  last: string;
  class: string;
  role: "ADMIN" | "COMMITTEE" | "BOOKING_OFFICER" | "MEMBER";
  dob: string;
  isFinancial?: boolean;
  parentIdx?: number;
};

const MEMBERS_DATA: MemberData[] = [
  // 0: Admin
  { first: "Marek", last: "Kowalski", class: "Full Member", role: "ADMIN", dob: "1975-03-15" },
  // 1: Admin
  { first: "Anna", last: "Nowak", class: "Full Member", role: "ADMIN", dob: "1980-07-22" },
  // 2: Committee (Full)
  { first: "Piotr", last: "Wisniewski", class: "Full Member", role: "COMMITTEE", dob: "1968-11-30" },
  // 3: Committee (Full)
  { first: "Katarzyna", last: "Wojcik", class: "Full Member", role: "COMMITTEE", dob: "1982-05-10" },
  // 4: Committee (Life)
  { first: "Stanislaw", last: "Borkowski", class: "Life Member", role: "COMMITTEE", dob: "1950-06-10" },
  // 5: Booking Officer (Full)
  { first: "Tomasz", last: "Kaminski", class: "Full Member", role: "BOOKING_OFFICER", dob: "1977-09-18" },
  // 6: Booking Officer (Full)
  { first: "Magdalena", last: "Lewandowska", class: "Full Member", role: "BOOKING_OFFICER", dob: "1985-01-25" },
  // 7-16: Full Members (10)
  { first: "Jan", last: "Zielinski", class: "Full Member", role: "MEMBER", dob: "1990-04-12" },
  { first: "Agnieszka", last: "Szymanska", class: "Full Member", role: "MEMBER", dob: "1988-08-07" },
  { first: "Krzysztof", last: "Wozniak", class: "Full Member", role: "MEMBER", dob: "1972-12-03" },
  { first: "Monika", last: "Dabrowski", class: "Full Member", role: "MEMBER", dob: "1983-06-20" },
  { first: "Andrzej", last: "Kozlowski", class: "Full Member", role: "MEMBER", dob: "1976-02-14" },
  { first: "Ewa", last: "Jankowska", class: "Full Member", role: "MEMBER", dob: "1991-10-08" },
  { first: "Pawel", last: "Mazur", class: "Full Member", role: "MEMBER", dob: "1979-03-28" },
  { first: "Michal", last: "Piotrowski", class: "Full Member", role: "MEMBER", dob: "1981-11-22" },
  { first: "Zbigniew", last: "Czerwinski", class: "Full Member", role: "MEMBER", dob: "1970-07-04" },
  // 16: Non-financial Full Member
  { first: "Barbara", last: "Krawczyk", class: "Full Member", role: "MEMBER", dob: "1986-07-16", isFinancial: false },
  // 17-21: Associates (5)
  { first: "Stefan", last: "Grabowski", class: "Associate", role: "MEMBER", dob: "1974-05-30" },
  { first: "Joanna", last: "Pawlak", class: "Associate", role: "MEMBER", dob: "1987-09-14" },
  { first: "Dorota", last: "Adamczyk", class: "Associate", role: "MEMBER", dob: "1984-04-06" },
  { first: "Lukasz", last: "Dudek", class: "Associate", role: "MEMBER", dob: "1989-08-25" },
  // 20: Non-financial Associate
  { first: "Robert", last: "Michalski", class: "Associate", role: "MEMBER", dob: "1992-01-19", isFinancial: false },
  // 21-23: Life Members (3)
  { first: "Helena", last: "Sikora", class: "Life Member", role: "MEMBER", dob: "1952-02-28" },
  { first: "Kazimierz", last: "Walczak", class: "Life Member", role: "MEMBER", dob: "1948-09-15" },
  // 24: Non-financial Life Member
  { first: "Irena", last: "Nowicka", class: "Life Member", role: "MEMBER", dob: "1955-04-22", isFinancial: false },
  // 25-29: Juniors (linked to parents)
  { first: "Zofia", last: "Kowalski", class: "Junior", role: "MEMBER", dob: "2012-03-20", parentIdx: 0 },
  { first: "Jakub", last: "Kowalski", class: "Junior", role: "MEMBER", dob: "2014-07-11", parentIdx: 0 },
  { first: "Maja", last: "Kaminski", class: "Junior", role: "MEMBER", dob: "2013-05-08", parentIdx: 5 },
  { first: "Filip", last: "Zielinski", class: "Junior", role: "MEMBER", dob: "2015-11-30", parentIdx: 7 },
  { first: "Natalia", last: "Wisniewski", class: "Junior", role: "MEMBER", dob: "2016-02-14", parentIdx: 2 },
];

// ─── Helper: date range generator ────────────────────────────────────────────

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  const e = new Date(end);
  while (d <= e) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ─── Helper: nights between two date strings ─────────────────────────────────

function nightsBetween(checkIn: string, checkOut: string): number {
  return (
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

// ─── Main seed function ───────────────────────────────────────────────────────

async function seedDemoData() {
  console.log("🎿 Seeding Polski Ski Club demo data...\n");

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ─── 1. CLEANUP ─────────────────────────────────────────────────────────────

  console.log("Cleaning up existing 'polski' org data...");

  const [existingOrg] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, "polski"));

  if (existingOrg) {
    const orgId = existingOrg.id;

    // Get all member IDs and profile IDs before deletion
    const existingMembers = await db
      .select({ id: members.id, profileId: members.profileId })
      .from(members)
      .where(eq(members.organisationId, orgId));

    const profileIds = existingMembers
      .map((m) => m.profileId)
      .filter(Boolean) as string[];

    // Delete in reverse dependency order
    // Communications
    const existingComms = await db
      .select({ id: communications.id })
      .from(communications)
      .where(eq(communications.organisationId, orgId));
    for (const comm of existingComms) {
      await db
        .delete(communicationRecipients)
        .where(eq(communicationRecipients.communicationId, comm.id));
    }
    await db
      .delete(communications)
      .where(eq(communications.organisationId, orgId));
    await db
      .delete(communicationTemplates)
      .where(eq(communicationTemplates.organisationId, orgId));

    // Documents
    await db
      .delete(documents)
      .where(eq(documents.organisationId, orgId));
    await db
      .delete(documentCategories)
      .where(eq(documentCategories.organisationId, orgId));

    // Custom fields
    const existingFields = await db
      .select({ id: customFields.id })
      .from(customFields)
      .where(eq(customFields.organisationId, orgId));
    for (const field of existingFields) {
      await db
        .delete(customFieldValues)
        .where(eq(customFieldValues.customFieldId, field.id));
    }
    await db
      .delete(customFields)
      .where(eq(customFields.organisationId, orgId));

    // One-off charges
    await db
      .delete(oneOffCharges)
      .where(eq(oneOffCharges.organisationId, orgId));
    await db
      .delete(chargeCategories)
      .where(eq(chargeCategories.organisationId, orgId));

    // Subscriptions
    await db
      .delete(subscriptions)
      .where(eq(subscriptions.organisationId, orgId));

    // Transactions
    await db
      .delete(transactions)
      .where(eq(transactions.organisationId, orgId));

    // Bookings: guests + holds first
    const existingBookings = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.organisationId, orgId));
    for (const b of existingBookings) {
      await db
        .delete(bookingGuests)
        .where(eq(bookingGuests.bookingId, b.id));
    }
    await db
      .delete(bookings)
      .where(eq(bookings.organisationId, orgId));

    // Waitlist
    // Get all booking round IDs for this org
    const existingSeasons = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.organisationId, orgId));
    for (const s of existingSeasons) {
      const rounds = await db
        .select({ id: bookingRounds.id })
        .from(bookingRounds)
        .where(eq(bookingRounds.seasonId, s.id));
      for (const r of rounds) {
        await db
          .delete(waitlistEntries)
          .where(eq(waitlistEntries.bookingRoundId, r.id));
      }
      await db
        .delete(bookingRounds)
        .where(eq(bookingRounds.seasonId, s.id));
    }

    // Availability
    const existingLodges = await db
      .select({ id: lodges.id })
      .from(lodges)
      .where(eq(lodges.organisationId, orgId));
    for (const l of existingLodges) {
      await db
        .delete(availabilityCache)
        .where(eq(availabilityCache.lodgeId, l.id));
      await db
        .delete(availabilityOverrides)
        .where(eq(availabilityOverrides.lodgeId, l.id));
      // Get all rooms -> beds
      const existingRooms = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.lodgeId, l.id));
      for (const r of existingRooms) {
        await db.delete(beds).where(eq(beds.roomId, r.id));
      }
      await db.delete(rooms).where(eq(rooms.lodgeId, l.id));
    }
    await db.delete(lodges).where(eq(lodges.organisationId, orgId));

    // Tariffs
    await db.delete(tariffs).where(
      sql`${tariffs.seasonId} IN (SELECT id FROM seasons WHERE organisation_id = ${orgId})`
    );
    await db.delete(seasons).where(eq(seasons.organisationId, orgId));

    // Organisation members
    await db
      .delete(organisationMembers)
      .where(eq(organisationMembers.organisationId, orgId));

    // Cancellation policies
    await db
      .delete(cancellationPolicies)
      .where(eq(cancellationPolicies.organisationId, orgId));

    // Membership classes
    await db
      .delete(membershipClasses)
      .where(eq(membershipClasses.organisationId, orgId));

    // Members
    await db.delete(members).where(eq(members.organisationId, orgId));

    // Organisation
    await db.delete(organisations).where(eq(organisations.id, orgId));

    // Delete Supabase auth users
    for (const profileId of profileIds) {
      await adminClient.auth.admin.deleteUser(profileId);
    }
    // Delete profiles
    for (const profileId of profileIds) {
      await db.delete(profiles).where(eq(profiles.id, profileId));
    }

    console.log("✓ Cleaned up existing org data");
  } else {
    console.log("✓ No existing 'polski' org found, starting fresh");
  }

  // ─── 2. ORGANISATION ────────────────────────────────────────────────────────

  const [org] = await db
    .insert(organisations)
    .values({
      name: "Polski Ski Club",
      slug: "polski",
      timezone: "Australia/Melbourne",
      gstEnabled: true,
      gstRateBps: 1000,
      memberBookingEditWindowDays: 7,
      memberEditRequiresApproval: true,
      accentColor: "2563eb",
      contactEmail: "secretary@polskiskiclub.org.au",
      contactPhone: "+61 3 9876 5432",
      address: "PO Box 42, Melbourne VIC 3000",
      platformFeeBps: 100,
    })
    .returning();

  console.log(`✓ Created organisation: ${org.name}`);

  // ─── 3. LODGE ───────────────────────────────────────────────────────────────

  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Kosciuszko Lodge",
      address: "Perisher Valley NSW 2624",
      totalBeds: 24,
    })
    .returning();

  const roomConfigs = [
    // Ground floor
    { name: "Common Room", floor: "Ground", capacity: 2 },
    { name: "Family Room 1", floor: "Ground", capacity: 4 },
    { name: "Family Room 2", floor: "Ground", capacity: 4 },
    { name: "Accessible Room", floor: "Ground", capacity: 2 },
    // Upper floor
    { name: "Bunk Room A", floor: "Upper", capacity: 4 },
    { name: "Bunk Room B", floor: "Upper", capacity: 4 },
    { name: "Double Room", floor: "Upper", capacity: 2 },
    { name: "Single Room", floor: "Upper", capacity: 2 },
  ];

  const allBedIds: string[] = [];
  const bedsByRoom: Record<string, string[]> = {};

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

    bedsByRoom[room.id] = [];
    for (let b = 0; b < config.capacity; b++) {
      const [bed] = await db
        .insert(beds)
        .values({
          roomId: room.id,
          label: `Bed ${b + 1}`,
          sortOrder: b,
        })
        .returning();
      allBedIds.push(bed.id);
      bedsByRoom[room.id].push(bed.id);
    }
  }

  console.log(`✓ Created lodge with 8 rooms and ${allBedIds.length} beds`);

  // ─── 4. MEMBERSHIP CLASSES ──────────────────────────────────────────────────

  const classConfigs = [
    { name: "Life Member", sortOrder: 0, annualFeeCents: null as number | null },
    { name: "Full Member", sortOrder: 1, annualFeeCents: 75000 },
    { name: "Associate", sortOrder: 2, annualFeeCents: 40000 },
    { name: "Junior", sortOrder: 3, annualFeeCents: null as number | null },
  ];

  const classMap: Record<string, string> = {};
  for (const cc of classConfigs) {
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

  console.log("✓ Created 4 membership classes");

  // ─── 5. MEMBERS ─────────────────────────────────────────────────────────────

  console.log("Creating 30 members with auth accounts...");
  const memberIds: string[] = [];
  const memberProfileIds: (string | null)[] = [];

  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    const m = MEMBERS_DATA[i];
    const emailFirst = m.first.toLowerCase().replace(/\s/g, "");
    const emailLast = m.last.toLowerCase().replace(/\s/g, "");
    const email = `${emailFirst}.${emailLast}@example.com`;
    const memberNum = `PSC-${String(i + 1).padStart(4, "0")}`;
    const isFinancial = m.isFinancial !== undefined ? m.isFinancial : true;

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
        isFinancial,
      })
      .returning();

    memberIds.push(member.id);
    memberProfileIds.push(authUserId);

    await db.insert(organisationMembers).values({
      organisationId: org.id,
      memberId: member.id,
      role: m.role,
    });
  }

  // Link juniors to parents
  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    const m = MEMBERS_DATA[i];
    if (m.parentIdx !== undefined) {
      await db
        .update(members)
        .set({ primaryMemberId: memberIds[m.parentIdx] })
        .where(eq(members.id, memberIds[i]));
    }
  }

  console.log(`✓ Created ${MEMBERS_DATA.length} members (25 with auth accounts)`);

  // ─── 6. TWO SEASONS ─────────────────────────────────────────────────────────

  const [season2025] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Winter 2025",
      startDate: "2025-06-01",
      endDate: "2025-09-30",
      isActive: false,
    })
    .returning();

  const [season2026] = await db
    .insert(seasons)
    .values({
      organisationId: org.id,
      name: "Winter 2026",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      isActive: true,
    })
    .returning();

  console.log("✓ Created 2 seasons (Winter 2025 + Winter 2026)");

  // ─── 7. BOOKING ROUNDS ──────────────────────────────────────────────────────

  // 2025 rounds
  const [priority2025] = await db
    .insert(bookingRounds)
    .values({
      seasonId: season2025.id,
      name: "Priority Round",
      opensAt: new Date("2025-04-01T08:00:00+10:00"),
      closesAt: new Date("2025-04-30T23:59:59+10:00"),
      allowedMembershipClassIds: [classMap["Life Member"], classMap["Full Member"]],
      maxNightsPerBooking: 14,
      requiresApproval: false,
      sortOrder: 0,
    })
    .returning();

  const [general2025] = await db
    .insert(bookingRounds)
    .values({
      seasonId: season2025.id,
      name: "General Round",
      opensAt: new Date("2025-05-01T08:00:00+10:00"),
      closesAt: new Date("2025-05-25T23:59:59+10:00"),
      allowedMembershipClassIds: [
        classMap["Life Member"],
        classMap["Full Member"],
        classMap["Associate"],
      ],
      maxNightsPerBooking: 7,
      requiresApproval: true,
      sortOrder: 1,
    })
    .returning();

  // 2026 rounds
  const [priority2026] = await db
    .insert(bookingRounds)
    .values({
      seasonId: season2026.id,
      name: "Priority Round",
      opensAt: new Date("2026-04-01T08:00:00+10:00"),
      closesAt: new Date("2026-04-30T23:59:59+10:00"),
      allowedMembershipClassIds: [classMap["Life Member"], classMap["Full Member"]],
      maxNightsPerBooking: 14,
      requiresApproval: false,
      sortOrder: 0,
    })
    .returning();

  const [general2026] = await db
    .insert(bookingRounds)
    .values({
      seasonId: season2026.id,
      name: "General Round",
      opensAt: new Date("2026-05-01T08:00:00+10:00"),
      closesAt: new Date("2026-05-25T23:59:59+10:00"),
      allowedMembershipClassIds: [
        classMap["Life Member"],
        classMap["Full Member"],
        classMap["Associate"],
      ],
      maxNightsPerBooking: 7,
      requiresApproval: true,
      sortOrder: 1,
    })
    .returning();

  console.log("✓ Created 4 booking rounds (2 per season)");

  // ─── 8. TARIFFS ─────────────────────────────────────────────────────────────

  const tariffConfigs = [
    {
      membershipClassId: classMap["Life Member"],
      weekday: 0,
      weekend: 0,
      disc5: 0,
      disc7: 0,
    },
    {
      membershipClassId: classMap["Full Member"],
      weekday: 8500,
      weekend: 11000,
      disc5: 500,
      disc7: 1000,
    },
    {
      membershipClassId: classMap["Associate"],
      weekday: 11000,
      weekend: 14000,
      disc5: 500,
      disc7: 1000,
    },
    {
      membershipClassId: classMap["Junior"],
      weekday: 4500,
      weekend: 5500,
      disc5: 500,
      disc7: 1000,
    },
  ];

  for (const tc of tariffConfigs) {
    await db.insert(tariffs).values({
      lodgeId: lodge.id,
      seasonId: season2025.id,
      membershipClassId: tc.membershipClassId,
      pricePerNightWeekdayCents: tc.weekday,
      pricePerNightWeekendCents: tc.weekend,
      discountFiveNightsBps: tc.disc5,
      discountSevenNightsBps: tc.disc7,
    });
    await db.insert(tariffs).values({
      lodgeId: lodge.id,
      seasonId: season2026.id,
      membershipClassId: tc.membershipClassId,
      pricePerNightWeekdayCents: tc.weekday,
      pricePerNightWeekendCents: tc.weekend,
      discountFiveNightsBps: tc.disc5,
      discountSevenNightsBps: tc.disc7,
    });
  }

  console.log("✓ Created 8 tariffs (4 per season)");

  // ─── 9. CANCELLATION POLICY ─────────────────────────────────────────────────

  const [policy] = await db
    .insert(cancellationPolicies)
    .values({
      organisationId: org.id,
      name: "Standard Cancellation Policy",
      rules: [
        { daysBeforeCheckin: 14, forfeitPercentage: 0 },
        { daysBeforeCheckin: 7, forfeitPercentage: 50 },
        { daysBeforeCheckin: 0, forfeitPercentage: 100 },
      ],
      isDefault: true,
    })
    .returning();

  console.log("✓ Created cancellation policy");

  // ─── 10. WINTER 2025 BOOKINGS (12) ──────────────────────────────────────────

  console.log("Creating Winter 2025 bookings (historical)...");

  type BookingConfig2025 = {
    memberIdx: number;
    checkIn: string;
    checkOut: string;
    status: "COMPLETED" | "CANCELLED";
    guestIdxs: number[];
    refund?: boolean;
  };

  const bookings2025Configs: BookingConfig2025[] = [
    // 10 COMPLETED
    { memberIdx: 0, checkIn: "2025-06-07", checkOut: "2025-06-14", status: "COMPLETED", guestIdxs: [0, 25, 26] },
    { memberIdx: 2, checkIn: "2025-06-14", checkOut: "2025-06-21", status: "COMPLETED", guestIdxs: [2, 3] },
    { memberIdx: 5, checkIn: "2025-06-21", checkOut: "2025-06-28", status: "COMPLETED", guestIdxs: [5, 27] },
    { memberIdx: 7, checkIn: "2025-07-05", checkOut: "2025-07-12", status: "COMPLETED", guestIdxs: [7, 8] },
    { memberIdx: 9, checkIn: "2025-07-12", checkOut: "2025-07-19", status: "COMPLETED", guestIdxs: [9, 10] },
    { memberIdx: 4, checkIn: "2025-07-19", checkOut: "2025-07-26", status: "COMPLETED", guestIdxs: [4, 21, 22] },
    { memberIdx: 11, checkIn: "2025-08-02", checkOut: "2025-08-09", status: "COMPLETED", guestIdxs: [11, 12] },
    { memberIdx: 13, checkIn: "2025-08-09", checkOut: "2025-08-16", status: "COMPLETED", guestIdxs: [13, 14] },
    { memberIdx: 1, checkIn: "2025-08-23", checkOut: "2025-08-30", status: "COMPLETED", guestIdxs: [1, 2] },
    // 7-night booking
    { memberIdx: 15, checkIn: "2025-09-06", checkOut: "2025-09-13", status: "COMPLETED", guestIdxs: [15, 17, 18] },
    // 1 CANCELLED with refund
    { memberIdx: 8, checkIn: "2025-07-26", checkOut: "2025-08-02", status: "CANCELLED", guestIdxs: [8], refund: true },
    // 1 COMPLETED (standalone)
    { memberIdx: 6, checkIn: "2025-09-13", checkOut: "2025-09-20", status: "COMPLETED", guestIdxs: [6, 28] },
  ];

  // Rate lookup: Full Member weekday = $85/night, Life = $0, Junior = $45, Associate = $110
  const rateForClass: Record<string, number> = {
    "Full Member": 8500,
    "Life Member": 0,
    "Associate": 11000,
    "Junior": 4500,
  };

  let bookingSeq = 1;
  const bookingIds2025: string[] = [];

  for (const bc of bookings2025Configs) {
    const nights = nightsBetween(bc.checkIn, bc.checkOut);
    const memberClass = MEMBERS_DATA[bc.memberIdx].class;
    const perNight = rateForClass[memberClass] ?? 8500;
    const guestTotal = perNight * nights * bc.guestIdxs.length;
    const gstAmount = Math.round(guestTotal / 11);
    const ref = `PSC-2025-${String(bookingSeq++).padStart(4, "0")}`;

    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: org.id,
        lodgeId: lodge.id,
        bookingRoundId: priority2025.id,
        cancellationPolicyId: policy.id,
        primaryMemberId: memberIds[bc.memberIdx],
        status: bc.status,
        checkInDate: bc.checkIn,
        checkOutDate: bc.checkOut,
        totalNights: nights,
        subtotalCents: guestTotal,
        totalAmountCents: guestTotal,
        gstAmountCents: gstAmount,
        bookingReference: ref,
        balancePaidAt: bc.status === "COMPLETED" ? new Date("2025-05-15") : undefined,
        cancelledAt: bc.status === "CANCELLED" ? new Date("2025-07-10") : undefined,
        cancellationReason: bc.status === "CANCELLED" ? "Change of plans" : undefined,
        refundAmountCents: bc.refund ? guestTotal : undefined,
      })
      .returning();

    bookingIds2025.push(booking.id);

    // Add guests
    for (const guestIdx of bc.guestIdxs) {
      const guestClass = MEMBERS_DATA[guestIdx].class;
      const guestRate = rateForClass[guestClass] ?? 8500;
      await db.insert(bookingGuests).values({
        bookingId: booking.id,
        memberId: memberIds[guestIdx],
        pricePerNightCents: guestRate,
        totalAmountCents: guestRate * nights,
      });
    }

    // Create transactions
    if (bc.status === "COMPLETED") {
      // INVOICE
      await db.insert(transactions).values({
        organisationId: org.id,
        memberId: memberIds[bc.memberIdx],
        bookingId: booking.id,
        type: "INVOICE",
        amountCents: guestTotal,
        gstAmountCents: gstAmount,
        description: `Booking ${ref} — ${nights} nights`,
      });
      // PAYMENT
      await db.insert(transactions).values({
        organisationId: org.id,
        memberId: memberIds[bc.memberIdx],
        bookingId: booking.id,
        type: "PAYMENT",
        amountCents: -guestTotal,
        gstAmountCents: 0,
        platformFeeCents: Math.round(guestTotal * 0.01),
        description: `Payment for booking ${ref}`,
      });
    } else if (bc.status === "CANCELLED") {
      // INVOICE
      await db.insert(transactions).values({
        organisationId: org.id,
        memberId: memberIds[bc.memberIdx],
        bookingId: booking.id,
        type: "INVOICE",
        amountCents: guestTotal,
        gstAmountCents: gstAmount,
        description: `Booking ${ref} — ${nights} nights`,
      });
      // PAYMENT
      await db.insert(transactions).values({
        organisationId: org.id,
        memberId: memberIds[bc.memberIdx],
        bookingId: booking.id,
        type: "PAYMENT",
        amountCents: -guestTotal,
        gstAmountCents: 0,
        platformFeeCents: Math.round(guestTotal * 0.01),
        description: `Payment for booking ${ref}`,
      });
      // REFUND
      await db.insert(transactions).values({
        organisationId: org.id,
        memberId: memberIds[bc.memberIdx],
        bookingId: booking.id,
        type: "REFUND",
        amountCents: guestTotal,
        gstAmountCents: gstAmount,
        description: `Refund for cancelled booking ${ref}`,
      });
    }
  }

  console.log(`✓ Created ${bookings2025Configs.length} Winter 2025 bookings with transactions`);

  // ─── 11. WINTER 2026 BOOKINGS (10) ──────────────────────────────────────────

  console.log("Creating Winter 2026 bookings (upcoming)...");

  type BookingStatus2026 = "CONFIRMED" | "PENDING" | "WAITLISTED" | "CANCELLED";

  type BookingConfig2026 = {
    memberIdx: number;
    checkIn: string;
    checkOut: string;
    status: BookingStatus2026;
    guestIdxs: number[];
    paid: boolean;
    roundId?: string;
  };

  const bookings2026Configs: BookingConfig2026[] = [
    // 4 CONFIRMED (paid)
    { memberIdx: 0, checkIn: "2026-06-13", checkOut: "2026-06-20", status: "CONFIRMED", guestIdxs: [0, 25, 26], paid: true },
    { memberIdx: 2, checkIn: "2026-06-20", checkOut: "2026-06-27", status: "CONFIRMED", guestIdxs: [2, 3], paid: true },
    { memberIdx: 5, checkIn: "2026-07-04", checkOut: "2026-07-11", status: "CONFIRMED", guestIdxs: [5, 27], paid: true },
    { memberIdx: 4, checkIn: "2026-07-18", checkOut: "2026-07-25", status: "CONFIRMED", guestIdxs: [4, 21, 22], paid: true },
    // 3 PENDING (general round, requiresApproval)
    { memberIdx: 17, checkIn: "2026-08-01", checkOut: "2026-08-08", status: "PENDING", guestIdxs: [17, 18], paid: false },
    { memberIdx: 19, checkIn: "2026-08-08", checkOut: "2026-08-15", status: "PENDING", guestIdxs: [19], paid: false },
    { memberIdx: 7, checkIn: "2026-08-15", checkOut: "2026-08-22", status: "PENDING", guestIdxs: [7, 8], paid: false },
    // 1 WAITLISTED
    { memberIdx: 9, checkIn: "2026-06-13", checkOut: "2026-06-20", status: "WAITLISTED", guestIdxs: [9], paid: false },
    // 1 CANCELLED
    { memberIdx: 10, checkIn: "2026-07-04", checkOut: "2026-07-11", status: "CANCELLED", guestIdxs: [10], paid: false },
    // 1 CONFIRMED unpaid
    { memberIdx: 11, checkIn: "2026-09-05", checkOut: "2026-09-12", status: "CONFIRMED", guestIdxs: [11, 12], paid: false },
  ];

  const bookingIds2026: string[] = [];
  const confirmedPaidBookingBedAssignments: Array<{ bookingId: string; guestIdxs: number[] }> = [];
  let bedIdx = 0;

  for (const bc of bookings2026Configs) {
    const nights = nightsBetween(bc.checkIn, bc.checkOut);
    const memberClass = MEMBERS_DATA[bc.memberIdx].class;
    const perNight = rateForClass[memberClass] ?? 8500;
    const guestTotal = perNight * nights * bc.guestIdxs.length;
    const gstAmount = Math.round(guestTotal / 11);
    const ref = `PSC-2026-${String(bookingSeq++).padStart(4, "0")}`;
    const isGeneral = bc.status === "PENDING";
    const roundId = isGeneral ? general2026.id : priority2026.id;

    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: org.id,
        lodgeId: lodge.id,
        bookingRoundId: roundId,
        cancellationPolicyId: policy.id,
        primaryMemberId: memberIds[bc.memberIdx],
        status: bc.status,
        checkInDate: bc.checkIn,
        checkOutDate: bc.checkOut,
        totalNights: nights,
        subtotalCents: guestTotal,
        totalAmountCents: guestTotal,
        gstAmountCents: gstAmount,
        bookingReference: ref,
        requiresApproval: isGeneral,
        balancePaidAt: bc.paid ? new Date("2026-05-15") : undefined,
        cancelledAt: bc.status === "CANCELLED" ? new Date("2026-06-20") : undefined,
        cancellationReason: bc.status === "CANCELLED" ? "Unable to attend" : undefined,
      })
      .returning();

    bookingIds2026.push(booking.id);

    // Add guests (with bed assignment for confirmed paid bookings)
    const assignBeds = bc.status === "CONFIRMED" && bc.paid;
    if (assignBeds) {
      confirmedPaidBookingBedAssignments.push({ bookingId: booking.id, guestIdxs: bc.guestIdxs });
    }

    for (const guestIdx of bc.guestIdxs) {
      const guestClass = MEMBERS_DATA[guestIdx].class;
      const guestRate = rateForClass[guestClass] ?? 8500;

      let bedId: string | undefined;
      if (assignBeds && bedIdx < allBedIds.length) {
        bedId = allBedIds[bedIdx++];
      }

      await db.insert(bookingGuests).values({
        bookingId: booking.id,
        memberId: memberIds[guestIdx],
        pricePerNightCents: guestRate,
        totalAmountCents: guestRate * nights,
        bedId: bedId,
      });
    }

    // Create transactions
    if (bc.status !== "WAITLISTED") {
      // Always create INVOICE for non-waitlisted
      if (guestTotal > 0) {
        await db.insert(transactions).values({
          organisationId: org.id,
          memberId: memberIds[bc.memberIdx],
          bookingId: booking.id,
          type: "INVOICE",
          amountCents: guestTotal,
          gstAmountCents: gstAmount,
          description: `Booking ${ref} — ${nights} nights`,
        });
      }

      if (bc.paid) {
        await db.insert(transactions).values({
          organisationId: org.id,
          memberId: memberIds[bc.memberIdx],
          bookingId: booking.id,
          type: "PAYMENT",
          amountCents: -guestTotal,
          gstAmountCents: 0,
          platformFeeCents: Math.round(guestTotal * 0.01),
          description: `Payment for booking ${ref}`,
        });
      }
    }
  }

  console.log(`✓ Created ${bookings2026Configs.length} Winter 2026 bookings with transactions`);

  // ─── 12. AVAILABILITY CACHE ─────────────────────────────────────────────────

  console.log("Building availability cache...");

  // Compute bookings per date (exclude CANCELLED and WAITLISTED)
  const allBookingsForCache = [
    ...bookings2025Configs.map((bc, i) => ({
      checkIn: bc.checkIn,
      checkOut: bc.checkOut,
      guestCount: bc.guestIdxs.length,
      status: bc.status,
    })),
    ...bookings2026Configs.map((bc, i) => ({
      checkIn: bc.checkIn,
      checkOut: bc.checkOut,
      guestCount: bc.guestIdxs.length,
      status: bc.status,
    })),
  ];

  const bookedBedsMap: Record<string, number> = {};
  for (const b of allBookingsForCache) {
    if (b.status === "CANCELLED" || b.status === "WAITLISTED") continue;
    const dates = dateRange(b.checkIn, b.checkOut);
    // Don't count checkout date
    for (let di = 0; di < dates.length - 1; di++) {
      bookedBedsMap[dates[di]] = (bookedBedsMap[dates[di]] ?? 0) + b.guestCount;
    }
  }

  // 2025 cache
  const dates2025 = dateRange("2025-06-01", "2025-09-30");
  const cache2025Rows = dates2025.map((date) => ({
    lodgeId: lodge.id,
    date,
    totalBeds: 24,
    bookedBeds: bookedBedsMap[date] ?? 0,
  }));
  await db.insert(availabilityCache).values(cache2025Rows);

  // 2026 cache
  const dates2026 = dateRange("2026-06-01", "2026-09-30");
  const cache2026Rows = dates2026.map((date) => ({
    lodgeId: lodge.id,
    date,
    totalBeds: 24,
    bookedBeds: bookedBedsMap[date] ?? 0,
  }));
  await db.insert(availabilityCache).values(cache2026Rows);

  console.log(`✓ Created ${cache2025Rows.length + cache2026Rows.length} availability cache rows`);

  // ─── 13. AVAILABILITY OVERRIDES ─────────────────────────────────────────────

  const adminMemberId = memberIds[0]; // Marek Kowalski

  await db.insert(availabilityOverrides).values([
    {
      lodgeId: lodge.id,
      startDate: "2026-06-03",
      endDate: "2026-06-05",
      type: "CLOSURE",
      reason: "Plumbing maintenance",
      createdByMemberId: adminMemberId,
    },
    {
      lodgeId: lodge.id,
      startDate: "2026-06-20",
      endDate: "2026-06-26",
      type: "REDUCTION",
      bedReduction: 6,
      reason: "Upper floor renovation",
      createdByMemberId: adminMemberId,
    },
    {
      lodgeId: lodge.id,
      startDate: "2026-05-17",
      endDate: "2026-05-18",
      type: "EVENT",
      bedReduction: 2,
      reason: "Club working bee",
      createdByMemberId: adminMemberId,
    },
  ]);

  console.log("✓ Created 3 availability overrides");

  // ─── 14. SUBSCRIPTIONS (Winter 2026) ────────────────────────────────────────

  console.log("Creating Winter 2026 subscriptions...");

  let subCount = 0;
  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    const m = MEMBERS_DATA[i];
    if (m.class === "Junior") continue;

    const mc = classConfigs.find((c) => c.name === m.class);
    if (!mc) continue;

    if (m.class === "Life Member") {
      // Life Members: WAIVED
      await db.insert(subscriptions).values({
        organisationId: org.id,
        memberId: memberIds[i],
        seasonId: season2026.id,
        amountCents: 0,
        dueDate: "2026-03-01",
        status: "WAIVED",
        waivedReason: "Life Member — fees waived",
        gstAmountCents: 0,
      });
      subCount++;
    } else if (mc.annualFeeCents) {
      const feeCents = mc.annualFeeCents;
      const gstCents = Math.round(feeCents / 11);
      // Indices 0-19 get PAID (first ~20 non-Life non-Junior), rest UNPAID
      // Count non-Life non-Junior members up to index i
      let nonLifeJuniorBefore = 0;
      for (let j = 0; j < i; j++) {
        if (MEMBERS_DATA[j].class !== "Life Member" && MEMBERS_DATA[j].class !== "Junior") {
          nonLifeJuniorBefore++;
        }
      }
      const isPaid = nonLifeJuniorBefore < 15;
      await db.insert(subscriptions).values({
        organisationId: org.id,
        memberId: memberIds[i],
        seasonId: season2026.id,
        amountCents: feeCents,
        dueDate: "2026-03-01",
        status: isPaid ? "PAID" : "UNPAID",
        paidAt: isPaid ? new Date("2026-02-15") : undefined,
        gstAmountCents: gstCents,
      });

      if (isPaid) {
        await db.insert(transactions).values({
          organisationId: org.id,
          memberId: memberIds[i],
          type: "SUBSCRIPTION",
          amountCents: -feeCents,
          gstAmountCents: gstCents,
          platformFeeCents: Math.round(feeCents * 0.01),
          description: `Annual subscription payment — Winter 2026`,
        });
      }

      subCount++;
    }
  }

  console.log(`✓ Created ${subCount} subscriptions`);

  // ─── 15. ONE-OFF CHARGES ────────────────────────────────────────────────────

  const chargeCategs = await db
    .insert(chargeCategories)
    .values([
      { organisationId: org.id, name: "Locker Hire", sortOrder: 0 },
      { organisationId: org.id, name: "Key Deposit", sortOrder: 1 },
      { organisationId: org.id, name: "Cleaning Fee", sortOrder: 2 },
      { organisationId: org.id, name: "Social Event", sortOrder: 3 },
    ])
    .returning();

  const catMap: Record<string, string> = {};
  for (const c of chargeCategs) {
    catMap[c.name] = c.id;
  }

  const chargeConfigs = [
    { memberIdx: 0, category: "Locker Hire", amount: 5000, status: "PAID" as const, due: "2026-06-01" },
    { memberIdx: 2, category: "Key Deposit", amount: 10000, status: "PAID" as const, due: "2026-06-01" },
    { memberIdx: 5, category: "Cleaning Fee", amount: 15000, status: "PAID" as const, due: "2026-07-01" },
    { memberIdx: 7, category: "Social Event", amount: 8000, status: "PAID" as const, due: "2026-07-15" },
    { memberIdx: 9, category: "Locker Hire", amount: 5000, status: "UNPAID" as const, due: "2026-06-01" },
    { memberIdx: 11, category: "Key Deposit", amount: 10000, status: "UNPAID" as const, due: "2026-06-01" },
    { memberIdx: 13, category: "Cleaning Fee", amount: 15000, status: "WAIVED" as const, due: "2026-07-01", waivedReason: "Committee discretion" },
    { memberIdx: 15, category: "Social Event", amount: 8000, status: "UNPAID" as const, due: "2025-11-01" }, // overdue
  ];

  for (const cc of chargeConfigs) {
    const gst = Math.round(cc.amount / 11);
    const [charge] = await db
      .insert(oneOffCharges)
      .values({
        organisationId: org.id,
        memberId: memberIds[cc.memberIdx],
        categoryId: catMap[cc.category],
        amountCents: cc.amount,
        dueDate: cc.due,
        status: cc.status,
        waivedReason: cc.waivedReason,
        paidAt: cc.status === "PAID" ? new Date("2026-05-20") : undefined,
        gstAmountCents: gst,
        createdByMemberId: adminMemberId,
      })
      .returning();

    if (cc.status === "PAID") {
      const [txn] = await db
        .insert(transactions)
        .values({
          organisationId: org.id,
          memberId: memberIds[cc.memberIdx],
          type: "PAYMENT",
          amountCents: -cc.amount,
          gstAmountCents: gst,
          platformFeeCents: Math.round(cc.amount * 0.01),
          description: `${cc.category} payment`,
        })
        .returning();
      await db
        .update(oneOffCharges)
        .set({ transactionId: txn.id })
        .where(eq(oneOffCharges.id, charge.id));
    }
  }

  console.log("✓ Created 4 charge categories and 8 one-off charges");

  // ─── 16. COMMUNICATION TEMPLATES ────────────────────────────────────────────

  const [tmpl1] = await db
    .insert(communicationTemplates)
    .values({
      organisationId: org.id,
      name: "Season Opening Announcement",
      subject: "Winter 2026 Season Opening — Polski Ski Club",
      bodyMarkdown: `# Winter 2026 Season Opening\n\nDear Member,\n\nWe are delighted to announce the opening of Kosciuszko Lodge for the **Winter 2026** season.\n\nThe lodge will be open from **1 June to 30 September 2026**.\n\nPlease log in to make your bookings.\n\nKind regards,\nThe Polski Ski Club Committee`,
      channel: "EMAIL",
      createdByMemberId: adminMemberId,
    })
    .returning();

  const [tmpl2] = await db
    .insert(communicationTemplates)
    .values({
      organisationId: org.id,
      name: "Payment Reminder",
      subject: "Action Required: Outstanding Payment — Polski Ski Club",
      bodyMarkdown: `# Payment Reminder\n\nDear Member,\n\nThis is a reminder that your annual subscription payment is outstanding.\n\nPlease log in and complete your payment to maintain financial membership status.\n\nThank you,\nThe Polski Ski Club Committee`,
      smsBody: "Polski Ski Club: Your annual subscription is outstanding. Please pay at polskiskiclub.org.au/polski/login. Reply STOP to opt out.",
      channel: "BOTH",
      createdByMemberId: adminMemberId,
    })
    .returning();

  const [tmpl3] = await db
    .insert(communicationTemplates)
    .values({
      organisationId: org.id,
      name: "Pre-Arrival Info",
      subject: "Pre-Arrival Information — Polski Ski Club",
      bodyMarkdown: `# Pre-Arrival Information\n\nDear Member,\n\nYour booking is coming up soon! Here are a few reminders:\n\n- **Check-in** is from 4pm\n- **Check-out** is by 10am\n- Please bring your own linen\n- Ski hire is available at the village\n\nWe look forward to seeing you!\n\nThe Polski Ski Club Committee`,
      channel: "EMAIL",
      createdByMemberId: adminMemberId,
    })
    .returning();

  console.log("✓ Created 3 communication templates");

  // ─── 17. COMMUNICATIONS ─────────────────────────────────────────────────────

  // 1 SENT email to all members
  const [comm1] = await db
    .insert(communications)
    .values({
      organisationId: org.id,
      templateId: tmpl1.id,
      subject: tmpl1.subject,
      bodyMarkdown: tmpl1.bodyMarkdown,
      channel: "EMAIL",
      status: "SENT",
      filters: {},
      recipientCount: 25,
      createdByMemberId: adminMemberId,
      sentAt: new Date("2026-04-01T09:00:00+10:00"),
    })
    .returning();

  // Add recipients for all non-junior members (25 members)
  const recipientStatuses = ["DELIVERED", "DELIVERED", "DELIVERED", "OPENED", "OPENED", "DELIVERED", "BOUNCED", "OPENED", "DELIVERED", "DELIVERED"];
  let recipientStatusIdx = 0;
  for (let i = 0; i < MEMBERS_DATA.length; i++) {
    if (MEMBERS_DATA[i].class === "Junior") continue;
    const status = recipientStatuses[recipientStatusIdx % recipientStatuses.length];
    recipientStatusIdx++;
    await db.insert(communicationRecipients).values({
      communicationId: comm1.id,
      memberId: memberIds[i],
      channel: "EMAIL",
      status: status as "DELIVERED" | "OPENED" | "BOUNCED",
      sentAt: new Date("2026-04-01T09:00:00+10:00"),
      deliveredAt: status !== "BOUNCED" ? new Date("2026-04-01T09:01:00+10:00") : undefined,
      openedAt: status === "OPENED" ? new Date("2026-04-01T10:00:00+10:00") : undefined,
    });
  }

  // 1 SENT SMS to 4 upcoming arrivals
  const [comm2] = await db
    .insert(communications)
    .values({
      organisationId: org.id,
      templateId: tmpl2.id,
      subject: undefined,
      bodyMarkdown: tmpl2.bodyMarkdown,
      smsBody: tmpl2.smsBody,
      channel: "SMS",
      status: "SENT",
      filters: {},
      recipientCount: 4,
      createdByMemberId: adminMemberId,
      sentAt: new Date("2026-06-10T08:00:00+10:00"),
    })
    .returning();

  const smsRecipients = [0, 2, 5, 4];
  for (const idx of smsRecipients) {
    await db.insert(communicationRecipients).values({
      communicationId: comm2.id,
      memberId: memberIds[idx],
      channel: "SMS",
      status: "DELIVERED",
      sentAt: new Date("2026-06-10T08:00:00+10:00"),
      deliveredAt: new Date("2026-06-10T08:00:05+10:00"),
    });
  }

  // 1 DRAFT
  await db.insert(communications).values({
    organisationId: org.id,
    templateId: tmpl3.id,
    subject: tmpl3.subject,
    bodyMarkdown: tmpl3.bodyMarkdown,
    channel: "EMAIL",
    status: "DRAFT",
    filters: {},
    recipientCount: null,
    createdByMemberId: adminMemberId,
    sentAt: null,
  });

  console.log("✓ Created 3 communications (1 sent email, 1 sent SMS, 1 draft)");

  // ─── 18. WAITLIST ENTRIES ────────────────────────────────────────────────────

  await db.insert(waitlistEntries).values([
    {
      bookingRoundId: general2026.id,
      lodgeId: lodge.id,
      memberId: memberIds[20], // Robert Michalski
      checkInDate: "2026-07-04",
      checkOutDate: "2026-07-11",
      numberOfGuests: 2,
      status: "WAITING",
    },
    {
      bookingRoundId: general2026.id,
      lodgeId: lodge.id,
      memberId: memberIds[17], // Stefan Grabowski (not same as PENDING booking)
      checkInDate: "2026-08-01",
      checkOutDate: "2026-08-08",
      numberOfGuests: 1,
      status: "NOTIFIED",
      notifiedAt: new Date("2026-07-20T10:00:00+10:00"),
      expiresAt: new Date("2026-07-22T10:00:00+10:00"),
    },
    {
      bookingRoundId: priority2026.id,
      lodgeId: lodge.id,
      memberId: memberIds[14], // Michal Piotrowski
      checkInDate: "2026-07-18",
      checkOutDate: "2026-07-25",
      numberOfGuests: 2,
      status: "CONVERTED",
      notifiedAt: new Date("2026-04-15T10:00:00+10:00"),
    },
  ]);

  console.log("✓ Created 3 waitlist entries");

  // ─── 19. DOCUMENT LIBRARY ────────────────────────────────────────────────────

  const [docCat1] = await db
    .insert(documentCategories)
    .values({ organisationId: org.id, name: "Club Policies", sortOrder: 0 })
    .returning();
  const [docCat2] = await db
    .insert(documentCategories)
    .values({ organisationId: org.id, name: "Lodge Information", sortOrder: 1 })
    .returning();
  const [docCat3] = await db
    .insert(documentCategories)
    .values({ organisationId: org.id, name: "Forms", sortOrder: 2 })
    .returning();

  await db.insert(documents).values([
    {
      organisationId: org.id,
      categoryId: docCat1.id,
      title: "Club Constitution",
      description: "The official constitution of Polski Ski Club",
      fileUrl: "https://storage.example.com/polski/constitution.pdf",
      fileSizeBytes: 245000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat1.id,
      title: "Booking Policy",
      description: "Rules and procedures for lodge bookings",
      fileUrl: "https://storage.example.com/polski/booking-policy.pdf",
      fileSizeBytes: 128000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat1.id,
      title: "Financial Management Policy",
      description: "Internal financial controls and procedures (committee only)",
      fileUrl: "https://storage.example.com/polski/financial-policy.pdf",
      fileSizeBytes: 98000,
      mimeType: "application/pdf",
      accessLevel: "COMMITTEE",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat2.id,
      title: "Lodge Rules and Conditions",
      description: "House rules for staying at Kosciuszko Lodge",
      fileUrl: "https://storage.example.com/polski/lodge-rules.pdf",
      fileSizeBytes: 76000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat2.id,
      title: "Lodge Floor Plan",
      description: "Floor plan showing all rooms and amenities",
      fileUrl: "https://storage.example.com/polski/floor-plan.pdf",
      fileSizeBytes: 512000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat3.id,
      title: "Membership Application Form",
      description: "Form for new membership applications",
      fileUrl: "https://storage.example.com/polski/membership-form.pdf",
      fileSizeBytes: 45000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      uploadedByMemberId: adminMemberId,
    },
    {
      organisationId: org.id,
      categoryId: docCat3.id,
      title: "Committee Minutes Template",
      description: "Standard template for recording committee meeting minutes",
      fileUrl: "https://storage.example.com/polski/minutes-template.docx",
      fileSizeBytes: 32000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      accessLevel: "ADMIN",
      uploadedByMemberId: adminMemberId,
    },
  ]);

  console.log("✓ Created 3 document categories and 7 documents");

  // ─── 20. CUSTOM FIELDS ───────────────────────────────────────────────────────

  const [cf1] = await db
    .insert(customFields)
    .values({
      organisationId: org.id,
      name: "Dietary Requirements",
      key: "dietary_requirements",
      type: "text",
      sortOrder: 0,
      isRequired: false,
    })
    .returning();

  const [cf2] = await db
    .insert(customFields)
    .values({
      organisationId: org.id,
      name: "Emergency Contact",
      key: "emergency_contact",
      type: "text",
      sortOrder: 1,
      isRequired: true,
    })
    .returning();

  const [cf3] = await db
    .insert(customFields)
    .values({
      organisationId: org.id,
      name: "Ski Ability",
      key: "ski_ability",
      type: "dropdown",
      options: "Beginner,Intermediate,Advanced,Expert",
      sortOrder: 2,
      isRequired: false,
    })
    .returning();

  const [cf4] = await db
    .insert(customFields)
    .values({
      organisationId: org.id,
      name: "Own Key Holder",
      key: "own_key_holder",
      type: "checkbox",
      sortOrder: 3,
      isRequired: false,
    })
    .returning();

  const [cf5] = await db
    .insert(customFields)
    .values({
      organisationId: org.id,
      name: "Date of Last Visit",
      key: "date_of_last_visit",
      type: "date",
      sortOrder: 4,
      isRequired: false,
    })
    .returning();

  // Add values for ~15 members
  const customFieldData = [
    { memberIdx: 0, dietary: "No dietary requirements", emergency: "Jan Kowalski: +61 400 111 222", ski: "Expert", keyHolder: "true", lastVisit: "2025-09-13" },
    { memberIdx: 1, dietary: "Vegetarian", emergency: "Tomasz Nowak: +61 400 222 333", ski: "Advanced", keyHolder: "true", lastVisit: "2025-08-30" },
    { memberIdx: 2, dietary: "Gluten free", emergency: "Maria Wisniewski: +61 400 333 444", ski: "Expert", keyHolder: "true", lastVisit: "2025-09-20" },
    { memberIdx: 3, dietary: "No dietary requirements", emergency: "Adam Wojcik: +61 400 444 555", ski: "Advanced", keyHolder: "false", lastVisit: "2025-07-12" },
    { memberIdx: 4, dietary: "No dietary requirements", emergency: "Helena Borkowski: +61 400 555 666", ski: "Intermediate", keyHolder: "true", lastVisit: "2025-07-26" },
    { memberIdx: 5, dietary: "Lactose intolerant", emergency: "Irena Kaminski: +61 400 666 777", ski: "Advanced", keyHolder: "false", lastVisit: "2025-06-28" },
    { memberIdx: 6, dietary: "Vegan", emergency: "Marek Lewandowski: +61 400 777 888", ski: "Intermediate", keyHolder: "false", lastVisit: "2025-09-20" },
    { memberIdx: 7, dietary: "No dietary requirements", emergency: "Krystyna Zielinska: +61 400 888 999", ski: "Beginner", keyHolder: "false", lastVisit: "2025-07-12" },
    { memberIdx: 8, dietary: "Nut allergy", emergency: "Pawel Szymanski: +61 400 999 000", ski: "Intermediate", keyHolder: "false", lastVisit: "2025-07-19" },
    { memberIdx: 9, dietary: "No dietary requirements", emergency: "Zofia Wozniak: +61 401 111 222", ski: "Advanced", keyHolder: "false", lastVisit: "2025-07-19" },
    { memberIdx: 10, dietary: "No dietary requirements", emergency: "Filip Dabrowski: +61 401 222 333", ski: "Intermediate", keyHolder: "false", lastVisit: "2025-08-09" },
    { memberIdx: 11, dietary: "Vegetarian", emergency: "Anna Kozlowska: +61 401 333 444", ski: "Beginner", keyHolder: "false", lastVisit: "2025-08-16" },
    { memberIdx: 12, dietary: "No dietary requirements", emergency: "Stefan Jankowski: +61 401 444 555", ski: "Advanced", keyHolder: "false", lastVisit: "2025-09-13" },
    { memberIdx: 13, dietary: "No dietary requirements", emergency: "Beata Mazur: +61 401 555 666", ski: "Intermediate", keyHolder: "false", lastVisit: "2025-08-16" },
    { memberIdx: 14, dietary: "Gluten free", emergency: "Teresa Piotrowski: +61 401 666 777", ski: "Expert", keyHolder: "true", lastVisit: "2025-09-13" },
  ];

  for (const cfData of customFieldData) {
    const mid = memberIds[cfData.memberIdx];
    await db.insert(customFieldValues).values([
      { customFieldId: cf1.id, memberId: mid, value: cfData.dietary },
      { customFieldId: cf2.id, memberId: mid, value: cfData.emergency },
      { customFieldId: cf3.id, memberId: mid, value: cfData.ski },
      { customFieldId: cf4.id, memberId: mid, value: cfData.keyHolder },
      { customFieldId: cf5.id, memberId: mid, value: cfData.lastVisit },
    ]);
  }

  console.log("✓ Created 5 custom fields with values for 15 members");

  // ─── 21. PRINT CREDENTIALS ──────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("  Polski Ski Club — Demo Login Credentials");
  console.log("=".repeat(60));
  console.log("  All passwords: testpass123");
  console.log("");
  console.log("  ADMIN:");
  console.log("    marek.kowalski@example.com   (PSC-0001)");
  console.log("    anna.nowak@example.com        (PSC-0002)");
  console.log("");
  console.log("  COMMITTEE:");
  console.log("    piotr.wisniewski@example.com  (PSC-0003)");
  console.log("    katarzyna.wojcik@example.com  (PSC-0004)");
  console.log("    stanislaw.borkowski@example.com (PSC-0005, Life Member)");
  console.log("");
  console.log("  BOOKING OFFICER:");
  console.log("    tomasz.kaminski@example.com   (PSC-0006)");
  console.log("    magdalena.lewandowska@example.com (PSC-0007)");
  console.log("");
  console.log("  MEMBER (Full, financial):");
  console.log("    jan.zielinski@example.com     (PSC-0008)");
  console.log("    agnieszka.szymanska@example.com (PSC-0009)");
  console.log("");
  console.log("  MEMBER (Full, non-financial):");
  console.log("    barbara.krawczyk@example.com  (PSC-0017)");
  console.log("");
  console.log("  MEMBER (Associate):");
  console.log("    stefan.grabowski@example.com  (PSC-0018)");
  console.log("");
  console.log("  Login at: https://snowgum.site/polski/login");
  console.log("=".repeat(60));

  console.log("\n✓ Demo seed complete!");

  process.exit(0);
}

seedDemoData().catch((e) => {
  console.error("Demo seed failed:", e);
  process.exit(1);
});
