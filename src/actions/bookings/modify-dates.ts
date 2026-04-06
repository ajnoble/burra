"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  tariffs,
  members,
  organisations,
  lodges,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingModifiedEmail } from "@/lib/email/templates/booking-modified";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
} from "./pricing";

type ModifyInput = {
  bookingId: string;
  organisationId: string;
  newCheckInDate: string;
  newCheckOutDate: string;
  slug: string;
};

type ModifyResult = {
  success: boolean;
  error?: string;
  newTotalAmountCents?: number;
};

export async function modifyBookingDates(
  input: ModifyInput
): Promise<ModifyResult> {
  // Fetch booking
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

  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
    return { success: false, error: `Cannot modify a ${booking.status} booking` };
  }

  const newNights = countNights(input.newCheckInDate, input.newCheckOutDate);
  if (newNights <= 0) {
    return { success: false, error: "Check-out must be after check-in" };
  }

  // Get booking guests with their snapshot tariffs
  const guests = await db
    .select({
      id: bookingGuests.id,
      memberId: bookingGuests.memberId,
      snapshotTariffId: bookingGuests.snapshotTariffId,
    })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, input.bookingId));

  // Recalculate pricing for each guest
  const guestPrices = [];
  for (const guest of guests) {
    const [tariff] = guest.snapshotTariffId
      ? await db
          .select()
          .from(tariffs)
          .where(eq(tariffs.id, guest.snapshotTariffId))
      : [];

    if (!tariff) {
      return { success: false, error: "Tariff not found for guest pricing" };
    }

    const price = calculateGuestPrice({
      checkInDate: input.newCheckInDate,
      checkOutDate: input.newCheckOutDate,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });

    guestPrices.push({ guestId: guest.id, price });
  }

  const bookingTotal = calculateBookingPrice(guestPrices.map((g) => g.price));

  const oldNightDates = getNightDates(booking.checkInDate, booking.checkOutDate);
  const newNightDates = getNightDates(input.newCheckInDate, input.newCheckOutDate);
  const guestCount = guests.length;

  await db.transaction(async (tx) => {
    // Release old dates
    for (const nightDate of oldNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = GREATEST(booked_beds - ${guestCount}, 0),
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
          AND date >= ${input.newCheckInDate}
          AND date < ${input.newCheckOutDate}
          FOR UPDATE`
    );

    // Book new dates
    for (const nightDate of newNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = booked_beds + ${guestCount},
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
        checkInDate: input.newCheckInDate,
        checkOutDate: input.newCheckOutDate,
        totalNights: newNights,
        subtotalCents: bookingTotal.subtotalCents,
        discountAmountCents: bookingTotal.discountAmountCents,
        totalAmountCents: bookingTotal.totalAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    // Update each guest's pricing
    for (const gp of guestPrices) {
      await tx
        .update(bookingGuests)
        .set({
          pricePerNightCents: gp.price.blendedPerNightCents,
          totalAmountCents: gp.price.totalCents,
        })
        .where(eq(bookingGuests.id, gp.guestId));
    }

    // Update INVOICE transaction amount
    await tx.execute(
      sql`UPDATE transactions
          SET amount_cents = ${bookingTotal.totalAmountCents}
          WHERE booking_id = ${input.bookingId}
          AND type = 'INVOICE'`
    );
  });

  // Build changes description
  const changes = `Dates changed from ${booking.checkInDate} – ${booking.checkOutDate} to ${input.newCheckInDate} – ${input.newCheckOutDate} (${newNights} nights)`;

  // Fetch org, lodge, and member for emails
  const [org] = await db
    .select({ name: organisations.name, contactEmail: organisations.contactEmail, logoUrl: organisations.logoUrl })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const [lodge] = await db
    .select({ name: lodges.name })
    .from(lodges)
    .where(eq(lodges.id, booking.lodgeId));

  const [member] = await db
    .select({ email: members.email, firstName: members.firstName, lastName: members.lastName })
    .from(members)
    .where(eq(members.id, booking.primaryMemberId!));

  if (member) {
    sendEmail({
      to: member.email,
      subject: `Booking modified — ${booking.bookingReference}`,
      template: React.createElement(BookingModifiedEmail, {
        orgName: org?.name ?? input.slug,
        bookingReference: booking.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: input.newCheckInDate,
        checkOutDate: input.newCheckOutDate,
        totalAmountCents: bookingTotal.totalAmountCents,
        changes,
        logoUrl: org?.logoUrl || undefined,
      }),
      replyTo: org?.contactEmail || undefined,
      orgName: org?.name ?? input.slug,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (org?.contactEmail) {
    sendEmail({
      to: org.contactEmail,
      subject: `[Admin] Booking modified — ${booking.bookingReference}`,
      template: React.createElement(AdminBookingNotificationEmail, {
        orgName: org.name,
        bookingReference: booking.bookingReference,
        memberName: member ? `${member.firstName} ${member.lastName}` : "Unknown",
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: input.newCheckInDate,
        checkOutDate: input.newCheckOutDate,
        action: "modified" as const,
        adminUrl: `${appUrl}/${input.slug}/admin/bookings/${input.bookingId}`,
        logoUrl: org.logoUrl || undefined,
      }),
      orgName: org.name,
    });
  }

  revalidatePath(`/${input.slug}/admin/bookings`);
  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);

  return { success: true, newTotalAmountCents: bookingTotal.totalAmountCents };
}
