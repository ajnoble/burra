"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  bedHolds,
  members,
  tariffs,
  seasons,
  bookingRounds,
  organisations,
  lodges,
  waitlistEntries,
  associates,
  membershipClasses,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { type CreateBookingInput } from "./schemas";
import { generateBookingReference } from "./reference";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  calculatePortaCotPrice,
  countNights,
  getNightDates,
  type GuestPriceResult,
  type PortaCotPriceResult,
} from "./pricing";
import { getPortaCotAvailability } from "./portacot";
import { validateBookingDates } from "@/actions/availability/validation";
import { revalidatePath } from "next/cache";
import { validateCreateBookingInput, getBalanceDueDateForRound } from "./create-helpers";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { createAuditLog } from "@/lib/audit-log";
import { calculateGst } from "@/lib/currency";


async function getGuestTariffClassId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  guest: { memberId?: string; associateId?: string },
  organisationId: string
): Promise<string | null> {
  if (guest.memberId) {
    const [member] = await tx
      .select({ membershipClassId: members.membershipClassId })
      .from(members)
      .where(eq(members.id, guest.memberId));
    return member?.membershipClassId ?? null;
  }
  // Associate — use org's guest class
  const [guestClass] = await tx
    .select({ id: membershipClasses.id })
    .from(membershipClasses)
    .where(
      and(
        eq(membershipClasses.organisationId, organisationId),
        eq(membershipClasses.isGuestClass, true)
      )
    );
  if (!guestClass) {
    throw new Error("Guest pricing not configured for this organisation. Contact your administrator.");
  }
  return guestClass.id;
}

type CreateBookingResult = {
  success: boolean;
  error?: string;
  bookingReference?: string;
  bookingId?: string;
};

/**
 * Create a booking with full concurrency handling.
 *
 * 1. Auth + eligibility check
 * 2. BEGIN TRANSACTION
 * 3. SELECT FOR UPDATE on availability_cache rows
 * 4. Verify beds still available
 * 5. Re-validate booking rules
 * 6. Calculate final pricing
 * 7. Insert booking, guests, transaction
 * 8. Update availability_cache
 * 9. Delete bed holds
 * 10. COMMIT
 */
