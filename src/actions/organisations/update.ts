"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

const updateOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  timezone: z.string().min(1),
  subscriptionGraceDays: z.number().int().min(0).max(90).optional(),
  bookingPaymentGraceDays: z.number().int().min(0).max(90).optional(),
  bookingPaymentReminderDays: z.array(z.number().int().min(1).max(90)).optional(),
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
      ...(data.bookingPaymentGraceDays !== undefined && {
        bookingPaymentGraceDays: data.bookingPaymentGraceDays,
      }),
      ...(data.bookingPaymentReminderDays !== undefined && {
        bookingPaymentReminderDays: data.bookingPaymentReminderDays,
      }),
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, data.id))
    .returning();

  const session = await getSessionMember(data.id);
  if (session) {
    createAuditLog({
      organisationId: data.id, actorMemberId: session.memberId,
      action: "ORGANISATION_UPDATED", entityType: "organisation", entityId: data.id,
      previousValue: null,
      newValue: { name: data.name, contactEmail: data.contactEmail ?? null, timezone: data.timezone },
    }).catch(console.error);
  }

  revalidatePath(`/${updated.slug}/admin/settings`);

  return updated;
}
