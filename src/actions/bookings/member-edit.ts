"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  members,
  organisations,
  lodges,
  tariffs,
  seasons,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingModifiedEmail } from "@/lib/email/templates/booking-modified";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { createAuditLog, diffChanges } from "@/lib/audit-log";
import { validateBookingDates } from "@/actions/availability/validation";
import { processStripeRefund } from "@/actions/stripe/refund";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
} from "./pricing";
import { calculateGst } from "@/lib/currency";
import {
  isWithinEditWindow,
  buildChangesDescription,
} from "./member-edit-helpers";

type MemberEditInput = {
  bookingId: string;
  organisationId: string;
  slug: string;
  newCheckInDate?: string;
  newCheckOutDate?: string;
  newGuestMemberIds?: string[];
  newBedAssignments?: { guestMemberId: string; bedId: string }[];
};

type MemberEditResult = {
  success: boolean;
  error?: string;
  newTotalAmountCents?: number;
  priceDeltaCents?: number;
  topUpTransactionId?: string;
  requiresApproval?: boolean;
};

export async function memberEditBooking(
  input: MemberEditInput
): Promise<MemberEditResult> {
  // 1. Auth check
  const session = await getSessionMember(input.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 2. Load booking
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      bookingReference: bookings.bookingReference,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      lodgeId: bookings.lodgeId,
      primaryMemberId: bookings.primaryMemberId,
      organisationId: bookings.organisationId,
      bookingRoundId: bookings.bookingRoundId,
      totalAmountCents: bookings.totalAmountCents,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      gstAmountCents: bookings.gstAmountCents,
      balancePaidAt: bookings.balancePaidAt,
      requiresApproval: bookings.requiresApproval,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.organisationId, input.organisationId)
      )
    );

  if (!booking) {
    return { success: false, error: "Booking not found" };
  }

  // 3. Ownership check
  if (booking.primaryMemberId !== session.memberId) {
    return { success: false, error: "You can only edit bookings you own" };
  }

  // 4. Status check
  if (
    booking.status === "CANCELLED" ||
    booking.status === "COMPLETED" ||
    booking.status === "WAITLISTED"
  ) {
    return {
      success: false,
      error: `Cannot modify a ${booking.status} booking`,
    };
  }

  // 5. Load guests and org settings
  const existingGuests = await db
    .select({
      id: bookingGuests.id,
      memberId: bookingGuests.memberId,
      snapshotTariffId: bookingGuests.snapshotTariffId,
      snapshotMembershipClassId: bookingGuests.snapshotMembershipClassId,
      bedId: bookingGuests.bedId,
      roomId: bookingGuests.roomId,
      pricePerNightCents: bookingGuests.pricePerNightCents,
      totalAmountCents: bookingGuests.totalAmountCents,
    })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, input.bookingId));

  const [org] = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      slug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      memberBookingEditWindowDays: organisations.memberBookingEditWindowDays,
      memberEditRequiresApproval: organisations.memberEditRequiresApproval,
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) {
    return { success: false, error: "Organisation not found" };
  }

  // 6. Edit window check
  if (org.memberBookingEditWindowDays === 0) {
    return {
      success: false,
      error: "Booking editing is not enabled for this organisation",
    };
  }

  if (
    !isWithinEditWindow(
      booking.checkInDate,
      org.memberBookingEditWindowDays
    )
  ) {
    return {
      success: false,
      error: `Cannot edit — booking must be edited at least ${org.memberBookingEditWindowDays} days before check-in`,
    };
  }

  // 7. Determine what changed
  const newCheckIn = input.newCheckInDate ?? booking.checkInDate;
  const newCheckOut = input.newCheckOutDate ?? booking.checkOutDate;
  const datesChanged =
    newCheckIn !== booking.checkInDate || newCheckOut !== booking.checkOutDate;

  const oldGuestMemberIds = existingGuests.map((g) => g.memberId);
  const newGuestMemberIds = input.newGuestMemberIds ?? oldGuestMemberIds;
  const guestsChanged =
    JSON.stringify([...oldGuestMemberIds].sort()) !==
    JSON.stringify([...newGuestMemberIds].sort());

  // Build bed assignment map from input
  const newBedMap = new Map<string, string>();
  if (input.newBedAssignments) {
    for (const a of input.newBedAssignments) {
      newBedMap.set(a.guestMemberId, a.bedId);
    }
  }

  if (!datesChanged && !guestsChanged && !input.newBedAssignments) {
    return { success: false, error: "No changes detected" };
  }

  // 8. Validate dates if changed
  if (datesChanged) {
    const dateValidation = await validateBookingDates({
      lodgeId: booking.lodgeId,
      checkIn: newCheckIn,
      checkOut: newCheckOut,
      bookingRoundId: booking.bookingRoundId,
      memberId: session.memberId,
      excludeBookingId: input.bookingId,
    });

    if (!dateValidation.valid) {
      return { success: false, error: dateValidation.errors[0] };
    }
  }

  // 9. Validate guests if changed
  const addedMemberIds = newGuestMemberIds.filter(
    (id) => !oldGuestMemberIds.includes(id)
  );
  const removedMemberIds = oldGuestMemberIds.filter(
    (id) => !newGuestMemberIds.includes(id)
  );

  // Primary member cannot be removed
  if (
    booking.primaryMemberId &&
    removedMemberIds.includes(booking.primaryMemberId)
  ) {
    return {
      success: false,
      error: "Cannot remove the primary member from the booking",
    };
  }

  // Validate new guests exist and are financial
  const addedGuestDetails: {
    memberId: string;
    membershipClassId: string | null;
    firstName: string;
    lastName: string;
  }[] = [];
  for (const memberId of addedMemberIds) {
    const [member] = await db
      .select({
        isFinancial: members.isFinancial,
        membershipClassId: members.membershipClassId,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.organisationId, input.organisationId)
        )
      );

    if (!member) {
      return {
        success: false,
        error: "Guest member not found in this organisation",
      };
    }
    if (!member.isFinancial) {
      return {
        success: false,
        error: `${member.firstName} ${member.lastName} is not a financial member`,
      };
    }
    addedGuestDetails.push({
      memberId,
      membershipClassId: member.membershipClassId,
      firstName: member.firstName,
      lastName: member.lastName,
    });
  }

  // 10. Look up tariffs for pricing
  const newNights = countNights(newCheckIn, newCheckOut);
  const newNightDates = getNightDates(newCheckIn, newCheckOut);
  const oldNightDates = getNightDates(booking.checkInDate, booking.checkOutDate);
  const oldGuestCount = existingGuests.length;
  const newGuestCount = newGuestMemberIds.length;

  // Get season for tariff lookup (needed for new guests)
  let seasonId: string | null = null;
  if (addedMemberIds.length > 0) {
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(
        and(
          eq(seasons.isActive, true),
          sql`${seasons.startDate} <= ${newCheckIn}`,
          sql`${seasons.endDate} >= ${newCheckIn}`
        )
      );
    seasonId = season?.id ?? null;
  }

  // Build pricing for all guests (existing + new)
  type GuestPriceEntry = {
    memberId: string;
    price: ReturnType<typeof calculateGuestPrice>;
    tariffId: string | null;
    membershipClassId: string | null;
    bedId: string | null;
    roomId: string | null;
    isNew: boolean;
  };

  const allGuestPrices: GuestPriceEntry[] = [];

  // Price existing guests that are staying
  for (const guest of existingGuests) {
    if (removedMemberIds.includes(guest.memberId)) continue;

    const [tariff] = guest.snapshotTariffId
      ? await db
          .select()
          .from(tariffs)
          .where(eq(tariffs.id, guest.snapshotTariffId))
      : [];

    if (!tariff) {
      return { success: false, error: "Tariff not found for existing guest" };
    }

    const price = calculateGuestPrice({
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });

    const bedId = newBedMap.get(guest.memberId) ?? guest.bedId;

    allGuestPrices.push({
      memberId: guest.memberId,
      price,
      tariffId: guest.snapshotTariffId,
      membershipClassId: guest.snapshotMembershipClassId,
      bedId,
      roomId: guest.roomId,
      isNew: false,
    });
  }

  // Price new guests
  for (const newGuest of addedGuestDetails) {
    let tariff = null;
    if (seasonId && newGuest.membershipClassId) {
      const [classTariff] = await db
        .select()
        .from(tariffs)
        .where(
          and(
            eq(tariffs.lodgeId, booking.lodgeId),
            eq(tariffs.seasonId, seasonId),
            eq(tariffs.membershipClassId, newGuest.membershipClassId)
          )
        );
      tariff = classTariff ?? null;
    }
    if (!tariff && seasonId) {
      const [defaultTariff] = await db
        .select()
        .from(tariffs)
        .where(
          and(
            eq(tariffs.lodgeId, booking.lodgeId),
            eq(tariffs.seasonId, seasonId),
            sql`${tariffs.membershipClassId} IS NULL`
          )
        );
      tariff = defaultTariff ?? null;
    }
    if (!tariff) {
      return { success: false, error: "No tariff found for new guest" };
    }

    const price = calculateGuestPrice({
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });

    const bedId = newBedMap.get(newGuest.memberId) ?? null;

    allGuestPrices.push({
      memberId: newGuest.memberId,
      price,
      tariffId: tariff.id,
      membershipClassId: newGuest.membershipClassId,
      bedId,
      roomId: null,
      isNew: true,
    });
  }

  const bookingTotal = calculateBookingPrice(
    allGuestPrices.map((g) => g.price)
  );
  const gstAmountCents = org.gstEnabled
    ? calculateGst(bookingTotal.totalAmountCents, org.gstRateBps)
    : 0;

  // 11. Price delta handling
  const oldTotalCents = booking.totalAmountCents;
  const newTotalCents = bookingTotal.totalAmountCents;
  const priceDeltaCents = newTotalCents - oldTotalCents;
  const isPaid = !!booking.balancePaidAt;

  let topUpTransactionId: string | undefined;

  // 12. Re-approval check
  const needsReApproval =
    org.memberEditRequiresApproval && booking.requiresApproval;

  // 13. DB transaction
  await db.transaction(async (tx) => {
    // Release old guest count from old night dates
    for (const nightDate of oldNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = GREATEST(booked_beds - ${oldGuestCount}, 0),
                version = version + 1,
                updated_at = NOW()
            WHERE lodge_id = ${booking.lodgeId}
            AND date = ${nightDate}`
      );
    }

    // Lock new dates
    await tx.execute(
      sql`SELECT id FROM availability_cache
          WHERE lodge_id = ${booking.lodgeId}
          AND date >= ${newCheckIn}
          AND date < ${newCheckOut}
          FOR UPDATE`
    );

    // Book new guest count on new night dates
    for (const nightDate of newNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = booked_beds + ${newGuestCount},
                version = version + 1,
                updated_at = NOW()
            WHERE lodge_id = ${booking.lodgeId}
            AND date = ${nightDate}`
      );
    }

    // Update booking
    await tx
      .update(bookings)
      .set({
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        totalNights: newNights,
        subtotalCents: bookingTotal.subtotalCents,
        discountAmountCents: bookingTotal.discountAmountCents,
        totalAmountCents: newTotalCents,
        gstAmountCents,
        ...(needsReApproval && { status: "PENDING" }),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    // Delete removed guests
    for (const removedId of removedMemberIds) {
      const removedGuest = existingGuests.find(
        (g) => g.memberId === removedId
      );
      if (removedGuest) {
        await tx.execute(
          sql`DELETE FROM booking_guests WHERE id = ${removedGuest.id}`
        );
      }
    }

    // Insert new guests
    for (const gp of allGuestPrices.filter((g) => g.isNew)) {
      await tx.insert(bookingGuests).values({
        bookingId: input.bookingId,
        memberId: gp.memberId,
        bedId: gp.bedId,
        roomId: gp.roomId,
        pricePerNightCents: gp.price.blendedPerNightCents,
        totalAmountCents: gp.price.totalCents,
        snapshotTariffId: gp.tariffId,
        snapshotMembershipClassId: gp.membershipClassId,
      });
    }

    // Update existing guests' pricing and beds
    for (const gp of allGuestPrices.filter((g) => !g.isNew)) {
      const existingGuest = existingGuests.find(
        (eg) => eg.memberId === gp.memberId
      );
      if (existingGuest) {
        await tx
          .update(bookingGuests)
          .set({
            pricePerNightCents: gp.price.blendedPerNightCents,
            totalAmountCents: gp.price.totalCents,
            ...(gp.bedId !== existingGuest.bedId && { bedId: gp.bedId }),
          })
          .where(eq(bookingGuests.id, existingGuest.id));
      }
    }

    // Handle transactions
    if (isPaid && priceDeltaCents < 0) {
      await tx.insert(transactions).values({
        organisationId: input.organisationId,
        memberId: session.memberId,
        bookingId: input.bookingId,
        type: "REFUND",
        amountCents: priceDeltaCents,
        description: `Refund for booking edit ${booking.bookingReference}`,
      });
    } else if (isPaid && priceDeltaCents > 0) {
      const [newTxn] = await tx
        .insert(transactions)
        .values({
          organisationId: input.organisationId,
          memberId: session.memberId,
          bookingId: input.bookingId,
          type: "INVOICE",
          amountCents: priceDeltaCents,
          description: `Top-up for booking edit ${booking.bookingReference}`,
        })
        .returning();
      topUpTransactionId = newTxn.id;
    } else if (!isPaid) {
      await tx.execute(
        sql`UPDATE transactions
            SET amount_cents = ${newTotalCents}
            WHERE booking_id = ${input.bookingId}
            AND type = 'INVOICE'`
      );
    }
  });

  // 14. Stripe refund (outside transaction)
  if (isPaid && priceDeltaCents < 0) {
    await processStripeRefund(input.bookingId, Math.abs(priceDeltaCents));
  }

  // 15. Get names for removed guests (for email description)
  const removedGuestNames: string[] = [];
  for (const removedId of removedMemberIds) {
    const [removedMember] = await db
      .select({ firstName: members.firstName, lastName: members.lastName })
      .from(members)
      .where(eq(members.id, removedId));
    if (removedMember) {
      removedGuestNames.push(`${removedMember.firstName} ${removedMember.lastName}`);
    }
  }

  // 16. Audit log
  const { previousValue, newValue } = diffChanges(
    {
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      totalAmountCents: oldTotalCents,
      guestMemberIds: oldGuestMemberIds,
    },
    {
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      totalAmountCents: newTotalCents,
      guestMemberIds: newGuestMemberIds,
    }
  );

  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "BOOKING_MEMBER_EDITED",
    entityType: "booking",
    entityId: input.bookingId,
    previousValue,
    newValue,
  }).catch(console.error);

  // 16. Emails
  const [orgForEmail] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const [lodge] = await db
    .select({ name: lodges.name })
    .from(lodges)
    .where(eq(lodges.id, booking.lodgeId));

  const [memberForEmail] = await db
    .select({
      email: members.email,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.id, booking.primaryMemberId!));

  const changes = buildChangesDescription({
    oldCheckIn: booking.checkInDate,
    oldCheckOut: booking.checkOutDate,
    newCheckIn: datesChanged ? newCheckIn : undefined,
    newCheckOut: datesChanged ? newCheckOut : undefined,
    addedGuestNames: addedGuestDetails.map(
      (g) => `${g.firstName} ${g.lastName}`
    ),
    removedGuestNames:
      removedGuestNames.length > 0 ? removedGuestNames : undefined,
    oldTotalCents: oldTotalCents !== newTotalCents ? oldTotalCents : undefined,
    newTotalCents: oldTotalCents !== newTotalCents ? newTotalCents : undefined,
  });

  if (memberForEmail) {
    sendEmail({
      to: memberForEmail.email,
      subject: `Booking modified — ${booking.bookingReference}`,
      template: React.createElement(BookingModifiedEmail, {
        orgName: orgForEmail?.name ?? input.slug,
        bookingReference: booking.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        totalAmountCents: newTotalCents,
        changes: changes || "Booking details updated",
        logoUrl: orgForEmail?.logoUrl || undefined,
      }),
      replyTo: orgForEmail?.contactEmail || undefined,
      orgName: orgForEmail?.name ?? input.slug,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (orgForEmail?.contactEmail) {
    sendEmail({
      to: orgForEmail.contactEmail,
      subject: `[Admin] Booking modified by member — ${booking.bookingReference}`,
      template: React.createElement(AdminBookingNotificationEmail, {
        orgName: orgForEmail.name,
        bookingReference: booking.bookingReference,
        memberName: memberForEmail
          ? `${memberForEmail.firstName} ${memberForEmail.lastName}`
          : "Unknown",
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        action: "modified" as const,
        adminUrl: `${appUrl}/${input.slug}/admin/bookings/${input.bookingId}`,
        logoUrl: orgForEmail.logoUrl || undefined,
      }),
      orgName: orgForEmail.name,
    });
  }

  // 17. Revalidate
  revalidatePath(`/${input.slug}/dashboard`);
  revalidatePath(`/${input.slug}/dashboard/bookings/${input.bookingId}`);
  revalidatePath(`/${input.slug}/admin/bookings`);
  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);

  return {
    success: true,
    newTotalAmountCents: newTotalCents,
    priceDeltaCents,
    topUpTransactionId,
    requiresApproval: needsReApproval || undefined,
  };
}
