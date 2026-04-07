"use server";

import { db } from "@/db/index";
import { oneOffCharges } from "@/db/schema";
import { revalidatePath } from "next/cache";

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

  return { success: true, charge };
}
