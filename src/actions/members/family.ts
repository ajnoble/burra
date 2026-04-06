"use server";

import { db } from "@/db/index";
import { members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type LinkFamilyInput = {
  organisationId: string;
  slug: string;
  primaryMemberId: string;
  dependentMemberId: string;
};

export async function linkFamilyMember(
  input: LinkFamilyInput
): Promise<{ success: boolean; error?: string }> {
  if (input.primaryMemberId === input.dependentMemberId) {
    return { success: false, error: "You cannot link a member to themselves" };
  }

  // Check dependent exists and isn't already linked
  const [dependent] = await db
    .select({ id: members.id, primaryMemberId: members.primaryMemberId })
    .from(members)
    .where(
      and(
        eq(members.id, input.dependentMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .limit(1);

  if (!dependent) {
    return { success: false, error: "Dependent member not found" };
  }

  if (dependent.primaryMemberId) {
    return { success: false, error: "This member is already linked to a family group" };
  }

  // Check primary member exists and is not themselves a dependent (no chains)
  const [primary] = await db
    .select({ id: members.id, primaryMemberId: members.primaryMemberId })
    .from(members)
    .where(
      and(
        eq(members.id, input.primaryMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .limit(1);

  if (!primary) {
    return { success: false, error: "Primary member not found" };
  }

  if (primary.primaryMemberId) {
    return { success: false, error: "A dependent member cannot be a primary member (no chains)" };
  }

  const [updated] = await db
    .update(members)
    .set({ primaryMemberId: input.primaryMemberId, updatedAt: new Date() })
    .where(
      and(
        eq(members.id, input.dependentMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Failed to link member" };
  }

  revalidatePath(`/${input.slug}/admin/members/${input.primaryMemberId}`);
  revalidatePath(`/${input.slug}/admin/members/${input.dependentMemberId}`);
  return { success: true };
}

type UnlinkFamilyInput = {
  organisationId: string;
  slug: string;
  memberId: string;
};

export async function unlinkFamilyMember(
  input: UnlinkFamilyInput
): Promise<{ success: boolean; error?: string }> {
  const [updated] = await db
    .update(members)
    .set({ primaryMemberId: null, updatedAt: new Date() })
    .where(
      and(
        eq(members.id, input.memberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
