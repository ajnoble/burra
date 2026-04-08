"use server";

import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeCreatedEmail } from "@/lib/email/templates/charge-created";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { calculateGst } from "@/lib/currency";

type BulkCreateInput = {
  organisationId: string;
  memberIds: string[];
  categoryId: string;
  amountCents: number;
  description?: string;
  dueDate?: string;
  createdByMemberId: string;
  slug: string;
};

type BulkCreateResult = {
  success: boolean;
  count?: number;
  error?: string;
};

export async function bulkCreateCharges(
  input: BulkCreateInput
): Promise<BulkCreateResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (input.memberIds.length === 0) {
    return { success: false, error: "No members selected" };
  }

  if (input.amountCents <= 0) {
    return { success: false, error: "Amount must be greater than zero" };
  }

  const [orgGst] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const gstAmountCents = orgGst?.gstEnabled
    ? calculateGst(input.amountCents, orgGst.gstRateBps)
    : 0;

  const values = input.memberIds.map((memberId) => ({
    organisationId: input.organisationId,
    memberId,
    categoryId: input.categoryId,
    description: input.description || null,
    amountCents: input.amountCents,
    dueDate: input.dueDate || null,
    createdByMemberId: input.createdByMemberId,
    gstAmountCents,
  }));

  const created = await db.insert(oneOffCharges).values(values).returning();

  // Send notification emails (fire-and-forget)
  const memberRows = await db
    .select({ id: members.id, email: members.email })
    .from(members)
    .where(eq(members.organisationId, input.organisationId));

  const memberEmailMap = new Map(memberRows.map((m) => [m.id, m.email]));

  const [catData] = await db
    .select({ name: chargeCategories.name })
    .from(chargeCategories)
    .where(eq(chargeCategories.id, input.categoryId));

  const [orgData] = await db
    .select({
      name: organisations.name,
      slug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (catData && orgData) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const memberId of input.memberIds) {
      const email = memberEmailMap.get(memberId);
      if (email) {
        sendEmail({
          to: email,
          subject: `New charge — ${catData.name}`,
          template: React.createElement(ChargeCreatedEmail, {
            orgName: orgData.name,
            categoryName: catData.name,
            description: input.description,
            amountCents: input.amountCents,
            dueDate: input.dueDate,
            payUrl: `${appUrl}/${orgData.slug}/dashboard`,
            logoUrl: orgData.logoUrl || undefined,
            gstEnabled: orgGst?.gstEnabled ?? false,
          }),
          replyTo: orgData.contactEmail || undefined,
          orgName: orgData.name,
        });
      }
    }
  }

  revalidatePath(`/${input.slug}/admin/charges`);

  return { success: true, count: created.length };
}
