"use server";

import { db } from "@/db/index";
import { chargeCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const categorySchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export async function createChargeCategory(
  input: z.infer<typeof categorySchema> & { slug: string }
) {
  const data = categorySchema.parse(input);

  const [created] = await db
    .insert(chargeCategories)
    .values({
      organisationId: data.organisationId,
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return created;
}

export async function updateChargeCategory(
  input: { id: string; slug: string } & z.infer<typeof categorySchema>
) {
  const data = categorySchema.parse(input);

  const [updated] = await db
    .update(chargeCategories)
    .set({
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(chargeCategories.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return updated;
}

export async function toggleChargeCategory(
  id: string,
  isActive: boolean,
  slug: string
) {
  await db
    .update(chargeCategories)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(chargeCategories.id, id));

  revalidatePath(`/${slug}/admin/settings`);
}
