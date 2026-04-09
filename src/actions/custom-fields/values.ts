"use server";

import { db } from "@/db/index";
import { customFields, customFieldValues } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { validateCustomFieldValue } from "@/lib/validation-custom-fields";

type SaveInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  values: Array<{ fieldId: string; value: string }>;
};

export async function saveCustomFieldValues(input: SaveInput) {
  const { memberId, organisationId, slug, values } = input;

  if (values.length === 0) return;

  // Fetch field definitions for validation
  const fieldIds = values.map((v) => v.fieldId);
  const fieldDefs = await db
    .select({
      id: customFields.id,
      type: customFields.type,
      options: customFields.options,
    })
    .from(customFields)
    .where(
      and(
        eq(customFields.organisationId, organisationId),
        inArray(customFields.id, fieldIds)
      )
    );
  const fieldMap = new Map(fieldDefs.map((f) => [f.id, f]));

  for (const { fieldId, value } of values) {
    const fieldDef = fieldMap.get(fieldId);
    if (!fieldDef) continue;

    // Validate value by type
    if (value !== "") {
      const result = validateCustomFieldValue(fieldDef.type, value, fieldDef.options);
      if (!result.valid) continue; // skip invalid values silently
    }

    // Normalize checkbox values
    let normalizedValue = value;
    if (fieldDef.type === "checkbox" && value !== "") {
      const truthy = ["true", "yes", "1"];
      normalizedValue = truthy.includes(value.toLowerCase()) ? "true" : "false";
    }

    await db
      .insert(customFieldValues)
      .values({
        customFieldId: fieldId,
        memberId,
        value: normalizedValue,
      })
      .onConflictDoUpdate({
        target: [customFieldValues.customFieldId, customFieldValues.memberId],
        set: { value: normalizedValue, updatedAt: new Date() },
      });
  }

  revalidatePath(`/${slug}/admin/members/${memberId}`);
}

export async function getCustomFieldValues(
  memberId: string,
  organisationId: string
) {
  return db
    .select({
      value: customFieldValues,
      field: {
        id: customFields.id,
        name: customFields.name,
        key: customFields.key,
        type: customFields.type,
        options: customFields.options,
        isRequired: customFields.isRequired,
        sortOrder: customFields.sortOrder,
      },
    })
    .from(customFieldValues)
    .innerJoin(customFields, eq(customFields.id, customFieldValues.customFieldId))
    .where(
      and(
        eq(customFieldValues.memberId, memberId),
        eq(customFields.organisationId, organisationId),
        eq(customFields.isActive, true)
      )
    );
}
