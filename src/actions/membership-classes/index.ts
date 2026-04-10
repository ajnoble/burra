"use server";

import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";

const classSchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
  annualFeeCents: z.number().int().nonnegative().nullable().optional(),
});

export async function createMembershipClass(
  input: z.infer<typeof classSchema> & { slug: string }
) {
  const data = classSchema.parse(input);

  const [created] = await db
    .insert(membershipClasses)
    .values({
      organisationId: data.organisationId,
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
      annualFeeCents: data.annualFeeCents ?? null,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return created;
}

export async function updateMembershipClass(
  input: { id: string; slug: string } & z.infer<typeof classSchema>
) {
  const data = classSchema.parse(input);

  const [updated] = await db
    .update(membershipClasses)
    .set({
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
      annualFeeCents: data.annualFeeCents ?? null,
      updatedAt: new Date(),
    })
    .where(eq(membershipClasses.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return updated;
}

export async function toggleMembershipClass(
  id: string,
  isActive: boolean,
  slug: string
) {
  await db
    .update(membershipClasses)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(membershipClasses.id, id));

  revalidatePath(`/${slug}/admin/settings`);
}

export async function setGuestClass(
  organisationId: string,
  membershipClassId: string,
  slug: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession(organisationId);
    requireRole(session, "ADMIN");

    // Unset existing guest class
    await db
      .update(membershipClasses)
      .set({ isGuestClass: false })
      .where(
        and(
          eq(membershipClasses.organisationId, organisationId),
          eq(membershipClasses.isGuestClass, true)
        )
      );

    // Set new one
    await db
      .update(membershipClasses)
      .set({ isGuestClass: true, updatedAt: new Date() })
      .where(
        and(
          eq(membershipClasses.id, membershipClassId),
          eq(membershipClasses.organisationId, organisationId)
        )
      );

    revalidatePath(`/${slug}/admin/settings`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
