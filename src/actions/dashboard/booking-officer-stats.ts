"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  members,
  lodges,
  availabilityCache,
} from "@/db/schema";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { format, addDays } from "date-fns";

export type UpcomingArrival = {
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  lodgeName: string;
};

export type OccupancyDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  occupancyPercent: number;
};

export type BookingOfficerStatsResult = {
  arrivalsToday: number;
  departuresToday: number;
  currentOccupancyPercent: number;
  pendingApprovals: number;
  upcomingArrivals: UpcomingArrival[];
  occupancyForecast: OccupancyDay[];
};

type BookingOfficerStatsInput = {
  organisationId: string;
  today: string; // YYYY-MM-DD
};

const ACTIVE_STATUSES = ["CONFIRMED", "PENDING"] as const;
const DEPARTURE_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

export async function getBookingOfficerStats(
  input: BookingOfficerStatsInput
): Promise<BookingOfficerStatsResult> {
  const { organisationId, today } = input;

  const todayDate = new Date(today);
  const sevenDaysLater = format(addDays(todayDate, 7), "yyyy-MM-dd");
  const thirtyDaysLater = format(addDays(todayDate, 30), "yyyy-MM-dd");

  // 1. Arrivals today: check_in_date = today AND status IN ('CONFIRMED','PENDING')
  const arrivalsRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.checkInDate, today),
        inArray(bookings.status, ACTIVE_STATUSES)
      )
    );
  const arrivalsToday = Number(arrivalsRows[0]?.count ?? 0);

  // 2. Departures today: check_out_date = today AND status IN ('CONFIRMED','COMPLETED')
  const departuresRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.checkOutDate, today),
        inArray(bookings.status, DEPARTURE_STATUSES)
      )
    );
  const departuresToday = Number(departuresRows[0]?.count ?? 0);

  // 3. Pending approvals: status = 'PENDING'
  const pendingRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.status, "PENDING")
      )
    );
  const pendingApprovals = Number(pendingRows[0]?.count ?? 0);

  // 4. Current occupancy: SUM totalBeds, bookedBeds from availabilityCache WHERE date = today
  const occupancyRows = await db
    .select({
      totalBeds: sql<number>`COALESCE(SUM(${availabilityCache.totalBeds}), 0)`,
      bookedBeds: sql<number>`COALESCE(SUM(${availabilityCache.bookedBeds}), 0)`,
    })
    .from(availabilityCache)
    .where(eq(availabilityCache.date, today));

  const totalBeds = Number(occupancyRows[0]?.totalBeds ?? 0);
  const bookedBeds = Number(occupancyRows[0]?.bookedBeds ?? 0);
  const currentOccupancyPercent =
    totalBeds > 0 ? Math.round((bookedBeds / totalBeds) * 100) : 0;

  // 5. Upcoming arrivals (next 7 days): JOIN members and lodges, ordered by checkInDate
  const upcomingRows = await db
    .select({
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      guestCount: sql<number>`(
        SELECT COUNT(*) FROM ${bookingGuests} bg WHERE bg.booking_id = ${bookings.id}
      )`,
      lodgeName: lodges.name,
    })
    .from(bookings)
    .innerJoin(members, eq(bookings.primaryMemberId, members.id))
    .innerJoin(lodges, eq(bookings.lodgeId, lodges.id))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        gte(bookings.checkInDate, today),
        lte(bookings.checkInDate, sevenDaysLater),
        inArray(bookings.status, ACTIVE_STATUSES)
      )
    )
    .orderBy(bookings.checkInDate);

  const upcomingArrivals: UpcomingArrival[] = (
    upcomingRows as Array<{
      bookingReference: string;
      memberFirstName: string;
      memberLastName: string;
      checkInDate: string;
      checkOutDate: string;
      guestCount: number;
      lodgeName: string;
    }>
  ).map((row) => ({
    bookingReference: row.bookingReference,
    memberFirstName: row.memberFirstName,
    memberLastName: row.memberLastName,
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    guestCount: Number(row.guestCount),
    lodgeName: row.lodgeName,
  }));

  // 6. Occupancy forecast (30 days): SELECT from availabilityCache
  const forecastRows = await db
    .select({
      date: availabilityCache.date,
      totalBeds: sql<number>`COALESCE(SUM(${availabilityCache.totalBeds}), 0)`,
      bookedBeds: sql<number>`COALESCE(SUM(${availabilityCache.bookedBeds}), 0)`,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, today),
        lte(availabilityCache.date, thirtyDaysLater)
      )
    )
    .groupBy(availabilityCache.date);

  const occupancyForecast: OccupancyDay[] = (
    forecastRows as Array<{
      date: string;
      totalBeds: number;
      bookedBeds: number;
    }>
  ).map((row) => {
    const total = Number(row.totalBeds);
    const booked = Number(row.bookedBeds);
    return {
      date: row.date,
      totalBeds: total,
      bookedBeds: booked,
      occupancyPercent: total > 0 ? Math.round((booked / total) * 100) : 0,
    };
  });

  return {
    arrivalsToday,
    departuresToday,
    currentOccupancyPercent,
    pendingApprovals,
    upcomingArrivals,
    occupancyForecast,
  };
}
