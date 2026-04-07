"use server";

import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeCreatedEmail } from "@/lib/email/templates/charge-created";

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
  if (input.amountCents <= 0) {
    return { success: false, error: "Amount must be greater than zero" };
  }

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
    })
    .returning();

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
