"use server";

import { db } from "@/db/index";
import { customFields } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createCustomFieldSchema, updateCustomFieldSchema } from "@/lib/validation-custom-fields";
import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

type CreateCustomFieldInput = {
  organisationId: string;
  name: string;
  key: string;
  type: string;
  options?: string;
  isRequired?: boolean;
  slug: string;
};

export async function createCustomField(input: CreateCustomFieldInput) {
  const { organisationId, slug, ...fields } = input;
  const parsed = createCustomFieldSchema.parse(fields);

  const [field] = await db
    .insert(customFields)
    .values({
      organisationId,
      name: parsed.name,
      key: parsed.key,
      type: parsed.type as "text" | "number" | "date" | "dropdown" | "checkbox",
      options: parsed.options ?? null,
      isRequired: parsed.isRequired,
    })
    .returning();

  const session = await getSessionMember(organisationId);
  if (session) {
    createAuditLog({
      organisationId,
      actorMemberId: session.memberId,
      action: "CUSTOM_FIELD_CREATED",
      entityType: "custom_field",
      entityId: field.id,
      previousValue: null,
      newValue: { name: field.name, key: field.key, type: field.type },
    }).catch(console.error);
  }

  revalidatePath(`/${slug}/admin/settings`);
  return field;
}

type UpdateCustomFieldInput = {
  fieldId: string;
  organisationId: string;
  name?: string;
  key?: string;
  type?: string;
  options?: string;
  isRequired?: boolean;
  slug: string;
};

export async function updateCustomField(input: UpdateCustomFieldInput) {
  const { fieldId, organisationId, slug, ...fields } = input;
  const parsed = updateCustomFieldSchema.parse(fields);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.key !== undefined) updates.key = parsed.key;
  if (parsed.type !== undefined) updates.type = parsed.type;
  if (parsed.options !== undefined) updates.options = parsed.options;
  if (parsed.isRequired !== undefined) updates.isRequired = parsed.isRequired;

  const [updated] = await db
    .update(customFields)
    .set(updates)
    .where(and(eq(customFields.id, fieldId), eq(customFields.organisationId, organisationId)))
    .returning();

  if (!updated) throw new Error("Field not found");

  const session = await getSessionMember(organisationId);
  if (session) {
    createAuditLog({
      organisationId,
      actorMemberId: session.memberId,
      action: "CUSTOM_FIELD_UPDATED",
      entityType: "custom_field",
      entityId: fieldId,
      previousValue: null,
      newValue: updates,
    }).catch(console.error);
  }

  revalidatePath(`/${slug}/admin/settings`);
  return updated;
}

export async function toggleCustomField(
  fieldId: string,
  isActive: boolean,
  slug: string
) {
  const [updated] = await db
    .update(customFields)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(customFields.id, fieldId))
    .returning();

  if (!updated) throw new Error("Field not found");
  revalidatePath(`/${slug}/admin/settings`);
  return updated;
}

export async function reorderCustomFields(
  organisationId: string,
  fieldIds: string[],
  slug: string
) {
  for (let i = 0; i < fieldIds.length; i++) {
    await db
      .update(customFields)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(customFields.id, fieldIds[i]),
          eq(customFields.organisationId, organisationId)
        )
      );
  }
  revalidatePath(`/${slug}/admin/settings`);
}

export async function getCustomFields(organisationId: string) {
  return db
    .select()
    .from(customFields)
    .where(
      and(
        eq(customFields.organisationId, organisationId),
        eq(customFields.isActive, true)
      )
    )
    .orderBy(customFields.sortOrder);
}
