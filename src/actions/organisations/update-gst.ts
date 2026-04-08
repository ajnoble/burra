"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { validateAbn, formatAbn } from "@/lib/abn";
import { createAuditLog } from "@/lib/audit-log";

type UpdateGstInput = {
  organisationId: string;
  gstEnabled: boolean;
  abnNumber: string;
  slug: string;
};

type UpdateGstResult = {
  success: boolean;
  error?: string;
};

export async function updateGstSettings(
  input: UpdateGstInput
): Promise<UpdateGstResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (input.gstEnabled) {
    if (!input.abnNumber || !validateAbn(input.abnNumber)) {
      return { success: false, error: "A valid ABN is required when GST is enabled" };
    }
  }

  const abnFormatted = input.gstEnabled && input.abnNumber
    ? formatAbn(input.abnNumber)
    : null;

  const [updated] = await db
    .update(organisations)
    .set({
      gstEnabled: input.gstEnabled,
      abnNumber: abnFormatted,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId))
    .returning();

  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "ORGANISATION_UPDATED",
    entityType: "organisation",
    entityId: input.organisationId,
    previousValue: null,
    newValue: { gstEnabled: input.gstEnabled, abnNumber: abnFormatted },
  }).catch(console.error);

  revalidatePath(`/${input.slug}/admin/settings`);

  return { success: true };
}
