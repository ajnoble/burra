"use server";

import { db } from "@/db/index";
import { members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateMemberSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import { createAuditLog, diffChanges } from "@/lib/audit-log";

type UpdateMemberInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  memberNumber?: string;
  membershipClassId?: string;
  notes?: string;
};

export async function updateMember(
  input: UpdateMemberInput
): Promise<{ success: boolean; error?: string }> {
  const { memberId, organisationId, slug, ...fields } = input;

  const parsed = updateMemberSchema.safeParse(fields);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone || null;
  if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth || null;
  if (data.memberNumber !== undefined) updates.memberNumber = data.memberNumber || null;
  if (data.notes !== undefined) updates.notes = data.notes || null;
  if (input.membershipClassId !== undefined) updates.membershipClassId = input.membershipClassId;

  const [currentMember] = await db
    .select({ firstName: members.firstName, lastName: members.lastName, email: members.email, phone: members.phone, dateOfBirth: members.dateOfBirth, memberNumber: members.memberNumber, membershipClassId: members.membershipClassId, notes: members.notes })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organisationId, organisationId)));

  const [updated] = await db
    .update(members)
    .set(updates)
    .where(and(eq(members.id, memberId), eq(members.organisationId, organisationId)))
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  const session = await getSessionMember(organisationId);
  if (session && currentMember) {
    const updatedFields: Record<string, unknown> = {};
    if (data.firstName !== undefined) updatedFields.firstName = data.firstName;
    if (data.lastName !== undefined) updatedFields.lastName = data.lastName;
    if (data.email !== undefined) updatedFields.email = data.email;
    if (data.phone !== undefined) updatedFields.phone = data.phone || null;
    if (data.dateOfBirth !== undefined) updatedFields.dateOfBirth = data.dateOfBirth || null;
    if (data.memberNumber !== undefined) updatedFields.memberNumber = data.memberNumber || null;
    if (data.notes !== undefined) updatedFields.notes = data.notes || null;
    if (input.membershipClassId !== undefined) updatedFields.membershipClassId = input.membershipClassId;
    const diff = diffChanges(currentMember as Record<string, unknown>, { ...(currentMember as Record<string, unknown>), ...updatedFields });
    if (Object.keys(diff.newValue).length > 0) {
      createAuditLog({
        organisationId,
        actorMemberId: session.memberId,
        action: "MEMBER_UPDATED",
        entityType: "member",
        entityId: memberId,
        previousValue: diff.previousValue,
        newValue: diff.newValue,
      }).catch(console.error);
    }
  }

  revalidatePath(`/${slug}/admin/members`);
  revalidatePath(`/${slug}/admin/members/${memberId}`);
  return { success: true };
}
