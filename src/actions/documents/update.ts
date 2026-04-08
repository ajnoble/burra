"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile, deleteFile } from "@/lib/supabase/storage";
import { randomUUID } from "crypto";

type UpdateInput = {
  documentId: string;
  organisationId: string;
  title?: string;
  description?: string | null;
  categoryId?: string | null;
  accessLevel?: string;
  slug: string;
};

type ActionResult =
  | { success: true }
  | { success: false; error: string };

export async function updateDocument(input: UpdateInput): Promise<ActionResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  const setValues: Record<string, unknown> = {};
  if (input.title !== undefined) setValues.title = input.title;
  if (input.description !== undefined) setValues.description = input.description;
  if (input.categoryId !== undefined) setValues.categoryId = input.categoryId || null;
  if (input.accessLevel !== undefined) setValues.accessLevel = input.accessLevel;

  await db
    .update(documents)
    .set(setValues)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organisationId, input.organisationId)
      )
    )
    .returning();

  revalidatePath(`/${input.slug}/admin/documents`);
  revalidatePath(`/${input.slug}/documents`);
  return { success: true };
}

export async function replaceFile(formData: FormData): Promise<ActionResult> {
  const documentId = formData.get("documentId") as string;
  const organisationId = formData.get("organisationId") as string;
  const slug = formData.get("slug") as string;
  const file = formData.get("file") as File | null;

  const session = await getSessionMember(organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  if (!file) return { success: false, error: "File is required" };

  const validation = validateFile(file);
  if (!validation.valid) return { success: false, error: validation.error! };

  // Get existing document to find old file path
  const [existing] = await db
    .select({ id: documents.id, organisationId: documents.organisationId, fileUrl: documents.fileUrl })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))
    );

  if (!existing) return { success: false, error: "Document not found" };

  // Delete old file
  await deleteFile(existing.fileUrl);

  // Upload new file
  const fileId = randomUUID();
  const { path, error: uploadError } = await uploadFile(organisationId, fileId, file.name, file);
  if (uploadError) return { success: false, error: uploadError };

  // Update record
  await db
    .update(documents)
    .set({ fileUrl: path, fileSizeBytes: file.size, mimeType: file.type })
    .where(eq(documents.id, documentId))
    .returning();

  revalidatePath(`/${slug}/admin/documents`);
  revalidatePath(`/${slug}/documents`);
  return { success: true };
}
