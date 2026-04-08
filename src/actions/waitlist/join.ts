"use server";

import { db } from "@/db/index";
import {
  waitlistEntries,
  members,
  seasons,
  lodges,
  availabilityCache,
  organisations,
} from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { WaitlistConfirmationEmail } from "@/lib/email/templates/waitlist-confirmation";
import { getSessionMember } from "@/lib/auth";

type JoinWaitlistInput = {
  organisationId: string;
  lodgeId: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  slug: string;
};

type JoinWaitlistResult = {
  success: boolean;
  error?: string;
  waitlistEntryId?: string;
};

export async function joinWaitlist(
  input: JoinWaitlistInput
): Promise<JoinWaitlistResult> {
  // 1. Auth check
  const session = await getSessionMember(input.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 2. Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      email: members.email,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(
      and(
        eq(members.id, session.memberId),
        eq(members.organisationId, input.organisationId)
      )
    );

  if (!member) {
    return { success: false, error: "Member not found" };
  }

  if (!member.isFinancial) {
    return {
      success: false,
      error: "Only financial members can join the waitlist",
    };
  }

  // 3. Check dates within active season
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.organisationId, input.organisationId),
        eq(seasons.isActive, true),
        lte(seasons.startDate, input.checkInDate),
        gte(seasons.endDate, input.checkOutDate)
      )
    );

  if (!season) {
    return {
      success: false,
      error: "No active season covers the requested dates",
    };
  }

  // 4. Check lodge exists for org
  const [lodge] = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(
      and(
        eq(lodges.id, input.lodgeId),
        eq(lodges.organisationId, input.organisationId)
      )
    );

  if (!lodge) {
    return { success: false, error: "Lodge not found" };
  }

  // 5. Check dates are fully booked (every night must have bookedBeds >= totalBeds)
  const availability = await db
    .select({
      date: availabilityCache.date,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, input.lodgeId),
        gte(availabilityCache.date, input.checkInDate),
        lte(availabilityCache.date, input.checkOutDate)
      )
    );

  const allFullyBooked =
    availability.length > 0 &&
    availability.every((row) => row.bookedBeds >= row.totalBeds);

  if (!allFullyBooked) {
    return {
      success: false,
      error: "Dates are not fully booked — please book directly instead",
    };
  }

  // 6. Check no duplicate WAITING entry for same member/lodge/overlapping dates
  const existing = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.memberId, session.memberId),
        eq(waitlistEntries.lodgeId, input.lodgeId),
        eq(waitlistEntries.status, "WAITING"),
        lte(waitlistEntries.checkInDate, input.checkOutDate),
        gte(waitlistEntries.checkOutDate, input.checkInDate)
      )
    );

  if (existing.length > 0) {
    return {
      success: false,
      error: "You are already on the waitlist for overlapping dates",
    };
  }

  // 7. Insert waitlist entry
  const [entry] = await db
    .insert(waitlistEntries)
    .values({
      memberId: session.memberId,
      lodgeId: input.lodgeId,
      bookingRoundId: season.id, // use season id as booking round placeholder
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      numberOfGuests: input.numberOfGuests,
      status: "WAITING",
    });

  const waitlistEntryId = (entry as { id?: string })?.id ?? "unknown";

  // 8. Send confirmation email (fire-and-forget)
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  sendEmail({
    to: member.email,
    subject: `Waitlist confirmation — ${lodge.name}`,
    template: React.createElement(WaitlistConfirmationEmail, {
      orgName: org?.name ?? input.slug,
      lodgeName: lodge.name,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      numberOfGuests: input.numberOfGuests,
      logoUrl: org?.logoUrl || undefined,
    }),
    replyTo: org?.contactEmail || undefined,
    orgName: org?.name ?? input.slug,
  });

  // 9. Revalidate path
  revalidatePath(`/${input.slug}/waitlist`);

  // 10. Return result
  return { success: true, waitlistEntryId };
}
