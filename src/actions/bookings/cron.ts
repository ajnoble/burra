import { db } from "@/db/index";
import { bookings, bookingRounds, organisations, members, lodges, bedHolds } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingPaymentReminderEmail } from "@/lib/email/templates/booking-payment-reminder";
import { BookingAutoCancelledEmail } from "@/lib/email/templates/booking-auto-cancelled";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { cancelBooking } from "./cancel";

export type BookingPaymentCronResult = {
  remindersSent: number;
  bookingsCancelled: number;
  holdsCleared: boolean;
};

/** Returns the number of days from today until the given date string (YYYY-MM-DD). */
export function daysUntil(dateStr: string): number {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const todayDate = new Date(todayStr + "T00:00:00.000Z");
  const targetDate = new Date(dateStr + "T00:00:00.000Z");
  const diffMs = targetDate.getTime() - todayDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

type UnpaidBookingRow = {
  bookingId: string;
  organisationId: string;
  bookingRoundId: string;
  status: string;
  balanceDueDate: string | null;
  balancePaidAt: Date | null;
  paymentRemindersSentAt: Record<string, string> | null;
  totalAmountCents: number;
  bookingReference: string;
  checkInDate: string;
  checkOutDate: string;
  primaryMemberId: string | null;
  lodgeId: string;
  memberEmail: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  orgName: string;
  orgSlug: string;
  contactEmail: string | null;
  logoUrl: string | null;
  roundPaymentReminderDays: number[] | null;
  roundPaymentGraceDays: number | null;
  autoCancelRefundPolicy: string | null;
  orgPaymentGraceDays: number;
  orgPaymentReminderDays: number[];
};

async function queryUnpaidBookings(): Promise<UnpaidBookingRow[]> {
  return db
    .select({
      bookingId: bookings.id,
      organisationId: bookings.organisationId,
      bookingRoundId: bookings.bookingRoundId,
      status: bookings.status,
      balanceDueDate: bookings.balanceDueDate,
      balancePaidAt: bookings.balancePaidAt,
      paymentRemindersSentAt: bookings.paymentRemindersSentAt,
      totalAmountCents: bookings.totalAmountCents,
      bookingReference: bookings.bookingReference,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      primaryMemberId: bookings.primaryMemberId,
      lodgeId: bookings.lodgeId,
      memberEmail: members.email,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      lodgeName: lodges.name,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      roundPaymentReminderDays: bookingRounds.paymentReminderDays,
      roundPaymentGraceDays: bookingRounds.paymentGraceDays,
      autoCancelRefundPolicy: bookingRounds.autoCancelRefundPolicy,
      orgPaymentGraceDays: organisations.bookingPaymentGraceDays,
      orgPaymentReminderDays: organisations.bookingPaymentReminderDays,
    })
    .from(bookings)
    .innerJoin(bookingRounds, eq(bookingRounds.id, bookings.bookingRoundId))
    .innerJoin(organisations, eq(organisations.id, bookings.organisationId))
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.status, "CONFIRMED"),
        isNull(bookings.balancePaidAt),
        isNotNull(bookings.balanceDueDate)
      )
    ) as Promise<UnpaidBookingRow[]>;
}

