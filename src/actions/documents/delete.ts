"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { deleteFile } from "@/lib/supabase/storage";

type DeleteInput = {
  documentId: string;
  organisationId: string;
  slug: string;
};

type DeleteResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteDocument(input: DeleteInput): Promise<DeleteResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  // Find document to get file path
  const [existing] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      fileUrl: documents.fileUrl,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organisationId, input.organisationId)
      )
    );

  if (!existing) return { success: false, error: "Document not found" };

  // Delete from storage
  await deleteFile(existing.fileUrl);

  // Delete from DB
  await db.delete(documents).where(eq(documents.id, input.documentId));

  revalidatePath(`/${input.slug}/admin/documents`);
  revalidatePath(`/${input.slug}/documents`);
  return { success: true };
}
