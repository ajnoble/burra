"use server";

import { db } from "@/db/index";
import { bookings, members, organisations, lodges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingApprovedEmail } from "@/lib/email/templates/booking-approved";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";

type ApproveInput = {
  bookingId: string;
  organisationId: string;
  approverMemberId: string;
  note?: string;
  slug: string;
};

type ApproveResult = { success: boolean; error?: string };

export async function approveBooking(
  input: ApproveInput
): Promise<ApproveResult> {
  // Auth check
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Not authorised" };
  }

  // Verify booking exists and is PENDING
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      bookingReference: bookings.bookingReference,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      lodgeId: bookings.lodgeId,
      primaryMemberId: bookings.primaryMemberId,
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

  if (booking.status !== "PENDING") {
    return {
      success: false,
      error: `Cannot approve a ${booking.status} booking`,
    };
  }

  // Update booking: status → CONFIRMED, approvedAt → now(), approvedByMemberId → approver
  await db
    .update(bookings)
    .set({
      status: "CONFIRMED",
      approvedAt: new Date(),
      approvedByMemberId: input.approverMemberId,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  // Fetch org, lodge, member details for emails
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      slug: organisations.slug,
      defaultApprovalNote: organisations.defaultApprovalNote,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const [lodge] = await db
    .select({ name: lodges.name })
    .from(lodges)
    .where(eq(lodges.id, booking.lodgeId));

  const [member] = await db
    .select({
      email: members.email,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.id, booking.primaryMemberId!));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const noteText = input.note ?? org?.defaultApprovalNote ?? undefined;

  // Send booking-approved email to member (fire-and-forget)
  if (member) {
    sendEmail({
      to: member.email,
      subject: `Booking approved — ${booking.bookingReference}`,
      template: React.createElement(BookingApprovedEmail, {
        orgName: org?.name ?? input.slug,
        bookingReference: booking.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        payUrl: `${appUrl}/${input.slug}/dashboard`,
        logoUrl: org?.logoUrl || undefined,
        note: noteText,
      }),
      replyTo: org?.contactEmail || undefined,
      orgName: org?.name ?? input.slug,
    });
  }

  // Send admin-booking-notification email (action: "approved")
  if (org?.contactEmail) {
    sendEmail({
      to: org.contactEmail,
      subject: `[Admin] Booking approved — ${booking.bookingReference}`,
      template: React.createElement(AdminBookingNotificationEmail, {
        orgName: org.name,
        bookingReference: booking.bookingReference,
        memberName: member
          ? `${member.firstName} ${member.lastName}`
          : "Unknown",
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        action: "approved" as const,
        adminUrl: `${appUrl}/${input.slug}/admin/bookings/${input.bookingId}`,
        logoUrl: org.logoUrl || undefined,
      }),
      orgName: org.name,
    });
  }

  revalidatePath(`/${input.slug}/admin/bookings`);
  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);

  return { success: true };
}
