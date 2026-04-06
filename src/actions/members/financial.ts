"use server";

import { db } from "@/db/index";
import { members, financialStatusChanges, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { financialStatusChangeSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { FinancialStatusChangedEmail } from "@/lib/email/templates/financial-status-changed";

type UpdateFinancialInput = {
  memberId: string;
  organisationId: string;
  changedByMemberId: string;
  slug: string;
  isFinancial: boolean;
  reason: string;
};

export async function updateFinancialStatus(
  input: UpdateFinancialInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = financialStatusChangeSchema.safeParse({
    isFinancial: input.isFinancial,
    reason: input.reason,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const [updated] = await db
    .update(members)
    .set({ isFinancial: parsed.data.isFinancial, updatedAt: new Date() })
    .where(
      and(eq(members.id, input.memberId), eq(members.organisationId, input.organisationId))
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  await db.insert(financialStatusChanges).values({
    organisationId: input.organisationId,
    memberId: input.memberId,
    isFinancial: parsed.data.isFinancial,
    reason: parsed.data.reason,
    changedByMemberId: input.changedByMemberId,
  });

  // Fetch org details for email
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  // Send financial status changed email (fire-and-forget)
  sendEmail({
    to: updated.email,
    subject: `Membership status updated — ${org?.name ?? input.slug}`,
    template: React.createElement(FinancialStatusChangedEmail, {
      orgName: org?.name ?? input.slug,
      firstName: updated.firstName,
      isFinancial: parsed.data.isFinancial,
      reason: parsed.data.reason,
      logoUrl: org?.logoUrl || undefined,
    }),
    replyTo: org?.contactEmail || undefined,
    orgName: org?.name ?? input.slug,
  });

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
