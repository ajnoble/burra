"use server";

import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSignedUrl } from "@/lib/supabase/storage";

const ACCESS_RANK: Record<string, number> = {
  PUBLIC: 0,
  MEMBER: 1,
  COMMITTEE: 2,
  ADMIN: 3,
};

function canAccess(memberRole: string, documentAccessLevel: string): boolean {
  const memberRank = ACCESS_RANK[memberRole] ?? ACCESS_RANK["MEMBER"];
  const docRank = ACCESS_RANK[documentAccessLevel] ?? ACCESS_RANK["ADMIN"];
  return memberRank >= docRank;
}

type DownloadResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function getDownloadUrl(
  documentId: string,
  organisationId: string,
  memberRole: string
): Promise<DownloadResult> {
  const [doc] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      fileUrl: documents.fileUrl,
      accessLevel: documents.accessLevel,
      title: documents.title,
    })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organisationId, organisationId))
    );

  if (!doc) return { success: false, error: "Document not found" };

  if (!canAccess(memberRole, doc.accessLevel)) {
    return { success: false, error: "Access denied" };
  }

  const { url, error } = await getSignedUrl(doc.fileUrl);
  if (error || !url) {
    return { success: false, error: error ?? "Failed to generate download URL" };
  }

  return { success: true, url };
}
