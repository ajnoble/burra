"use server";

import { db } from "@/db/index";
import { waitlistEntries, lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

type RemoveWaitlistEntryInput = {
  waitlistEntryId: string;
  organisationId: string;
  slug: string;
};

type RemoveWaitlistEntryResult = {
  success: boolean;
  error?: string;
};

export async function removeWaitlistEntry(
  input: RemoveWaitlistEntryInput
): Promise<RemoveWaitlistEntryResult> {
  // 1. Auth + role check
  const session = await getSessionMember(input.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Not authorised" };
  }

  // 2. Fetch entry with lodge join to verify org ownership
  const [entry] = await db
    .select()
    .from(waitlistEntries)
    .leftJoin(lodges, eq(lodges.id, waitlistEntries.lodgeId))
    .where(eq(waitlistEntries.id, input.waitlistEntryId));

  if (!entry || entry.lodges?.organisationId !== input.organisationId) {
    return { success: false, error: "Waitlist entry not found" };
  }

  // 3. Delete the entry
  await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, input.waitlistEntryId));

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: session.memberId,
    action: "WAITLIST_REMOVED", entityType: "waitlistEntry", entityId: input.waitlistEntryId,
    previousValue: { status: entry.waitlist_entries.status }, newValue: null,
  }).catch(console.error);

  // 4. Revalidate path
  revalidatePath(`/${input.slug}/admin/waitlist`);

  return { success: true };
}