export async function processBookingPaymentCron(): Promise<BookingPaymentCronResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let remindersSent = 0;
  let bookingsCancelled = 0;

  // ─── Pass 1: Payment Reminders ──────────────────────────────────────────

  const unpaidBookings = await queryUnpaidBookings();

  for (const booking of unpaidBookings) {
    if (!booking.balanceDueDate) continue;

    const daysRemaining = daysUntil(booking.balanceDueDate);

    // Resolve reminder days: round override ?? org default
    const reminderDays: number[] =
      booking.roundPaymentReminderDays ?? booking.orgPaymentReminderDays ?? [7, 1];

    // Sort descending so we match the highest applicable threshold first
    const sorted = [...reminderDays].sort((a, b) => b - a);

    const alreadySent = booking.paymentRemindersSentAt ?? {};

    // Find the first threshold where daysRemaining <= threshold AND not yet sent
    let matched = false;
    for (const threshold of sorted) {
      if (daysRemaining <= threshold && !alreadySent[String(threshold)]) {
        // Send reminder
        sendEmail({
          to: booking.memberEmail,
          subject: `Payment reminder — ${booking.bookingReference}`,
          template: React.createElement(BookingPaymentReminderEmail, {
            orgName: booking.orgName,
            bookingReference: booking.bookingReference,
            lodgeName: booking.lodgeName,
            checkInDate: booking.checkInDate,
            checkOutDate: booking.checkOutDate,
            totalAmountCents: booking.totalAmountCents,
            balanceDueDate: booking.balanceDueDate,
            daysRemaining,
            payUrl: `${appUrl}/${booking.orgSlug}/dashboard`,
            logoUrl: booking.logoUrl || undefined,
          }),
          replyTo: booking.contactEmail || undefined,
          orgName: booking.orgName,
        });

        // Update paymentRemindersSentAt — merge new threshold into existing record
        const updated: Record<string, string> = {
          ...alreadySent,
          [String(threshold)]: new Date().toISOString(),
        };

        await db
          .update(bookings)
          .set({ paymentRemindersSentAt: updated, updatedAt: new Date() })
          .where(eq(bookings.id, booking.bookingId));

        remindersSent++;
        matched = true;
        break; // Only one reminder per booking per cron run
      }
    }

    void matched; // suppress unused-variable lint
  }

  // ─── Pass 2: Auto-Cancel ────────────────────────────────────────────────

  const overdueBookings = await queryUnpaidBookings();

  for (const booking of overdueBookings) {
    if (!booking.balanceDueDate) continue;

    const daysRemaining = daysUntil(booking.balanceDueDate);
    const daysPastDue = -daysRemaining; // positive when overdue

    // Resolve grace period: round override ?? org default
    const gracePeriodDays =
      booking.roundPaymentGraceDays ?? booking.orgPaymentGraceDays ?? 7;

    if (daysPastDue < gracePeriodDays) continue;

    // Determine refund override
    const refundPolicy = booking.autoCancelRefundPolicy ?? "cancellation_policy";
    let refundOverrideCents: number | undefined;

    if (refundPolicy === "none") {
      refundOverrideCents = 0;
    } else if (refundPolicy === "full") {
      refundOverrideCents = booking.totalAmountCents;
    }
    // "cancellation_policy" → leave undefined

    const result = await cancelBooking({
      bookingId: booking.bookingId,
      organisationId: booking.organisationId,
      cancelledByMemberId: booking.primaryMemberId ?? booking.bookingId,
      reason: "Booking auto-cancelled: payment not received by due date",
      refundOverrideCents,
      slug: booking.orgSlug,
    });

    if (result.success) {
      bookingsCancelled++;

      sendEmail({
        to: booking.memberEmail,
        subject: `Booking auto-cancelled — ${booking.bookingReference}`,
        template: React.createElement(BookingAutoCancelledEmail, {
          orgName: booking.orgName,
          bookingReference: booking.bookingReference,
          lodgeName: booking.lodgeName,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          totalAmountCents: booking.totalAmountCents,
          refundAmountCents: result.refundAmountCents,
          logoUrl: booking.logoUrl || undefined,
        }),
        replyTo: booking.contactEmail || undefined,
        orgName: booking.orgName,
      });

      if (booking.contactEmail) {
        sendEmail({
          to: booking.contactEmail,
          subject: `[Admin] Booking auto-cancelled — ${booking.bookingReference}`,
          template: React.createElement(AdminBookingNotificationEmail, {
            orgName: booking.orgName,
            bookingReference: booking.bookingReference,
            memberName: `${booking.memberFirstName} ${booking.memberLastName}`,
            lodgeName: booking.lodgeName,
            checkInDate: booking.checkInDate,
            checkOutDate: booking.checkOutDate,
            action: "cancelled" as const,
            adminUrl: `${appUrl}/${booking.orgSlug}/admin/bookings/${booking.bookingId}`,
            logoUrl: booking.logoUrl || undefined,
          }),
          orgName: booking.orgName,
        });
      }
    }
  }

  // ─── Pass 3: Hold Cleanup ────────────────────────────────────────────────

  await db
    .delete(bedHolds)
    .where(lt(bedHolds.expiresAt, sql`now()`));

  return { remindersSent, bookingsCancelled, holdsCleared: true };
}
