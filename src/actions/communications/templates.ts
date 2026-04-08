"use server";

import { db } from "@/db/index";
import { communicationTemplates } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

type CreateTemplateInput = {
  organisationId: string;
  name: string;
  subject?: string;
  bodyMarkdown: string;
  smsBody?: string;
  channel: "EMAIL" | "SMS" | "BOTH";
  createdByMemberId: string;
  slug: string;
};

export async function createTemplate(input: CreateTemplateInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }

  if (!input.bodyMarkdown.trim()) {
    return { success: false, error: "Body is required" };
  }

  const [template] = await db
    .insert(communicationTemplates)
    .values({
      organisationId: input.organisationId,
      name: input.name,
      subject: input.subject,
      bodyMarkdown: input.bodyMarkdown,
      smsBody: input.smsBody,
      channel: input.channel,
      createdByMemberId: input.createdByMemberId,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true, template };
}

type ListTemplatesInput = {
  organisationId: string;
};

export async function listTemplates(input: ListTemplatesInput) {
  const templates = await db
    .select()
    .from(communicationTemplates)
    .where(eq(communicationTemplates.organisationId, input.organisationId))
    .orderBy(desc(communicationTemplates.updatedAt));

  return { success: true, templates };
}

type UpdateTemplateInput = {
  id: string;
  organisationId: string;
  name?: string;
  subject?: string;
  bodyMarkdown?: string;
  smsBody?: string;
  channel?: "EMAIL" | "SMS" | "BOTH";
  slug: string;
};

export async function updateTemplate(input: UpdateTemplateInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const { id, organisationId, slug, ...updates } = input;

  const [template] = await db
    .update(communicationTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(communicationTemplates.id, id),
        eq(communicationTemplates.organisationId, organisationId)
      )
    )
    .returning();

  revalidatePath(`/${slug}/admin/communications`);

  return { success: true, template };
}

type DeleteTemplateInput = {
  id: string;
  organisationId: string;
  slug: string;
};

export async function deleteTemplate(input: DeleteTemplateInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  await db
    .delete(communicationTemplates)
    .where(
      and(
        eq(communicationTemplates.id, input.id),
        eq(communicationTemplates.organisationId, input.organisationId)
      )
    );

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true };
}
