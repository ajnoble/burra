"use server";

import { db } from "@/db/index";
import { communications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import type { CommunicationFilters } from "@/db/schema/communications";

type CreateDraftInput = {
  organisationId: string;
  templateId?: string;
  subject?: string;
  bodyMarkdown: string;
  smsBody?: string;
  channel: "EMAIL" | "SMS" | "BOTH";
  filters?: CommunicationFilters;
  createdByMemberId: string;
  slug: string;
};

export async function createDraft(input: CreateDraftInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (!input.bodyMarkdown.trim()) {
    return { success: false, error: "Body is required" };
  }

  const [communication] = await db
    .insert(communications)
    .values({
      organisationId: input.organisationId,
      templateId: input.templateId,
      subject: input.subject,
      bodyMarkdown: input.bodyMarkdown,
      smsBody: input.smsBody,
      channel: input.channel,
      status: "DRAFT",
      filters: input.filters ?? {},
      createdByMemberId: input.createdByMemberId,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);

  return { success: true, communication };
}

type UpdateDraftInput = {
  communicationId: string;
  organisationId: string;
  subject?: string;
  bodyMarkdown?: string;
  smsBody?: string;
  channel?: "EMAIL" | "SMS" | "BOTH";
  filters?: CommunicationFilters;
  slug: string;
};

export async function updateDraft(input: UpdateDraftInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify communication exists and is DRAFT
  const [existing] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, input.communicationId),
        eq(communications.organisationId, input.organisationId)
      )
    );

  if (!existing) {
    return { success: false, error: "Communication not found" };
  }

  if (existing.status !== "DRAFT") {
    return { success: false, error: "Can only update draft communications" };
  }

  const { communicationId, organisationId, slug, ...updates } = input;

  const [communication] = await db
    .update(communications)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(communications.id, communicationId),
        eq(communications.organisationId, organisationId)
      )
    )
    .returning();

  revalidatePath(`/${slug}/admin/communications`);

  return { success: true, communication };
}
