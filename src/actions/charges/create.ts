"use server";

import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeCreatedEmail } from "@/lib/email/templates/charge-created";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { calculateGst } from "@/lib/currency";

type CreateChargeInput = {
  organisationId: string;
  memberId: string;
  categoryId: string;
  description?: string;
  amountCents: number;
  dueDate?: string;
  createdByMemberId: string;
  slug: string;
};

type CreateChargeResult = {
  success: boolean;
  charge?: typeof oneOffCharges.$inferSelect;
  error?: string;
};

export async function createCharge(
  input: CreateChargeInput
): Promise<CreateChargeResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (input.amountCents <= 0) {
    return { success: false, error: "Amount must be greater than zero" };
  }

  const [org] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const gstAmountCents = org?.gstEnabled
    ? calculateGst(input.amountCents, org.gstRateBps)
    : 0;

  const [charge] = await db
    .insert(oneOffCharges)
    .values({
      organisationId: input.organisationId,
      memberId: input.memberId,
      categoryId: input.categoryId,
      description: input.description || null,
      amountCents: input.amountCents,
      dueDate: input.dueDate || null,
      createdByMemberId: input.createdByMemberId,
      gstAmountCents,
    })
    .returning();

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: input.createdByMemberId,
    action: "CHARGE_CREATED", entityType: "charge", entityId: charge.id,
    previousValue: null,
    newValue: { memberId: input.memberId, amountCents: input.amountCents, description: input.description ?? null, categoryId: input.categoryId },
  }).catch(console.error);

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  revalidatePath(`/${input.slug}/admin/charges`);

  const [emailData] = await db
    .select({
      email: members.email,
      categoryName: chargeCategories.name,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(members)
    .innerJoin(organisations, eq(organisations.id, input.organisationId))
    .innerJoin(chargeCategories, eq(chargeCategories.id, input.categoryId))
    .where(eq(members.id, input.memberId));

  if (emailData) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    sendEmail({
      to: emailData.email,
      subject: `New charge — ${emailData.categoryName}`,
      template: React.createElement(ChargeCreatedEmail, {
        orgName: emailData.orgName,
        categoryName: emailData.categoryName,
        description: input.description,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        payUrl: `${appUrl}/${emailData.orgSlug}/dashboard`,
        logoUrl: emailData.logoUrl || undefined,
      }),
      replyTo: emailData.contactEmail || undefined,
      orgName: emailData.orgName,
    });
  }

  return { success: true, charge };
}
