"use server";

import { db } from "@/db/index";
import { subscriptions, members, seasons, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { MembershipRenewalDueEmail } from "@/lib/email/templates/membership-renewal-due";

export async function sendSubscriptionReminder({
  subscriptionId,
  organisationId,
}: {
  subscriptionId: string;
  organisationId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const [data] = await db
      .select({
        subscriptionId: subscriptions.id,
        email: members.email,
        amountCents: subscriptions.amountCents,
        dueDate: subscriptions.dueDate,
        orgName: organisations.name,
        orgSlug: organisations.slug,
        contactEmail: organisations.contactEmail,
        logoUrl: organisations.logoUrl,
        seasonName: seasons.name,
      })
      .from(subscriptions)
      .innerJoin(members, eq(members.id, subscriptions.memberId))
      .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
      .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.organisationId, organisationId)
        )
      );

    if (!data) {
      return { success: false, error: "Subscription not found" };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    sendEmail({
      to: data.email,
      subject: `Membership renewal due — ${data.seasonName}`,
      template: React.createElement(MembershipRenewalDueEmail, {
        orgName: data.orgName,
        seasonName: data.seasonName,
        amountCents: data.amountCents,
        dueDate: data.dueDate,
        payUrl: `${appUrl}/${data.orgSlug}/dashboard`,
        logoUrl: data.logoUrl || undefined,
      }),
      replyTo: data.contactEmail || undefined,
      orgName: data.orgName,
    });

    await db
      .update(subscriptions)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function sendBulkReminders({
  organisationId,
  seasonId,
}: {
  organisationId: string;
  seasonId: string;
}): Promise<{ success: true; sent: number }> {
  const unpaidSubs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.seasonId, seasonId),
        eq(subscriptions.status, "UNPAID")
      )
    );

  let sent = 0;
  for (const sub of unpaidSubs) {
    const result = await sendSubscriptionReminder({
      subscriptionId: sub.id,
      organisationId,
    });
    if (result.success) sent++;
  }

  return { success: true, sent };
}
