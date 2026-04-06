"use server";

import { db } from "@/db/index";
import { organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const roleSchema = z.object({
  role: z.enum(["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"]),
});

type UpdateRoleInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  role: string;
};

export async function updateMemberRole(
  input: UpdateRoleInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = roleSchema.safeParse({ role: input.role });
  if (!parsed.success) {
    return { success: false, error: "Invalid role" };
  }

  const [updated] = await db
    .update(organisationMembers)
    .set({ role: parsed.data.role })
    .where(
      and(
        eq(organisationMembers.memberId, input.memberId),
        eq(organisationMembers.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found in organisation" };
  }

  revalidatePath(`/${input.slug}/admin/members`);
  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
