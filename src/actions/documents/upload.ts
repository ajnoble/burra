"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile } from "@/lib/supabase/storage";
import { randomUUID } from "crypto";

type UploadResult =
  | { success: true; document: { id: string; title: string } }
  | { success: false; error: string };

export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  const organisationId = formData.get("organisationId") as string;
  const slug = formData.get("slug") as string;
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const accessLevel = (formData.get("accessLevel") as string) || "MEMBER";

  const session = await getSessionMember(organisationId);
  if (!session) return { success: false, error: "Not authenticated" };
  if (!isCommitteeOrAbove(session.role)) return { success: false, error: "Not authorised" };

  if (!file || !title) {
    return { success: false, error: "File and title are required" };
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error! };
  }

  const fileId = randomUUID();
  const { path, error: uploadError } = await uploadFile(
    organisationId,
    fileId,
    file.name,
    file
  );

  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const [doc] = await db
    .insert(documents)
    .values({
      organisationId,
      categoryId,
      title,
      description,
      fileUrl: path,
      fileSizeBytes: file.size,
      mimeType: file.type,
      accessLevel: accessLevel as "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN",
      uploadedByMemberId: session.memberId,
    })
    .returning();

  revalidatePath(`/${slug}/admin/documents`);
  revalidatePath(`/${slug}/documents`);
  return { success: true, document: { id: doc.id, title: doc.title } };
}
