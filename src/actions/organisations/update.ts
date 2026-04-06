"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  timezone: z.string().min(1),
  subscriptionGraceDays: z.number().int().min(0).max(90).optional(),
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export async function updateOrganisation(input: UpdateOrgInput) {
  const data = updateOrgSchema.parse(input);

  const [updated] = await db
    .update(organisations)
    .set({
      name: data.name,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      websiteUrl: data.websiteUrl || null,
      address: data.address || null,
      timezone: data.timezone,
      ...(data.subscriptionGraceDays !== undefined && {
        subscriptionGraceDays: data.subscriptionGraceDays,
      }),
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, data.id))
    .returning();

  revalidatePath(`/${updated.slug}/admin/settings`);

  return updated;
}
