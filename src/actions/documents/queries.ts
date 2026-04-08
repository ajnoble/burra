"use server";

import { db } from "@/db/index";
import { documents, documentCategories, members } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";

const ACCESS_HIERARCHY: Record<string, string[]> = {
  ADMIN: ["PUBLIC", "MEMBER", "COMMITTEE", "ADMIN"],
  COMMITTEE: ["PUBLIC", "MEMBER", "COMMITTEE"],
  BOOKING_OFFICER: ["PUBLIC", "MEMBER"],
  MEMBER: ["PUBLIC", "MEMBER"],
};

type ListFilters = {
  categoryId?: string;
  accessLevel?: string;
  search?: string;
};

export async function listDocuments(organisationId: string, filters?: ListFilters) {
  const conditions = [eq(documents.organisationId, organisationId)];

  if (filters?.categoryId) {
    conditions.push(eq(documents.categoryId, filters.categoryId));
  }
  if (filters?.accessLevel) {
    conditions.push(
      eq(documents.accessLevel, filters.accessLevel as "PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN")
    );
  }
  if (filters?.search) {
    conditions.push(ilike(documents.title, `%${filters.search}%`));
  }

  return db
    .select()
    .from(documents)
    .leftJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(members, eq(members.id, documents.uploadedByMemberId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}

export async function listDocumentsForMember(
  organisationId: string,
  memberRole: string,
  search?: string
) {
  const allowedLevels = ACCESS_HIERARCHY[memberRole] ?? ["PUBLIC"];
  const conditions = [
    eq(documents.organisationId, organisationId),
    inArray(
      documents.accessLevel,
      allowedLevels as ("PUBLIC" | "MEMBER" | "COMMITTEE" | "ADMIN")[]
    ),
  ];

  if (search) {
    conditions.push(ilike(documents.title, `%${search}%`));
  }

  return db
    .select()
    .from(documents)
    .leftJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(members, eq(members.id, documents.uploadedByMemberId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}
