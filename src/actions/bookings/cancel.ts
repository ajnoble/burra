"use server";

import { db } from "@/db/index";
import {
  bookings,
  transactions,
  members,
  organisations,
  lodges,
  cancellationPolicies,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingCancelledEmail } from "@/lib/email/templates/booking-cancelled";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { calculateRefundAmount, daysUntilDate } from "@/lib/refund";
import { processStripeRefund } from "@/actions/stripe/refund";
import { getNightDates } from "./pricing";
import { createAuditLog } from "@/lib/audit-log";

type CancelInput = {
  bookingId: string;
  organisationId: string;
  cancelledByMemberId: string;
  reason: string;
  refundOverrideCents?: number;
  slug: string;
};

type CancelResult = {
  success: boolean;
  error?: string;
  refundAmountCents?: number;
};

export async function cancelBooking(input: CancelInput): Promise<CancelResult> {
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
      totalAmountCents: bookings.totalAmountCents,
      balancePaidAt: bookings.balancePaidAt,
      cancellationPolicyId: bookings.cancellationPolicyId,
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

  if (booking.status === "CANCELLED") {
    return { success: false, error: "Booking is already cancelled" };
  }

  if (booking.status === "COMPLETED") {
    return { success: false, error: "Cannot cancel a completed booking" };
  }

  // Calculate refund
  let refundAmountCents = 0;

  if (booking.balancePaidAt) {
    if (input.refundOverrideCents !== undefined) {
      refundAmountCents = input.refundOverrideCents;
    } else if (booking.cancellationPolicyId) {
      const [policy] = await db
        .select({ rules: cancellationPolicies.rules })
        .from(cancellationPolicies)
        .where(eq(cancellationPolicies.id, booking.cancellationPolicyId));

      if (policy) {
        const days = daysUntilDate(booking.checkInDate);
        const result = calculateRefundAmount({
          rules: policy.rules,
          totalPaidCents: booking.totalAmountCents,
          daysUntilCheckin: days,
        });
        refundAmountCents = result.refundAmountCents;
      }
    }
  }

  const nightDates = getNightDates(booking.checkInDate, booking.checkOutDate);

  // Transaction: update booking, release availability, create refund transaction
  await db.transaction(async (tx) => {
    // Update booking status
    await tx
      .update(bookings)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        refundAmountCents: refundAmountCents > 0 ? refundAmountCents : null,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    // Release availability — decrement bookedBeds for each night
    const guestCountResult = await tx.execute(
      sql`SELECT COUNT(*) as count FROM booking_guests WHERE booking_id = ${input.bookingId}`
    );
    const guestRows = guestCountResult as unknown as { count: number }[] | undefined;
    const guestCount = Number(guestRows?.[0]?.count ?? 0);

    for (const nightDate of nightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = GREATEST(booked_beds - ${guestCount}, 0),
                version = version + 1,
                updated_at = NOW()
            WHERE lodge_id = ${booking.lodgeId}
            AND date = ${nightDate}`
      );
    }

    // Create REFUND transaction if refund > 0
    if (refundAmountCents > 0 && booking.balancePaidAt) {
      await tx.insert(transactions).values({
        organisationId: input.organisationId,
        memberId: booking.primaryMemberId!,
        bookingId: input.bookingId,
        type: "REFUND",
        amountCents: -refundAmountCents,
        description: `Refund for cancelled booking ${booking.bookingReference}`,
      });
    }
  });

  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: input.cancelledByMemberId,
    action: "BOOKING_CANCELLED",
    entityType: "booking",
    entityId: input.bookingId,
    previousValue: { status: booking.status },
    newValue: { status: "CANCELLED", cancellationReason: input.reason, refundAmountCents: refundAmountCents > 0 ? refundAmountCents : null },
  }).catch(console.error);

  // Process Stripe refund (outside transaction — Stripe is external)
  if (refundAmountCents > 0 && booking.balancePaidAt) {
    await processStripeRefund(input.bookingId, refundAmountCents);
  }

  // Send cancellation email
  const [org] = await db
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

  const [member] = await db
    .select({ email: members.email, firstName: members.firstName, lastName: members.lastName })
    .from(members)
    .where(eq(members.id, booking.primaryMemberId!));

  if (member) {
    sendEmail({
      to: member.email,
      subject: `Booking cancelled — ${booking.bookingReference}`,
      template: React.createElement(BookingCancelledEmail, {
        orgName: org?.name ?? input.slug,
        bookingReference: booking.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        reason: input.reason,
        refundAmountCents: refundAmountCents > 0 ? refundAmountCents : undefined,
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
      subject: `[Admin] Booking cancelled — ${booking.bookingReference}`,
      template: React.createElement(AdminBookingNotificationEmail, {
        orgName: org.name,
        bookingReference: booking.bookingReference,
        memberName: member ? `${member.firstName} ${member.lastName}` : "Unknown",
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        action: "cancelled" as const,
        adminUrl: `${appUrl}/${input.slug}/admin/bookings/${input.bookingId}`,
        logoUrl: org.logoUrl || undefined,
      }),
      orgName: org.name,
    });
  }

  revalidatePath(`/${input.slug}/admin/bookings`);
  revalidatePath(`/${input.slug}/dashboard`);

  return { success: true, refundAmountCents };
}
