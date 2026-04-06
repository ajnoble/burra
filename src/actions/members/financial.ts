"use server";

import { db } from "@/db/index";
import { members, financialStatusChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { financialStatusChangeSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

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

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
