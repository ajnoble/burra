import { db } from "@/db/index";
import { subscriptions, members, seasons, organisations, financialStatusChanges } from "@/db/schema";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { MembershipRenewalDueEmail } from "@/lib/email/templates/membership-renewal-due";
import { FinancialStatusChangedEmail } from "@/lib/email/templates/financial-status-changed";

export async function processSubscriptionCron(): Promise<{
  remindersSent: number;
  financialStatusChanged: number;
}> {
  const today = new Date().toISOString().split("T")[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Pass 1 — Send reminders
  // Find UNPAID subscriptions where dueDate <= today AND reminderSentAt IS NULL
  const dueSubs = await db
    .select({
      subscriptionId: subscriptions.id,
      memberId: subscriptions.memberId,
      organisationId: subscriptions.organisationId,
      email: members.email,
      firstName: members.firstName,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      gstEnabled: organisations.gstEnabled,
      seasonName: seasons.name,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
    .where(
      and(
        eq(subscriptions.status, "UNPAID"),
        lte(subscriptions.dueDate, today),
        isNull(subscriptions.reminderSentAt)
      )
    );

  let remindersSent = 0;

  for (const sub of dueSubs) {
    sendEmail({
      to: sub.email,
      subject: `Membership renewal due — ${sub.seasonName}`,
      template: React.createElement(MembershipRenewalDueEmail, {
        orgName: sub.orgName,
        seasonName: sub.seasonName,
        amountCents: sub.amountCents,
        dueDate: sub.dueDate,
        payUrl: `${appUrl}/${sub.orgSlug}/dashboard`,
        logoUrl: sub.logoUrl || undefined,
        gstEnabled: sub.gstEnabled,
      }),
      replyTo: sub.contactEmail || undefined,
      orgName: sub.orgName,
    });

    await db
      .update(subscriptions)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.subscriptionId));

    remindersSent++;
  }

  // Pass 2 — Grace period expiry
  // Find UNPAID subscriptions where grace period has passed AND member is still financial
  const expiredSubs = await db
    .select({
      subscriptionId: subscriptions.id,
      memberId: subscriptions.memberId,
      organisationId: subscriptions.organisationId,
      email: members.email,
      firstName: members.firstName,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      seasonName: seasons.name,
    })
    .from(subscriptions)
    .innerJoin(
      members,
      and(eq(members.id, subscriptions.memberId), eq(members.isFinancial, true))
    )
    .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .where(
      and(
        eq(subscriptions.status, "UNPAID"),
        sql`${subscriptions.dueDate}::date + ${organisations.subscriptionGraceDays} * interval '1 day' <= ${today}::date`
      )
    );

  let financialStatusChanged = 0;

  for (const sub of expiredSubs) {
    await db
      .update(members)
      .set({ isFinancial: false, updatedAt: new Date() })
      .where(eq(members.id, sub.memberId));

    await db.insert(financialStatusChanges).values({
      organisationId: sub.organisationId,
      memberId: sub.memberId,
      isFinancial: false,
      reason: "Subscription unpaid — grace period expired",
      changedByMemberId: sub.memberId,
    });

    sendEmail({
      to: sub.email,
      subject: `Membership status updated — ${sub.orgName}`,
      template: React.createElement(FinancialStatusChangedEmail, {
        orgName: sub.orgName,
        firstName: sub.firstName,
        isFinancial: false,
        reason: "Subscription unpaid — grace period expired",
        logoUrl: sub.logoUrl || undefined,
      }),
      replyTo: sub.contactEmail || undefined,
      orgName: sub.orgName,
    });

    financialStatusChanged++;
  }

  return { remindersSent, financialStatusChanged };
}
