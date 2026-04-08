"use server";

import { db } from "@/db/index";
import { customFields, customFieldValues } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type SaveInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  values: Array<{ fieldId: string; value: string }>;
};

export async function saveCustomFieldValues(input: SaveInput) {
  const { memberId, slug, values } = input;

  for (const { fieldId, value } of values) {
    await db
      .insert(customFieldValues)
      .values({
        customFieldId: fieldId,
        memberId,
        value,
      })
      .onConflictDoUpdate({
        target: [customFieldValues.customFieldId, customFieldValues.memberId],
        set: { value, updatedAt: new Date() },
      });
  }

  if (values.length > 0) {
    revalidatePath(`/${slug}/admin/members/${memberId}`);
  }
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
