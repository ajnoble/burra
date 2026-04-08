"use server";

import { db } from "@/db/index";
import { documentCategories, documents } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

const categorySchema = z.object({
  organisationId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export async function listDocumentCategories(organisationId: string) {
  return db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.organisationId, organisationId))
    .orderBy(asc(documentCategories.sortOrder));
}

export async function createDocumentCategory(
  input: { organisationId: string; name: string; description?: string; sortOrder?: number; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const [category] = await db
    .insert(documentCategories)
    .values({
      organisationId: parsed.data.organisationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const, category };
}

export async function updateDocumentCategory(
  input: { id: string; organisationId: string; name: string; description?: string; sortOrder?: number; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const [updated] = await db
    .update(documentCategories)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    })
    .where(eq(documentCategories.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const, category: updated };
}

export async function deleteDocumentCategory(
  input: { id: string; organisationId: string; slug: string }
) {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false as const, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false as const, error: "Not authorised" };

  // Nullify categoryId on documents in this category
  await db
    .update(documents)
    .set({ categoryId: null })
    .where(eq(documents.categoryId, input.id));

  // Delete the category
  await db.delete(documentCategories).where(eq(documentCategories.id, input.id));

  revalidatePath(`/${input.slug}/admin/documents`);
  return { success: true as const };
}
