import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { and, eq, isNull, lte, gte } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeDueReminderEmail } from "@/lib/email/templates/charge-due-reminder";

export async function processChargeDueReminders(): Promise<{
  remindersSent: number;
}> {
  const today = new Date();
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = sevenDaysFromNow.toISOString().split("T")[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const dueCharges = await db
    .select({
      chargeId: oneOffCharges.id,
      email: members.email,
      firstName: members.firstName,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(oneOffCharges)
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(organisations, eq(organisations.id, oneOffCharges.organisationId))
    .where(
      and(
        eq(oneOffCharges.status, "UNPAID"),
        lte(oneOffCharges.dueDate, futureStr),
        gte(oneOffCharges.dueDate, todayStr),
        isNull(oneOffCharges.reminderSentAt)
      )
    );

  let remindersSent = 0;

  for (const charge of dueCharges) {
    sendEmail({
      to: charge.email,
      subject: `Payment reminder — ${charge.categoryName}`,
      template: React.createElement(ChargeDueReminderEmail, {
        orgName: charge.orgName,
        categoryName: charge.categoryName,
        description: charge.description || undefined,
        amountCents: charge.amountCents,
        dueDate: charge.dueDate!,
        payUrl: `${appUrl}/${charge.orgSlug}/dashboard`,
        logoUrl: charge.logoUrl || undefined,
      }),
      replyTo: charge.contactEmail || undefined,
      orgName: charge.orgName,
    });

    await db
      .update(oneOffCharges)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(oneOffCharges.id, charge.chargeId));

    remindersSent++;
  }

  return { remindersSent };
}
