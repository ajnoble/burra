"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isAdmin } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

type UpdateSmsSettingsInput = {
  organisationId: string;
  smsPreArrivalEnabled: boolean;
  smsPreArrivalHours: number;
  smsPaymentReminderEnabled: boolean;
  slug: string;
};

export async function updateSmsSettings(input: UpdateSmsSettingsInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isAdmin(session.role)) {
    return { success: false, error: "Unauthorized - admin only" };
  }

  await db
    .update(organisations)
    .set({
      smsPreArrivalEnabled: input.smsPreArrivalEnabled,
      smsPreArrivalHours: input.smsPreArrivalHours,
      smsPaymentReminderEnabled: input.smsPaymentReminderEnabled,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId));

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: session.memberId,
    action: "SMS_SETTINGS_UPDATED", entityType: "organisation", entityId: input.organisationId,
    previousValue: null,
    newValue: { smsPreArrivalEnabled: input.smsPreArrivalEnabled, smsPreArrivalHours: input.smsPreArrivalHours, smsPaymentReminderEnabled: input.smsPaymentReminderEnabled },
  }).catch(console.error);

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true };
}
