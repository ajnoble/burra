"use server";

import { db } from "@/db/index";
import {
  waitlistEntries,
  lodges,
  members,
  organisations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { WaitlistSpotAvailableEmail } from "@/lib/email/templates/waitlist-spot-available";

type NotifyWaitlistInput = {
  waitlistEntryId: string;
  organisationId: string;
  slug: string;
};

type NotifyWaitlistResult = {
  success: boolean;
  error?: string;
};

export async function notifyWaitlistEntry(
  input: NotifyWaitlistInput
): Promise<NotifyWaitlistResult> {
  // 1. Auth + role check
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  // 2. Fetch entry with lodge join, verify org ownership
  const [row] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
      memberId: waitlistEntries.memberId,
      lodgeId: waitlistEntries.lodgeId,
      checkInDate: waitlistEntries.checkInDate,
      checkOutDate: waitlistEntries.checkOutDate,
      numberOfGuests: waitlistEntries.numberOfGuests,
      lodgeOrganisationId: lodges.organisationId,
      lodgeName: lodges.name,
    })
    .from(waitlistEntries)
    .leftJoin(lodges, eq(lodges.id, waitlistEntries.lodgeId))
    .where(eq(waitlistEntries.id, input.waitlistEntryId));

  if (!row || row.lodgeOrganisationId !== input.organisationId) {
    return { success: false, error: "Waitlist entry not found" };
  }

  // 3. Verify status is WAITING
  if (row.status !== "WAITING") {
    return { success: false, error: "Entry is not in WAITING status" };
  }

  // 4. Set expiry: 48 hours from now
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const notifiedAt = new Date();

  // 5. Update entry: set status=NOTIFIED, notifiedAt, expiresAt
  await db
    .update(waitlistEntries)
    .set({
      status: "NOTIFIED",
      notifiedAt,
      expiresAt,
    })
    .where(eq(waitlistEntries.id, input.waitlistEntryId));

  // 6. Fetch member details
  const [member] = await db
    .select({
      email: members.email,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.id, row.memberId));

  // 7. Fetch org details
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  // 8. Send email (fire-and-forget)
  if (member) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const bookingUrl = `${appUrl}/${input.slug}/book`;
    const expiresAtFormatted = expiresAt.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    sendEmail({
      to: member.email,
      subject: `A spot has opened up — ${row.lodgeName ?? "Lodge"}`,
      template: React.createElement(WaitlistSpotAvailableEmail, {
        orgName: org?.name ?? input.slug,
        lodgeName: row.lodgeName ?? "Lodge",
        checkInDate: row.checkInDate,
        checkOutDate: row.checkOutDate,
        numberOfGuests: row.numberOfGuests,
        bookingUrl,
        expiresAt: expiresAtFormatted,
        logoUrl: org?.logoUrl || undefined,
      }),
      replyTo: org?.contactEmail || undefined,
      orgName: org?.name ?? input.slug,
    });
  }

  // 9. Revalidate path
  revalidatePath(`/${input.slug}/admin/waitlist`);

  return { success: true };
}
