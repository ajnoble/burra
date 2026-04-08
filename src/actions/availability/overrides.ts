"use server";

import { db } from "@/db/index";
import { availabilityOverrides, lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createOverrideSchema, updateOverrideSchema } from "./schemas";
import { rebuildAvailabilityCache } from "./rebuild";
import { getSessionMember } from "@/lib/auth";

type CreateOverrideInput = {
  lodgeId: string;
  startDate: string;
  endDate: string;
  type: "CLOSURE" | "REDUCTION" | "EVENT";
  bedReduction?: number;
  reason?: string;
  slug: string;
};

type UpdateOverrideInput = {
  id: string;
  startDate?: string;
  endDate?: string;
  type?: "CLOSURE" | "REDUCTION" | "EVENT";
  bedReduction?: number | null;
  reason?: string | null;
  slug: string;
};

type DeleteOverrideInput = {
  id: string;
  slug: string;
};

export async function createAvailabilityOverride(
  input: CreateOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = createOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Look up lodge to get org ID and total beds
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds, organisationId: lodges.organisationId })
    .from(lodges)
    .where(eq(lodges.id, data.lodgeId));

  if (!lodge) {
    return { success: false, error: "Lodge not found" };
  }

  // Resolve the current user's member ID
  const session = await getSessionMember(lodge.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  await db
    .insert(availabilityOverrides)
    .values({
      lodgeId: data.lodgeId,
      startDate: data.startDate,
      endDate: data.endDate,
      type: data.type,
      bedReduction: data.bedReduction ?? null,
      reason: data.reason ?? null,
      createdByMemberId: session.memberId,
    })
    .returning();

  // Rebuild cache for affected dates
  await rebuildAvailabilityCache({
    lodgeId: lodge.id,
    totalBeds: lodge.totalBeds,
    startDate: data.startDate,
    endDate: data.endDate,
  });

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}

export async function updateAvailabilityOverride(
  input: UpdateOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = updateOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Get the existing override to know old date range
  const [existing] = await db
    .select()
    .from(availabilityOverrides)
    .where(eq(availabilityOverrides.id, input.id));

  if (!existing) {
    return { success: false, error: "Override not found" };
  }

  const [updated] = await db
    .update(availabilityOverrides)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(availabilityOverrides.id, input.id))
    .returning();

  // Rebuild cache for both old and new date ranges
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(eq(lodges.id, existing.lodgeId));

  if (lodge) {
    const minStart = [existing.startDate, updated.startDate].sort()[0];
    const maxEnd = [existing.endDate, updated.endDate].sort().reverse()[0];

    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: minStart,
      endDate: maxEnd,
    });
  }

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}

export async function deleteAvailabilityOverride(
  input: DeleteOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const [deleted] = await db
    .delete(availabilityOverrides)
    .where(eq(availabilityOverrides.id, input.id))
    .returning();

  if (!deleted) {
    return { success: false, error: "Override not found" };
  }

  // Rebuild cache for the deleted override's date range
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(eq(lodges.id, deleted.lodgeId));

  if (lodge) {
    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: deleted.startDate,
      endDate: deleted.endDate,
    });
  }

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}