export async function createBooking(
  input: CreateBookingInput,
  slug: string
): Promise<CreateBookingResult> {
  // 1. Validate input schema
  const validation = validateCreateBookingInput(input);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.errors[0] };
  }

  const data = validation.data;

  // 2. Auth check
  const session = await getSessionMember(data.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 3. Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(eq(members.id, session.memberId));

  if (!member?.isFinancial) {
    return {
      success: false,
      error: "Your membership is not currently financial",
    };
  }

  // 4. Re-validate booking dates server-side
  const dateValidation = await validateBookingDates({
    lodgeId: data.lodgeId,
    checkIn: data.checkInDate,
    checkOut: data.checkOutDate,
    bookingRoundId: data.bookingRoundId,
    memberId: session.memberId,
  });

  if (!dateValidation.valid) {
    return { success: false, error: dateValidation.errors[0] };
  }

  // 5. Get booking round for requiresApproval
  const [round] = await db
    .select({ requiresApproval: bookingRounds.requiresApproval })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, data.bookingRoundId));

  if (!round) {
    return { success: false, error: "Booking round not found" };
  }

  const balanceDueDate = round.requiresApproval
    ? null  // Set on approval instead
    : await getBalanceDueDateForRound(data.bookingRoundId);

  const nights = countNights(data.checkInDate, data.checkOutDate);
  const nightDates = getNightDates(data.checkInDate, data.checkOutDate);

  // 6. Get season for tariff lookup
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.isActive, true),
        sql`${seasons.startDate} <= ${data.checkInDate}`,
        sql`${seasons.endDate} >= ${data.checkInDate}`
      )
    );

  if (!season) {
    return { success: false, error: "No active season found for these dates" };
  }

  // 7. Transactional booking creation
  try {
    const result = await db.transaction(async (tx) => {
      // SELECT FOR UPDATE on availability_cache rows to lock them
      const lockedRows = await tx.execute(
        sql`SELECT id, booked_beds, version FROM availability_cache
            WHERE lodge_id = ${data.lodgeId}
            AND date >= ${data.checkInDate}
            AND date < ${data.checkOutDate}
            FOR UPDATE`
      );

      // Validate port-a-cot availability
      const cotGuests = data.guests.filter((g) => g.portaCotRequested);
      if (cotGuests.length > 0) {
        const cotAvail = await getPortaCotAvailability(data.lodgeId, data.checkInDate, data.checkOutDate);
        if (cotGuests.length > cotAvail.available) {
          throw new Error(`Only ${cotAvail.available} port-a-cot${cotAvail.available === 1 ? "" : "s"} available for these dates.`);
        }
      }

      // Verify each selected bed is not already booked (skip cot guests)
      for (const guest of data.guests) {
        if (guest.portaCotRequested || !guest.bedId) continue;
        const conflicting = await tx.execute(
          sql`SELECT bg.bed_id FROM booking_guests bg
              JOIN bookings b ON b.id = bg.booking_id
              WHERE bg.bed_id = ${guest.bedId}
              AND b.lodge_id = ${data.lodgeId}
              AND b.status NOT IN ('CANCELLED')
              AND b.check_in_date < ${data.checkOutDate}
              AND b.check_out_date > ${data.checkInDate}`
        );

        if (conflicting && (conflicting as unknown[]).length > 0) {
          throw new Error(`Bed is no longer available`);
        }
      }

      // Calculate pricing per guest
      type GuestPriceEntry = {
        memberId?: string;
        associateId?: string;
        bedId?: string;
        roomId?: string;
        portaCotRequested: boolean;
        price: GuestPriceResult | null;
        cotPrice: PortaCotPriceResult | null;
        tariffId: string | null;
        membershipClassId: string | null;
      };
      const guestPrices: GuestPriceEntry[] = [];

      for (const guest of data.guests) {
        const guestClassId = await getGuestTariffClassId(tx, guest, data.organisationId);

        // Look up tariff: class-specific first, then default
        let tariff = null;
        if (guestClassId) {
          const [classTariff] = await tx
            .select()
            .from(tariffs)
            .where(
              and(
                eq(tariffs.lodgeId, data.lodgeId),
                eq(tariffs.seasonId, season.id),
                eq(tariffs.membershipClassId, guestClassId)
              )
            );
          tariff = classTariff ?? null;
        }

        if (!tariff) {
          // Fallback to default tariff (null membershipClassId)
          const [defaultTariff] = await tx
            .select()
            .from(tariffs)
            .where(
              and(
                eq(tariffs.lodgeId, data.lodgeId),
                eq(tariffs.seasonId, season.id),
                sql`${tariffs.membershipClassId} IS NULL`
              )
            );
          tariff = defaultTariff ?? null;
        }

        if (!tariff) {
          throw new Error(
            "No tariff found for this lodge and season. Contact your administrator."
          );
        }

        if (guest.portaCotRequested) {
          // Port-a-cot guest pricing
          if (tariff.portaCotPricePerNightCents == null) {
            throw new Error("Port-a-cot pricing not configured for this lodge and season. Contact your administrator.");
          }
          const cotPrice = calculatePortaCotPrice({
            checkInDate: data.checkInDate,
            checkOutDate: data.checkOutDate,
            portaCotPricePerNightCents: tariff.portaCotPricePerNightCents,
          });
          guestPrices.push({
            memberId: guest.memberId,
            associateId: guest.associateId,
            bedId: guest.bedId,
            roomId: guest.roomId,
            portaCotRequested: true,
            price: null,
            cotPrice,
            tariffId: tariff.id,
            membershipClassId: guestClassId,
          });
        } else {
          // Bed guest pricing
          const price = calculateGuestPrice({
            checkInDate: data.checkInDate,
            checkOutDate: data.checkOutDate,
            pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
            pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
            discountFiveNightsBps: tariff.discountFiveNightsBps,
            discountSevenNightsBps: tariff.discountSevenNightsBps,
          });
          guestPrices.push({
            memberId: guest.memberId,
            associateId: guest.associateId,
            bedId: guest.bedId,
            roomId: guest.roomId,
            portaCotRequested: false,
            price,
            cotPrice: null,
            tariffId: tariff.id,
            membershipClassId: guestClassId,
          });
        }
      }

      const bedGuestPrices = guestPrices.filter((g) => g.price !== null);
      const cotGuestPrices = guestPrices.filter((g) => g.cotPrice !== null);

      const bookingTotal = calculateBookingPrice(
        bedGuestPrices.map((g) => g.price!)
      );
      const cotTotalCents = cotGuestPrices.reduce(
        (sum, g) => sum + g.cotPrice!.totalCents,
        0
      );
      bookingTotal.subtotalCents += cotTotalCents;
      bookingTotal.totalAmountCents += cotTotalCents;

      const [orgGst] = await tx
        .select({
          gstEnabled: organisations.gstEnabled,
          gstRateBps: organisations.gstRateBps,
        })
        .from(organisations)
        .where(eq(organisations.id, data.organisationId));

      const bookingGstAmountCents = orgGst?.gstEnabled
        ? calculateGst(bookingTotal.totalAmountCents, orgGst.gstRateBps)
        : 0;

      // Generate reference
      const bookingReference = generateBookingReference(slug);
      const status = round.requiresApproval ? "PENDING" : "CONFIRMED";

      // Insert booking
      const [booking] = await tx
        .insert(bookings)
        .values({
          organisationId: data.organisationId,
          lodgeId: data.lodgeId,
          bookingRoundId: data.bookingRoundId,
          primaryMemberId: session.memberId,
          status,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          totalNights: nights,
          subtotalCents: bookingTotal.subtotalCents,
          discountAmountCents: bookingTotal.discountAmountCents,
          totalAmountCents: bookingTotal.totalAmountCents,
          gstAmountCents: bookingGstAmountCents,
          requiresApproval: round.requiresApproval,
          bookingReference,
          ...(balanceDueDate && { balanceDueDate }),
        })
        .returning();

      // Insert booking guests
      for (const gp of guestPrices) {
        const isCot = gp.portaCotRequested && gp.cotPrice;
        await tx.insert(bookingGuests).values({
          bookingId: booking.id,
          memberId: gp.memberId ?? null,
          associateId: gp.associateId ?? null,
          bedId: gp.bedId ?? null,
          roomId: gp.roomId ?? null,
          portaCotRequested: gp.portaCotRequested,
          pricePerNightCents: isCot
            ? gp.cotPrice!.pricePerNightCents
            : gp.price!.blendedPerNightCents,
          totalAmountCents: isCot
            ? gp.cotPrice!.totalCents
            : gp.price!.totalCents,
          snapshotTariffId: gp.tariffId,
          snapshotMembershipClassId: gp.membershipClassId,
        });
      }

      // Insert transaction (invoice)
      await tx.insert(transactions).values({
        organisationId: data.organisationId,
        memberId: session.memberId,
        bookingId: booking.id,
        type: "INVOICE",
        amountCents: bookingTotal.totalAmountCents,
        description: `Booking ${bookingReference} — ${nights} nights at lodge`,
      });

      // Update availability_cache — increment bookedBeds for bed guests only (not cot guests)
      const bedGuestCount = data.guests.filter((g) => !g.portaCotRequested).length;
      if (bedGuestCount > 0) {
        for (const nightDate of nightDates) {
          await tx.execute(
            sql`UPDATE availability_cache
                SET booked_beds = booked_beds + ${bedGuestCount},
                    version = version + 1,
                    updated_at = NOW()
                WHERE lodge_id = ${data.lodgeId}
                AND date = ${nightDate}`
          );
        }
      }

      // Delete bed holds for this member/round
      await tx
        .delete(bedHolds)
        .where(
          and(
            eq(bedHolds.memberId, session.memberId),
            eq(bedHolds.bookingRoundId, data.bookingRoundId)
          )
        );

      return {
        bookingReference: booking.bookingReference,
        bookingId: booking.id,
        totalAmountCents: bookingTotal.totalAmountCents,
        status,
      };
    });

    createAuditLog({
      organisationId: data.organisationId,
      actorMemberId: session.memberId,
      action: "BOOKING_CREATED",
      entityType: "booking",
      entityId: result.bookingId,
      previousValue: null,
      newValue: { bookingReference: result.bookingReference, status: result.status, totalAmountCents: result.totalAmountCents },
    }).catch(console.error);

    // Fetch org and lodge details for email
    const [org] = await db
      .select({
        name: organisations.name,
        contactEmail: organisations.contactEmail,
        logoUrl: organisations.logoUrl,
      })
      .from(organisations)
      .where(eq(organisations.id, data.organisationId));

    const [lodge] = await db
      .select({ name: lodges.name })
      .from(lodges)
      .where(eq(lodges.id, data.lodgeId));

    // Get guest names for email (members and associates)
    const guestMemberIds = data.guests
      .filter((g) => g.memberId)
      .map((g) => g.memberId!);
    const guestAssociateIds = data.guests
      .filter((g) => g.associateId)
      .map((g) => g.associateId!);

    let guestMembers: { firstName: string; lastName: string }[] = [];
    if (guestMemberIds.length > 0) {
      guestMembers = await db
        .select({ firstName: members.firstName, lastName: members.lastName })
        .from(members)
        .where(sql`${members.id} IN (${sql.join(guestMemberIds.map(id => sql`${id}`), sql`, `)})`);
    }
    if (guestAssociateIds.length > 0) {
      const assocNames = await db
        .select({ firstName: associates.firstName, lastName: associates.lastName })
        .from(associates)
        .where(sql`${associates.id} IN (${sql.join(guestAssociateIds.map(id => sql`${id}`), sql`, `)})`);
      guestMembers = [...guestMembers, ...assocNames];
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Send booking confirmation only when actually confirmed (not pending approval)
    if (result.status === "CONFIRMED") {
      sendEmail({
        to: session.email,
        subject: `Booking confirmed — ${result.bookingReference}`,
        template: React.createElement(BookingConfirmationEmail, {
          orgName: org?.name ?? slug,
          bookingReference: result.bookingReference,
          lodgeName: lodge?.name ?? "Lodge",
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          totalNights: nights,
          guests: guestMembers,
          totalAmountCents: result.totalAmountCents,
          payUrl: `${appUrl}/${slug}/dashboard`,
          logoUrl: org?.logoUrl || undefined,
        }),
        replyTo: org?.contactEmail || undefined,
        orgName: org?.name ?? slug,
      });
    }

    // Send admin notification
    if (org?.contactEmail) {
      sendEmail({
        to: org.contactEmail,
        subject: `[Admin] Booking created — ${result.bookingReference}`,
        template: React.createElement(AdminBookingNotificationEmail, {
          orgName: org.name,
          bookingReference: result.bookingReference,
          memberName: `${session.firstName} ${session.lastName}`,
          lodgeName: lodge?.name ?? "Lodge",
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          action: "created" as const,
          adminUrl: `${appUrl}/${slug}/admin`,
          logoUrl: org.logoUrl || undefined,
        }),
        orgName: org.name,
      });
    }

    revalidatePath(`/${slug}/dashboard`);
    revalidatePath(`/${slug}/book`);

    // Convert matching waitlist entry if this member was notified
    try {
      await db
        .update(waitlistEntries)
        .set({ status: "CONVERTED" })
        .where(
          and(
            eq(waitlistEntries.memberId, session.memberId),
            eq(waitlistEntries.lodgeId, data.lodgeId),
            eq(waitlistEntries.status, "NOTIFIED"),
            sql`${waitlistEntries.checkInDate} <= ${data.checkOutDate}`,
            sql`${waitlistEntries.checkOutDate} >= ${data.checkInDate}`
          )
        );
    } catch {
      // Non-critical — don't fail the booking if waitlist update fails
    }

    return {
      success: true,
      bookingReference: result.bookingReference,
      bookingId: result.bookingId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Booking failed";

    if (message.includes("no longer available") || message.includes("Bed")) {
      return {
        success: false,
        error: "One or more beds are no longer available. Please go back and reselect.",
      };
    }

    return { success: false, error: message };
  }
}
